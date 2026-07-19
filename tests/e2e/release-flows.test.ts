import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentAdapter,
  AgentProfile,
  AgentRequest,
  AgentStreamEvent,
} from '../../src/agent/adapter'
import { prepareSelectionText } from '../../src/context/extract-selection'
import type { ChatSession, ContextItem } from '../../src/context/types'
import { sendRuntimeRequest, type RuntimeMessenger } from '../../src/messaging/messages'
import { createRuntimeMessageRouter } from '../../src/messaging/router'
import {
  BackgroundController,
  SELECTION_CONTEXT_MENU_ID,
  type BackgroundPorts,
} from '../../src/runtime/background-controller'
import { captureActivePage } from '../../src/runtime/page-capture'
import { SessionRepository } from '../../src/storage/session-repository'
import { captureBrowserContext } from '../../src/stores/browser-capture'
import { createChatStore } from '../../src/stores/chat'
import { createContextStore } from '../../src/stores/context'
import { MemoryStorage } from '../storage/memory-storage'

const profile: AgentProfile = {
  id: 'profile-1',
  name: 'E2E profile',
  adapter: 'openai-compatible',
  baseUrl: 'https://agent.example/v1',
  chatPath: 'chat/completions',
  authHeader: 'Authorization',
  authScheme: 'Bearer',
  apiKeyStorageMode: 'session',
  requestTimeoutMs: 1_000,
  maxContextItemChars: 80,
  maxTotalContextChars: 200,
  createdAt: 1,
  updatedAt: 1,
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('release-critical extension flows', () => {
  it('durably transfers a context-menu selection into the recoverable side-panel session', async () => {
    const storage = new MemoryStorage()
    const sessions = new SessionRepository(storage)
    const lifecycle: string[] = []
    const ids = ['context-1', 'capture-1']
    const controller = new BackgroundController(
      sessions,
      backgroundPorts(lifecycle),
      () => ids.shift() ?? 'unexpected-id',
      () => 42,
    )

    const result = await controller.handleContextMenuClick(
      {
        menuItemId: SELECTION_CONTEXT_MENU_ID,
        selectionText:
          '  A durable selection with whitespace.\r\n\r\n\r\nIt survives panel startup.  ',
        pageUrl: 'https://source.example/article#selected',
      },
      { id: 7, title: 'Source article', windowId: 9 },
    )

    expect(result).toMatchObject({ ok: true })
    expect(lifecycle).toEqual(['opened', 'notified'])
    expect(await sessions.listPendingCaptures()).toHaveLength(1)

    const messenger = runtimeMessenger(sessions)
    const listed = await sendRuntimeRequest(messenger, { type: 'pending-captures:list' })
    expect(listed.ok).toBe(true)
    if (!listed.ok) return

    let currentItems: readonly ContextItem[] = []
    const contextStore = createContextStore({
      capture: vi.fn(),
      async persist(items) {
        currentItems = [...items]
        await sessions.saveActiveSession({
          id: 'session-1',
          profileId: profile.id,
          contextItems: [...items],
          messages: [],
          createdAt: 42,
          updatedAt: 43,
        })
      },
    })
    const acknowledged: string[] = []
    for (const pending of listed.value) {
      const prepared = prepareSelectionText(pending.context.text, 60)
      const inserted = await contextStore.add({
        ...pending.context,
        text: prepared.text,
        originalCharCount: prepared.originalCharCount,
        truncated: prepared.truncated,
      })
      if (inserted) acknowledged.push(pending.id)
    }
    const acknowledgement = await sendRuntimeRequest(messenger, {
      type: 'pending-captures:ack',
      captureIds: acknowledged,
    })

    expect(acknowledgement).toEqual({ ok: true, value: { removed: 1 } })
    expect(await sessions.listPendingCaptures()).toEqual([])
    expect(currentItems).toMatchObject([
      {
        id: 'context-1',
        title: 'Source article',
        url: 'https://source.example/article#selected',
        tabId: 7,
        originalCharCount: 64,
        truncated: true,
      },
    ])
    expect(await sessions.loadActiveSession()).toMatchObject({
      id: 'session-1',
      contextItems: [{ id: 'context-1', truncated: true }],
    })
  })

  it('excludes hidden nodes and form data from an injected page snapshot', async () => {
    document.title = 'Private form page'
    document.body.innerHTML = `
      <main>
        <h1>Visible article</h1>
        <p>This visible paragraph is safe to capture.</p>
        <p hidden>Hidden account number 1111</p>
        <p aria-hidden="true">Hidden account number 2222</p>
        <p style="display: none">Hidden account number 3333</p>
        <input name="password" type="password" value="form-secret">
        <textarea name="notes">private form notes</textarea>
        <select><option>private selection</option></select>
      </main>
    `
    let serializedHtml = ''
    const executeScript = vi.fn(
      async (options: {
        target: { tabId: number }
        func: () => { html: string; title: string; url: string }
      }) => {
        const result = { ...options.func(), url: 'https://source.example/form' }
        serializedHtml = result.html
        return [{ result }]
      },
    )

    const result = await captureActivePage(
      {
        query: vi
          .fn()
          .mockResolvedValue([
            { id: 17, title: 'Private form page', url: 'https://source.example/form' },
          ]),
      },
      { executeScript },
      1_000,
      () => 'context-page',
      () => 50,
    )

    if (!result.ok) throw new Error(JSON.stringify(result.error))

    expect(result).toMatchObject({
      ok: true,
      context: { id: 'context-page', url: 'https://source.example/form', tabId: 17 },
    })
    expect(result.context.text).toContain('Visible article')
    expect(result.context.text).toContain('safe to capture')
    expect(result.context.text).not.toMatch(/1111|2222|3333|form-secret|private form notes/)
    expect(serializedHtml).not.toMatch(/input|textarea|select|1111|2222|3333|form-secret/)
  })

  it('allows a user to recover from a denied page permission on a later capture attempt', async () => {
    let allowPermission = false
    let permissionGranted = false
    const executeScript = vi.fn(async () => {
      if (!permissionGranted) throw new Error('Missing host permission')
      return [
        {
          result: {
            text: 'Recovered selection',
            title: 'Permission source',
            url: 'https://permission.example/article',
          },
        },
      ]
    })
    const request = vi.fn(async () => {
      permissionGranted = allowPermission
      return permissionGranted
    })
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi
          .fn()
          .mockResolvedValue([
            { id: 21, title: 'Permission source', url: 'https://permission.example/article' },
          ]),
      },
      scripting: { executeScript },
      permissions: {
        contains: vi.fn(async () => permissionGranted),
        request,
        remove: vi.fn(),
      },
      extension: { isAllowedFileSchemeAccess: vi.fn().mockResolvedValue(false) },
    } as unknown as typeof chrome)

    const denied = await captureBrowserContext('selection', 1_000)
    expect(denied).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })

    allowPermission = true
    const recovered = await captureBrowserContext('selection', 1_000)

    if (!recovered.ok) throw new Error(JSON.stringify(recovered.error))

    expect(recovered).toMatchObject({
      ok: true,
      context: {
        kind: 'selection',
        title: 'Permission source',
        url: 'https://permission.example/article',
        text: 'Recovered selection',
        tabId: 21,
      },
    })
    expect(request).toHaveBeenCalledTimes(2)
    expect(executeScript).toHaveBeenCalledTimes(3)
  })

  it('restores source snapshots from different tabs without replacing them with current-tab data', async () => {
    const storage = new MemoryStorage()
    const sessions = new SessionRepository(storage)
    const saved = sessionWithMultipleSources()
    await sessions.saveActiveSession(saved)

    const restored = await sessions.loadActiveSession()
    expect(restored).not.toBeNull()
    if (!restored) return

    const contextStore = createContextStore({
      capture: vi.fn(),
      persist: vi.fn(async () => undefined),
    })
    contextStore.hydrate(restored.contextItems)
    let agentRequest: AgentRequest | undefined
    const adapter: AgentAdapter = {
      testConnection: vi.fn(),
      async *stream(request): AsyncIterable<AgentStreamEvent> {
        agentRequest = request
        yield { type: 'completed' }
      },
    }
    const chatStore = createChatStore({
      adapter,
      loadApiKey: vi.fn(async () => 'secret'),
      persist: vi.fn(async () => undefined),
      createId: sequentialIds(),
      now: () => 100,
    })
    chatStore.hydrate(restored)

    await expect(
      chatStore.send('Compare the two captured sources.', profile, contextStore.state.items),
    ).resolves.toBe(true)

    const latest = agentRequest?.messages.at(-1)?.content ?? ''
    expect(latest).toContain('title="Tab A article" url="https://a.example/article"')
    expect(latest).toContain('Snapshot from tab A')
    expect(latest).toContain('title="Tab B article" url="https://b.example/article"')
    expect(latest).toContain('Snapshot from tab B')
    expect(latest).not.toContain('currently-active.example')
    expect(contextStore.state.items.map(({ tabId }) => tabId)).toEqual([7, 8])
  })
})

function backgroundPorts(events: string[]): BackgroundPorts {
  return {
    registerSelectionContextMenu: vi.fn().mockResolvedValue(undefined),
    enableActionClickSidePanel: vi.fn().mockResolvedValue(undefined),
    openSidePanel: vi.fn(async () => {
      events.push('opened')
    }),
    notifyPendingCapturesChanged: vi.fn(async () => {
      events.push('notified')
    }),
  }
}

function runtimeMessenger(sessions: SessionRepository): RuntimeMessenger {
  const router = createRuntimeMessageRouter({
    'pending-captures:list': async () => sessions.listPendingCaptures(),
    'pending-captures:ack': async ({ captureIds }) => ({
      removed: await sessions.acknowledgePendingCaptures(captureIds),
    }),
  })

  return {
    async sendMessage(message) {
      return await new Promise((resolve, reject) => {
        const keepChannelOpen = router(message, {}, resolve)
        if (!keepChannelOpen) reject(new Error('The runtime message was not handled.'))
      })
    },
  }
}

function sessionWithMultipleSources(): ChatSession {
  return {
    id: 'session-restore',
    profileId: profile.id,
    contextItems: [
      {
        id: 'context-a',
        kind: 'selection',
        title: 'Tab A article',
        url: 'https://a.example/article',
        text: 'Snapshot from tab A',
        originalCharCount: 19,
        truncated: false,
        tabId: 7,
        capturedAt: 10,
      },
      {
        id: 'context-b',
        kind: 'page',
        title: 'Tab B article',
        url: 'https://b.example/article',
        text: 'Snapshot from tab B',
        originalCharCount: 19,
        truncated: false,
        tabId: 8,
        capturedAt: 20,
      },
    ],
    messages: [
      {
        id: 'message-history',
        role: 'user',
        content: 'Remember these sources.',
        status: 'complete',
        createdAt: 30,
      },
    ],
    createdAt: 1,
    updatedAt: 30,
  }
}

function sequentialIds(): () => string {
  let index = 0
  return () => `message-${++index}`
}
