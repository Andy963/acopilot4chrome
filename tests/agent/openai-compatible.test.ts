import { describe, expect, it, vi } from 'vitest'

import type { AgentMessage, AgentProfile, AgentStreamEvent } from '../../src/agent/adapter'
import {
  buildRequestBody,
  buildRequestHeaders,
  OpenAICompatibleAdapter,
} from '../../src/agent/openai-compatible'

const messages: AgentMessage[] = [{ role: 'user', content: 'Question' }]

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 'profile-1',
    name: 'Example',
    adapter: 'openai-compatible',
    baseUrl: 'https://example.com/v1',
    chatPath: 'chat/completions',
    models: ['example-model'],
    model: 'example-model',
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    apiKeyStorageMode: 'session',
    requestTimeoutMs: 1_000,
    maxContextItemChars: 50_000,
    maxTotalContextChars: 100_000,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

async function collect(stream: AsyncIterable<AgentStreamEvent>): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = []
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

describe('OpenAI-compatible request construction', () => {
  it('builds the default Bearer authorization header', () => {
    const headers = buildRequestHeaders(profile(), 'secret')
    expect(headers.get('Authorization')).toBe('Bearer secret')
  })

  it('supports an authentication header without a scheme', () => {
    const headers = buildRequestHeaders(
      profile({ authHeader: 'X-API-Key', authScheme: '' }),
      'secret',
    )
    expect(headers.get('X-API-Key')).toBe('secret')
  })

  it('includes a configured model and omits a blank model', () => {
    expect(buildRequestBody(profile(), messages, true)).toMatchObject({
      model: 'example-model',
      messages,
      stream: true,
    })
    expect(buildRequestBody(profile({ model: ' ' }), messages, true)).not.toHaveProperty('model')
  })

  it('adds the minimal token limit only to connection tests', () => {
    expect(buildRequestBody(profile(), messages, false).max_tokens).toBe(1)
    expect(buildRequestBody(profile(), messages, true)).not.toHaveProperty('max_tokens')
  })
})

describe('OpenAICompatibleAdapter streaming', () => {
  it('emits deltas across arbitrary chunks and completes on DONE', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel',
        'lo"}}]}\n\ndata: {"ignored":true}\n\n',
        'data: {"choices":[{"delta":{"content":"!"}}]}\n\ndata: [DONE]\n\n',
      ]),
    ) as unknown as typeof fetch
    const adapter = new OpenAICompatibleAdapter(fetchMock)

    await expect(
      collect(
        adapter.stream(
          { profile: profile(), apiKey: 'secret', messages },
          new AbortController().signal,
        ),
      ),
    ).resolves.toEqual([
      { type: 'content-delta', text: 'Hello' },
      { type: 'content-delta', text: '!' },
      { type: 'completed' },
    ])

    const request = vi.mocked(fetchMock).mock.calls[0]
    expect(String(request?.[0])).toBe('https://example.com/v1/chat/completions')
    expect(request?.[1]?.body).not.toContain('secret')
  })

  it('maps invalid SSE JSON to INVALID_RESPONSE', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse(['data: not-json\n\n']),
    ) as unknown as typeof fetch
    const adapter = new OpenAICompatibleAdapter(fetchMock)

    const events = await collect(
      adapter.stream(
        { profile: profile(), apiKey: 'secret', messages },
        new AbortController().signal,
      ),
    )

    expect(events).toEqual([
      {
        type: 'error',
        error: expect.objectContaining({ code: 'INVALID_RESPONSE', retryable: false }),
      },
    ])
  })

  it.each([
    [401, '{"error":{"message":"bad credentials"}}', 'AUTH_ERROR', false],
    [429, 'slow down', 'RATE_LIMITED', true],
    [500, '<html>unavailable</html>', 'UPSTREAM_ERROR', true],
  ])('maps HTTP %i responses', async (status, body, code, retryable) => {
    const fetchMock = vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch
    const adapter = new OpenAICompatibleAdapter(fetchMock)
    const events = await collect(
      adapter.stream(
        { profile: profile(), apiKey: 'secret', messages },
        new AbortController().signal,
      ),
    )

    expect(events).toEqual([
      {
        type: 'error',
        error: expect.objectContaining({ code, status, retryable }),
      },
    ])
  })

  it('maps external aborts to CANCELLED', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    ) as unknown as typeof fetch
    const adapter = new OpenAICompatibleAdapter(fetchMock)
    const controller = new AbortController()
    const result = collect(
      adapter.stream({ profile: profile(), apiKey: 'secret', messages }, controller.signal),
    )

    controller.abort()

    await expect(result).resolves.toEqual([
      {
        type: 'error',
        error: {
          code: 'CANCELLED',
          message: 'The request was cancelled.',
          retryable: false,
        },
      },
    ])
  })

  it('maps internal request deadlines to TIMEOUT', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    ) as unknown as typeof fetch
    const adapter = new OpenAICompatibleAdapter(fetchMock)

    const events = await collect(
      adapter.stream(
        { profile: profile({ requestTimeoutMs: 1 }), apiKey: 'secret', messages },
        new AbortController().signal,
      ),
    )

    expect(events).toEqual([
      {
        type: 'error',
        error: { code: 'TIMEOUT', message: 'The request timed out.', retryable: true },
      },
    ])
  })
})

describe('OpenAICompatibleAdapter connection test', () => {
  it('accepts a minimal compatible JSON response', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: 'OK' } }] }),
    ) as unknown as typeof fetch
    const adapter = new OpenAICompatibleAdapter(fetchMock)

    await expect(adapter.testConnection(profile(), 'secret')).resolves.toBeUndefined()
  })

  it('rejects non-JSON success responses as invalid', async () => {
    const fetchMock = vi.fn(async () => new Response('OK')) as unknown as typeof fetch
    const adapter = new OpenAICompatibleAdapter(fetchMock)

    await expect(adapter.testConnection(profile(), 'secret')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
