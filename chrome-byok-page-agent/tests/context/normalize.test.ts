import { describe, expect, it } from 'vitest'

import { normalizeContextUrl, normalizeWhitespace } from '../../src/context/normalize'

describe('normalizeWhitespace', () => {
  it('normalizes line endings, inline whitespace, and excess blank lines', () => {
    expect(normalizeWhitespace('  Alpha\t beta\r\n\r\n\r\n Gamma\u00a0delta  ')).toBe(
      'Alpha beta\n\nGamma delta',
    )
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeWhitespace(' \r\n\t ')).toBe('')
  })
})

describe('normalizeContextUrl', () => {
  it('removes fragments and normalizes default ports', () => {
    expect(normalizeContextUrl(' https://example.com:443/article#heading ')).toBe(
      'https://example.com/article',
    )
  })

  it('returns trimmed non-URL sources unchanged', () => {
    expect(normalizeContextUrl(' not a url ')).toBe('not a url')
  })
})
