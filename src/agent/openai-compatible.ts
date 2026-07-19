import type {
  AgentAdapter,
  AgentMessage,
  AgentProfile,
  AgentRequest,
  AgentStreamEvent,
} from './adapter'
import { AgentAdapterError, errorForHttpStatus, toAgentError, type AgentError } from './errors'
import { parseSseStream } from './sse-parser'
import { buildChatCompletionsUrl, validateAgentProfile } from './url'
import { redactSensitiveText, safeErrorMessage } from '../shared/redact'

interface ChatCompletionsRequestBody {
  messages: AgentMessage[]
  stream: boolean
  model?: string
  max_tokens?: number
}

interface StreamPayload {
  choices?: Array<{
    delta?: { content?: unknown }
  }>
  error?: {
    message?: unknown
  }
}

export class OpenAICompatibleAdapter implements AgentAdapter {
  constructor(
    private readonly fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async testConnection(profile: AgentProfile, apiKey: string, signal?: AbortSignal): Promise<void> {
    validateAgentProfile(profile)
    const timedSignal = createTimedSignal(signal, profile.requestTimeoutMs)

    try {
      const response = await this.fetchImplementation(
        buildChatCompletionsUrl(profile.baseUrl, profile.chatPath),
        {
          method: 'POST',
          headers: buildRequestHeaders(profile, apiKey),
          body: JSON.stringify(
            buildRequestBody(profile, [{ role: 'user', content: 'Reply with OK.' }], false),
          ),
          signal: timedSignal.signal,
        },
      )

      if (!response.ok) {
        throw await errorFromResponse(response, apiKey)
      }

      const payload: unknown = await response.json().catch(() => {
        throw new AgentAdapterError(
          'INVALID_RESPONSE',
          'The endpoint returned an invalid JSON response.',
          false,
        )
      })

      if (!isCompletionResponse(payload)) {
        throw new AgentAdapterError(
          'INVALID_RESPONSE',
          'The endpoint response is not OpenAI Chat Completions compatible.',
          false,
        )
      }
    } catch (error) {
      const mapped = toAgentError(error, {
        timedOut: timedSignal.timedOut(),
        cancelled: signal?.aborted === true,
        secrets: [apiKey],
      })
      throw new AgentAdapterError(mapped.code, mapped.message, mapped.retryable, mapped.status)
    } finally {
      timedSignal.dispose()
    }
  }

  async *stream(request: AgentRequest, signal: AbortSignal): AsyncIterable<AgentStreamEvent> {
    const { profile, apiKey } = request
    const timedSignal = createTimedSignal(signal, profile.requestTimeoutMs)

    try {
      validateAgentProfile(profile)
      const response = await this.fetchImplementation(
        buildChatCompletionsUrl(profile.baseUrl, profile.chatPath),
        {
          method: 'POST',
          headers: buildRequestHeaders(profile, apiKey),
          body: JSON.stringify(buildRequestBody(profile, request.messages, true)),
          signal: timedSignal.signal,
        },
      )

      if (!response.ok) {
        throw await errorFromResponse(response, apiKey)
      }

      if (!response.body) {
        throw new AgentAdapterError(
          'INVALID_RESPONSE',
          'The endpoint returned an empty streaming response.',
          false,
        )
      }

      for await (const event of parseSseStream(response.body)) {
        if (event.data.trim() === '[DONE]') {
          yield { type: 'completed' }
          return
        }

        const payload = parseStreamPayload(event.data)
        if (payload.error) {
          const message =
            typeof payload.error.message === 'string'
              ? redactSensitiveText(payload.error.message, [apiKey])
              : 'The upstream endpoint returned a streaming error.'
          throw new AgentAdapterError('UPSTREAM_ERROR', message.slice(0, 500), false)
        }

        const content = payload.choices?.[0]?.delta?.content
        if (typeof content === 'string' && content.length > 0) {
          yield { type: 'content-delta', text: content }
        }
      }

      yield { type: 'completed' }
    } catch (error) {
      yield {
        type: 'error',
        error: toAgentError(error, {
          timedOut: timedSignal.timedOut(),
          cancelled: signal.aborted,
          secrets: [apiKey],
        }),
      }
    } finally {
      timedSignal.dispose()
    }
  }
}

export function buildRequestHeaders(profile: AgentProfile, apiKey: string): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const headerName = profile.authHeader.trim()

  if (apiKey.length > 0) {
    const scheme = profile.authScheme?.trim()
    headers.set(headerName, scheme ? `${scheme} ${apiKey}` : apiKey)
  }

  return headers
}

export function buildRequestBody(
  profile: AgentProfile,
  messages: AgentMessage[],
  stream: boolean,
): ChatCompletionsRequestBody {
  const body: ChatCompletionsRequestBody = { messages, stream }
  const model = profile.model?.trim()

  if (model) {
    body.model = model
  }

  if (!stream) {
    body.max_tokens = 1
  }

  return body
}

async function errorFromResponse(response: Response, apiKey: string): Promise<AgentAdapterError> {
  const raw = await response.text().catch(() => '')
  let message = raw

  try {
    const payload: unknown = JSON.parse(raw)
    if (isRecord(payload)) {
      const nested = isRecord(payload.error) ? payload.error.message : undefined
      const direct = payload.message
      if (typeof nested === 'string') {
        message = nested
      } else if (typeof direct === 'string') {
        message = direct
      }
    }
  } catch {
    // Preserve a bounded plain-text upstream message.
  }

  return errorForHttpStatus(
    response.status,
    redactSensitiveText(message, [apiKey]).trim().slice(0, 500),
  )
}

function parseStreamPayload(data: string): StreamPayload {
  try {
    const payload: unknown = JSON.parse(data)
    if (isRecord(payload)) {
      return payload as StreamPayload
    }
  } catch (error) {
    throw new AgentAdapterError(
      'INVALID_RESPONSE',
      `The endpoint returned an invalid SSE event: ${safeErrorMessage(error)}`,
      false,
    )
  }

  throw new AgentAdapterError(
    'INVALID_RESPONSE',
    'The endpoint returned a non-object SSE event.',
    false,
  )
}

function isCompletionResponse(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.choices)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createTimedSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal
  timedOut: () => boolean
  dispose: () => void
} {
  const controller = new AbortController()
  let didTimeOut = false

  const abortFromExternal = (): void => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) {
    abortFromExternal()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
  }

  const timer = globalThis.setTimeout(() => {
    didTimeOut = true
    controller.abort(new DOMException('Request timed out.', 'TimeoutError'))
  }, timeoutMs)

  return {
    signal: controller.signal,
    timedOut: () => didTimeOut,
    dispose: () => {
      globalThis.clearTimeout(timer)
      externalSignal?.removeEventListener('abort', abortFromExternal)
    },
  }
}

export type { AgentError }
