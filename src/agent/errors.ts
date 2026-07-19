import { safeErrorMessage } from '../shared/redact'

export type AgentErrorCode =
  | 'INVALID_CONFIG'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED_PAGE'
  | 'NO_SELECTION'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'AUTH_ERROR'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE'
  | 'CANCELLED'

export interface AgentError {
  code: AgentErrorCode
  message: string
  status?: number
  retryable: boolean
}

export class AgentAdapterError extends Error implements AgentError {
  readonly code: AgentErrorCode
  readonly status?: number
  readonly retryable: boolean

  constructor(code: AgentErrorCode, message: string, retryable: boolean, status?: number) {
    super(message)
    this.name = 'AgentAdapterError'
    this.code = code
    this.retryable = retryable
    if (status !== undefined) {
      this.status = status
    }
  }

  toJSON(): AgentError {
    const result: AgentError = {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    }

    if (this.status !== undefined) {
      result.status = this.status
    }

    return result
  }
}

export function toAgentError(
  error: unknown,
  options: { timedOut?: boolean; cancelled?: boolean; secrets?: readonly string[] } = {},
): AgentError {
  if (error instanceof AgentAdapterError) {
    return error.toJSON()
  }

  if (options.timedOut) {
    return {
      code: 'TIMEOUT',
      message: 'The request timed out.',
      retryable: true,
    }
  }

  if (options.cancelled || isAbortError(error)) {
    return {
      code: 'CANCELLED',
      message: 'The request was cancelled.',
      retryable: false,
    }
  }

  return {
    code: 'NETWORK_ERROR',
    message: safeErrorMessage(error, options.secrets),
    retryable: true,
  }
}

export function errorForHttpStatus(status: number, message: string): AgentAdapterError {
  const safeMessage = message || `Upstream request failed with status ${status}.`

  if (status === 401 || status === 403) {
    return new AgentAdapterError('AUTH_ERROR', safeMessage, false, status)
  }

  if (status === 429) {
    return new AgentAdapterError('RATE_LIMITED', safeMessage, true, status)
  }

  return new AgentAdapterError('UPSTREAM_ERROR', safeMessage, status >= 500, status)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}
