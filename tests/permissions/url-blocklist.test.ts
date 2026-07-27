import { describe, expect, it } from 'vitest'

import {
  compileUrlBlocklist,
  EMPTY_URL_BLOCKLIST,
  formatUrlPatternInput,
  isUrlBlocked,
  MAX_URL_PATTERNS,
  MAX_URL_PATTERN_LENGTH,
  parseUrlPatternInput,
  validateUrlPattern,
} from '../../src/permissions/url-blocklist'

describe('parseUrlPatternInput', () => {
  it('trims lines, drops blanks, and de-duplicates', () => {
    expect(
      parseUrlPatternInput('  ^https://a\\.com/  \n\n^https://a\\.com/\n^b\\.net\n   \n'),
    ).toEqual(['^https://a\\.com/', '^b\\.net'])
  })

  it('caps the number of stored patterns', () => {
    const input = Array.from({ length: MAX_URL_PATTERNS + 10 }, (_, index) => `p${index}`).join(
      '\n',
    )

    expect(parseUrlPatternInput(input)).toHaveLength(MAX_URL_PATTERNS)
  })

  it('round-trips through the textarea format', () => {
    const patterns = ['^https://a\\.com/', 'b\\.net']

    expect(parseUrlPatternInput(formatUrlPatternInput(patterns))).toEqual(patterns)
  })
})

describe('validateUrlPattern', () => {
  it('accepts a valid regular expression', () => {
    expect(validateUrlPattern('^https://example\\.com/')).toBeNull()
  })

  it('rejects a malformed regular expression', () => {
    expect(validateUrlPattern('^https://(example')).toEqual(expect.any(String))
  })

  it('rejects an over-long pattern', () => {
    expect(validateUrlPattern('a'.repeat(MAX_URL_PATTERN_LENGTH + 1))).toContain(
      String(MAX_URL_PATTERN_LENGTH),
    )
  })
})

describe('compileUrlBlocklist', () => {
  it('keeps valid patterns and reports invalid ones', () => {
    const blocklist = compileUrlBlocklist(['^https://mail\\.google\\.com/', '(', 'example\\.com'])

    expect(blocklist.invalidPatterns).toEqual(['('])
    expect(isUrlBlocked('https://mail.google.com/u/0/#inbox', blocklist)).toBe(true)
    expect(isUrlBlocked('https://sub.example.com/page', blocklist)).toBe(true)
    expect(isUrlBlocked('https://other.test/page', blocklist)).toBe(false)
  })

  it('matches case-insensitively', () => {
    const blocklist = compileUrlBlocklist(['example\\.COM'])

    expect(isUrlBlocked('https://Example.com/', blocklist)).toBe(true)
  })
})

describe('isUrlBlocked', () => {
  it('never blocks when no patterns are configured', () => {
    expect(isUrlBlocked('https://example.com/', EMPTY_URL_BLOCKLIST)).toBe(false)
  })

  it('treats a missing or empty URL as allowed', () => {
    const blocklist = compileUrlBlocklist(['.*'])

    expect(isUrlBlocked(undefined, blocklist)).toBe(false)
    expect(isUrlBlocked('', blocklist)).toBe(false)
  })

  it('re-evaluates a global pattern without carrying lastIndex', () => {
    const blocklist = compileUrlBlocklist(['example\\.com'])

    expect(isUrlBlocked('https://example.com/one', blocklist)).toBe(true)
    expect(isUrlBlocked('https://example.com/two', blocklist)).toBe(true)
  })
})
