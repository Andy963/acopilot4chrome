export const MAX_URL_PATTERNS = 100
export const MAX_URL_PATTERN_LENGTH = 500

export interface UrlBlocklist {
  matchers: readonly RegExp[]
  invalidPatterns: readonly string[]
}

export const EMPTY_URL_BLOCKLIST: UrlBlocklist = { matchers: [], invalidPatterns: [] }

/**
 * One pattern per line: the settings field is a textarea, and a regular
 * expression may legally contain commas, spaces, and semicolons.
 */
export function parseUrlPatternInput(input: string): string[] {
  const seen = new Set<string>()
  const patterns: string[] = []
  for (const line of input.split('\n')) {
    const pattern = line.trim()
    if (pattern === '' || seen.has(pattern)) continue
    seen.add(pattern)
    patterns.push(pattern)
    if (patterns.length === MAX_URL_PATTERNS) break
  }
  return patterns
}

export function formatUrlPatternInput(patterns: readonly string[]): string {
  return patterns.join('\n')
}

export function validateUrlPattern(pattern: string): string | null {
  if (pattern.length > MAX_URL_PATTERN_LENGTH) {
    return `Longer than ${MAX_URL_PATTERN_LENGTH} characters.`
  }

  try {
    compileUrlPattern(pattern)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Not a valid regular expression.'
  }
}

/**
 * Invalid patterns are reported rather than thrown: one malformed line must not
 * disable blocking for the lines the user got right.
 */
export function compileUrlBlocklist(patterns: readonly string[]): UrlBlocklist {
  const matchers: RegExp[] = []
  const invalidPatterns: string[] = []
  for (const pattern of patterns.slice(0, MAX_URL_PATTERNS)) {
    if (validateUrlPattern(pattern) !== null) {
      invalidPatterns.push(pattern)
      continue
    }
    matchers.push(compileUrlPattern(pattern))
  }
  return { matchers, invalidPatterns }
}

export function isUrlBlocked(url: string | undefined, blocklist: UrlBlocklist): boolean {
  if (url === undefined || url === '') return false
  return blocklist.matchers.some((matcher) => {
    matcher.lastIndex = 0
    return matcher.test(url)
  })
}

function compileUrlPattern(pattern: string): RegExp {
  const delimited = parseDelimitedRegex(pattern)
  if (!delimited) return new RegExp(pattern, 'iu')
  return new RegExp(delimited.source, normalizedFlags(delimited.flags))
}

function parseDelimitedRegex(pattern: string): { source: string; flags: string } | null {
  if (!pattern.startsWith('/')) return null

  for (let index = pattern.length - 1; index > 0; index -= 1) {
    if (pattern[index] !== '/' || isEscaped(pattern, index)) continue
    return {
      source: pattern.slice(1, index),
      flags: pattern.slice(index + 1),
    }
  }

  return null
}

function isEscaped(value: string, index: number): boolean {
  let backslashes = 0
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 1
}

function normalizedFlags(flags: string): string {
  const output = new Set(flags)
  output.add('i')
  if (!output.has('v')) output.add('u')
  return [...output].join('')
}
