import { describe, expect, it, vi } from 'vitest'

import type {
  AgentAdapter,
  AgentProfile,
  AgentRequest,
  AgentStreamEvent,
} from '../../src/agent/adapter'
import { applyTotalContextLimit } from '../../src/context/truncate'
import type { ChatMessage, ContextItem } from '../../src/context/types'
import { createChatStore, limitHistoryByRounds } from '../../src/stores/chat'

const profile: AgentProfile = {
  id: 'profile-1',
  name: 'Test',
  adapter: 'openai-compatible',
  baseUrl: 'https://example.com/v1',
  chatPath: 'chat/completions',
  models: [],
  authHeader: 'Authorization',
  authScheme: 'Bearer',
  apiKeyStorageMode: 'session',
  requestTimeoutMs: 60_000,
  maxContextItemChars: 50_000,
  maxTotalContextChars: 100_000,
  createdAt: 1,
  updatedAt: 1,
}

describe('chat store', () => {
  it('streams content and never persists the API key in message state', async () => {
    const stream = vi.fn(async function* (request: AgentRequest): AsyncIterable<AgentStreamEvent> {
      expect(request.apiKey).toBe('secret-value')
      yield { type: 'content-delta', text: 'Hello' }
      yield { type: 'content-delta', text: ' world' }
      yield { type: 'completed' }
    })
    const adapter: AgentAdapter = {
      testConnection: vi.fn(),
      stream,
    }
    const store = createChatStore({
      adapter,
      loadApiKey: vi.fn(async () => 'secret-value'),
      persist: vi.fn(async () => undefined),
      createId: sequentialIds(),
      now: () => 10,
    })

    expect(await store.send('Question', profile, [])).toBe(true)
    expect(store.state.messages).toMatchObject([
      { role: 'user', content: 'Question', status: 'complete' },
      { role: 'assistant', content: 'Hello world', status: 'complete' },
    ])
    expect(JSON.stringify(store.state)).not.toContain('secret-value')
  })

  it('prevents a duplicate send while a request is active', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: AgentAdapter = {
      testConnection: vi.fn(),
      async *stream(): AsyncIterable<AgentStreamEvent> {
        await gate
        yield { type: 'completed' }
      },
    }
    const store = createChatStore({
      adapter,
      loadApiKey: vi.fn(async () => 'secret-value'),
      persist: vi.fn(async () => undefined),
      createId: sequentialIds(),
      now: () => 10,
    })

    const first = store.send('First', profile, [])
    await vi.waitFor(() => expect(store.active.value).toBe(true))
    expect(await store.send('Second', profile, [])).toBe(false)
    release?.()
    await first

    expect(store.state.messages.filter((message) => message.role === 'user')).toHaveLength(1)
  })

  it('maps multi-item overflow to the exact text sent in the request', async () => {
    let sentRequest: AgentRequest | undefined
    const stream = vi.fn(async function* (request: AgentRequest): AsyncIterable<AgentStreamEvent> {
      sentRequest = request
      yield { type: 'completed' }
    })
    const store = createChatStore({
      adapter: { testConnection: vi.fn(), stream },
      loadApiKey: vi.fn(async () => 'secret-value'),
      persist: vi.fn(async () => undefined),
      createId: sequentialIds(),
      now: () => 10,
    })

    const contextItems = [
      createContextItem('context-1', 'First', 'a'.repeat(30)),
      createContextItem('context-2', 'Second', 'b'.repeat(80)),
      createContextItem('context-3', 'Third', 'c'.repeat(10)),
    ]
    const maxTotalContextChars = 90
    const limitedItems = applyTotalContextLimit(contextItems, maxTotalContextChars)

    await store.send('Question', { ...profile, maxTotalContextChars }, contextItems)

    const latest = sentRequest?.messages.at(-1)?.content ?? ''
    expect(limitedItems.map((item) => item.id)).toEqual(['context-1', 'context-2'])
    expect(latest).toContain('title="First"')
    expect(latest).toContain(
      `<context-item kind="selection" title="Second" url="https://example.com/context-2">\n${limitedItems[1]?.text}\n</context-item>`,
    )
    expect(latest).not.toContain('title="Third"')
  })

  it('marks interrupted streaming messages as errors when restoring', () => {
    const store = createChatStore({
      adapter: { testConnection: vi.fn(), stream: vi.fn() },
      loadApiKey: vi.fn(),
      persist: vi.fn(),
      createId: sequentialIds(),
      now: () => 10,
    })

    store.hydrate({
      id: 'session-1',
      profileId: profile.id,
      contextItems: [],
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          content: '',
          createdAt: 1,
          status: 'streaming',
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    })

    expect(store.state.messages[0]).toMatchObject({
      status: 'error',
      content: 'The response was interrupted.',
    })
  })

  it('snapshots the sent context items onto the user message', async () => {
    const store = createChatStore({
      adapter: {
        testConnection: vi.fn(),
        async *stream(): AsyncIterable<AgentStreamEvent> {
          yield { type: 'completed' }
        },
      },
      loadApiKey: vi.fn(async () => 'secret-value'),
      persist: vi.fn(async () => undefined),
      createId: sequentialIds(),
      now: () => 10,
    })

    await store.send('Question', profile, [createContextItem('context-1', 'Selection', 'abc')])

    expect(store.state.messages[0]?.contextItems?.map((item) => item.id)).toEqual(['context-1'])
  })
})

describe('limitHistoryByRounds', () => {
  const messages: ChatMessage[] = [
    historyMessage('u1', 'user'),
    historyMessage('a1', 'assistant'),
    historyMessage('u2', 'user'),
    historyMessage('a2', 'assistant'),
    historyMessage('u3', 'user'),
    historyMessage('a3', 'assistant'),
  ]

  it('keeps only the last N user turns and their replies', () => {
    expect(limitHistoryByRounds(messages, 2).map((message) => message.id)).toEqual([
      'u2',
      'a2',
      'u3',
      'a3',
    ])
  })

  it('keeps the whole history when the window exceeds it or is infinite', () => {
    expect(limitHistoryByRounds(messages, 10)).toHaveLength(6)
    expect(limitHistoryByRounds(messages, Number.POSITIVE_INFINITY)).toHaveLength(6)
  })

  it('returns nothing for a zero window', () => {
    expect(limitHistoryByRounds(messages, 0)).toEqual([])
  })
})

function historyMessage(id: string, role: 'user' | 'assistant'): ChatMessage {
  return { id, role, content: id, status: 'complete', createdAt: 1 }
}

function sequentialIds(): () => string {
  let index = 0
  return () => `id-${++index}`
}

function createContextItem(id: string, title: string, text: string): ContextItem {
  return {
    id,
    kind: 'selection',
    title,
    url: `https://example.com/${id}`,
    text,
    originalCharCount: text.length,
    truncated: false,
    capturedAt: 1,
  }
}
