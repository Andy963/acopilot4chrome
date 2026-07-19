import type { AgentProfile } from './adapter'
import { AgentAdapterError } from './errors'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function validateBaseUrl(input: string): URL {
  let url: URL

  try {
    url = new URL(input.trim())
  } catch {
    throw new AgentAdapterError('INVALID_CONFIG', 'Base URL is not a valid URL.', false)
  }

  if (url.username || url.password) {
    throw new AgentAdapterError('INVALID_CONFIG', 'Base URL must not contain credentials.', false)
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new AgentAdapterError(
      'INVALID_CONFIG',
      'Base URL must use HTTPS, except for loopback HTTP endpoints.',
      false,
    )
  }

  if (url.search || url.hash) {
    throw new AgentAdapterError(
      'INVALID_CONFIG',
      'Base URL must not contain a query string or fragment.',
      false,
    )
  }

  return url
}

export function normalizeChatPath(input: string): string {
  const value = input.trim()

  if (value.length === 0) {
    throw new AgentAdapterError('INVALID_CONFIG', 'Chat path must not be empty.', false)
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//') || value.includes('\\')) {
    throw new AgentAdapterError('INVALID_CONFIG', 'Chat path must be a relative URL path.', false)
  }

  const normalized = value.replace(/^\/+/, '')
  const pathOnly = normalized.split(/[?#]/, 1)[0] ?? ''
  const segments = pathOnly.split('/')

  if (segments.some(isParentTraversalSegment)) {
    throw new AgentAdapterError(
      'INVALID_CONFIG',
      'Chat path must not contain parent traversal segments.',
      false,
    )
  }

  return normalized
}

export function buildChatCompletionsUrl(baseUrl: string, chatPath: string): URL {
  const base = validateBaseUrl(baseUrl)
  const normalizedBase = new URL(base.href)
  normalizedBase.pathname = normalizedBase.pathname.endsWith('/')
    ? normalizedBase.pathname
    : `${normalizedBase.pathname}/`

  const endpoint = new URL(normalizeChatPath(chatPath), normalizedBase)

  if (endpoint.origin !== normalizedBase.origin) {
    throw new AgentAdapterError(
      'INVALID_CONFIG',
      'Chat path must resolve within the base URL origin.',
      false,
    )
  }

  return endpoint
}

export function endpointOrigin(baseUrl: string): string {
  return validateBaseUrl(baseUrl).origin
}

export function validateAgentProfile(profile: AgentProfile): void {
  buildChatCompletionsUrl(profile.baseUrl, profile.chatPath)

  if (profile.authHeader.trim().length === 0) {
    throw new AgentAdapterError('INVALID_CONFIG', 'Authentication header must not be empty.', false)
  }

  try {
    new Headers({ [profile.authHeader]: 'validation-value' })
  } catch {
    throw new AgentAdapterError(
      'INVALID_CONFIG',
      'Authentication header is not a valid HTTP header name.',
      false,
    )
  }

  if (!Number.isSafeInteger(profile.requestTimeoutMs) || profile.requestTimeoutMs <= 0) {
    throw new AgentAdapterError(
      'INVALID_CONFIG',
      'Request timeout must be a positive safe integer.',
      false,
    )
  }
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase())
}

function isParentTraversalSegment(segment: string): boolean {
  try {
    return decodeURIComponent(segment).toLowerCase() === '..'
  } catch {
    return true
  }
}
