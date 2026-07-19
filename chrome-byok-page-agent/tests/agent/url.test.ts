import { describe, expect, it } from 'vitest'

import { AgentAdapterError } from '../../src/agent/errors'
import {
  buildChatCompletionsUrl,
  endpointOrigin,
  normalizeChatPath,
  validateBaseUrl,
} from '../../src/agent/url'

describe('agent endpoint URL handling', () => {
  it.each([
    ['https://example.com/v1', 'chat/completions', 'https://example.com/v1/chat/completions'],
    ['https://example.com/v1/', 'chat/completions', 'https://example.com/v1/chat/completions'],
    ['https://example.com/v1', '/chat/completions', 'https://example.com/v1/chat/completions'],
  ])('joins %s and %s', (baseUrl, chatPath, expected) => {
    expect(buildChatCompletionsUrl(baseUrl, chatPath).href).toBe(expected)
  })

  it.each(['http://example.com/v1', 'ftp://example.com/v1'])('rejects unsafe URL %s', (url) => {
    expect(() => validateBaseUrl(url)).toThrow(AgentAdapterError)
  })

  it.each(['http://localhost:11434/v1', 'http://127.0.0.1/v1', 'http://[::1]/v1'])(
    'allows loopback HTTP URL %s',
    (url) => {
      expect(validateBaseUrl(url).href).toBe(url)
    },
  )

  it('rejects credentials in the base URL', () => {
    expect(() => validateBaseUrl('https://user:password@example.com/v1')).toThrow(
      /must not contain credentials/,
    )
  })

  it.each([
    'https://evil.example/chat',
    '//evil.example/chat',
    '../chat/completions',
    'chat/%2e%2e/completions',
    'chat\\completions',
  ])('rejects absolute or traversing chat path %s', (path) => {
    expect(() => normalizeChatPath(path)).toThrow(AgentAdapterError)
  })

  it('returns only the validated endpoint origin', () => {
    expect(endpointOrigin('https://example.com:8443/v1')).toBe('https://example.com:8443')
  })
})
