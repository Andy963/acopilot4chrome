import { describe, expect, it } from 'vitest'

import type { ChatSession, PendingCapture } from '../../src/context/types'
import {
  PENDING_CAPTURES_STORAGE_KEY,
  SessionRepository,
} from '../../src/storage/session-repository'
import { MemoryStorage } from './memory-storage'

describe('SessionRepository', () => {
  it('recovers incomplete streaming messages as errors', async () => {
    const storage = new MemoryStorage()
    const repository = new SessionRepository(storage)
    await repository.saveActiveSession(session())

    const recovered = await repository.loadActiveSession()

    expect(recovered?.messages[0]?.status).toBe('error')
  })

  it('projects session state so unrelated secret fields are not saved', async () => {
    const storage = new MemoryStorage()
    const repository = new SessionRepository(storage)
    const validSession = session()
    const unsafe = {
      ...validSession,
      apiKey: 'root-secret',
      messages: [{ ...validSession.messages[0]!, apiKey: 'message-secret' }],
    } as unknown as ChatSession

    await repository.saveActiveSession(unsafe)

    expect(JSON.stringify(storage.values)).not.toContain('secret')
  })

  it('serializes concurrent pending-capture updates and preserves order', async () => {
    const storage = new MemoryStorage()
    const repository = new SessionRepository(storage)

    await Promise.all([
      repository.appendPendingCapture(capture('capture-1', 1)),
      repository.appendPendingCapture(capture('capture-2', 2)),
    ])

    expect((await repository.listPendingCaptures()).map(({ id }) => id)).toEqual([
      'capture-1',
      'capture-2',
    ])
  })

  it('acknowledges only captures inserted into the context store', async () => {
    const storage = new MemoryStorage()
    const repository = new SessionRepository(storage)
    storage.values[PENDING_CAPTURES_STORAGE_KEY] = [
      capture('capture-1', 1),
      capture('capture-2', 2),
    ]

    const removed = await repository.acknowledgePendingCaptures(['capture-1'])

    expect(removed).toBe(1)
    expect((await repository.listPendingCaptures()).map(({ id }) => id)).toEqual(['capture-2'])
  })
})

function session(): ChatSession {
  return {
    id: 'session-1',
    profileId: 'profile-1',
    contextItems: [],
    messages: [
      {
        id: 'message-1',
        role: 'assistant',
        content: 'Partial response',
        status: 'streaming',
        createdAt: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 2,
  }
}

function capture(id: string, createdAt: number): PendingCapture {
  return {
    id,
    context: {
      id: `context-${id}`,
      kind: 'selection',
      title: 'Example',
      url: 'https://example.com/',
      text: id,
      originalCharCount: id.length,
      truncated: false,
      capturedAt: createdAt,
    },
    createdAt,
  }
}
