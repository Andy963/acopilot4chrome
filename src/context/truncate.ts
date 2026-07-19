import type { ContextItem } from './types'

export const DEFAULT_MAX_CONTEXT_ITEM_CHARS = 50_000
export const DEFAULT_MAX_TOTAL_CONTEXT_CHARS = 100_000
export const TRUNCATION_MARKER = '[Content truncated by the browser extension.]'

export interface TruncatedText {
  text: string
  originalCharCount: number
  truncated: boolean
}

export function truncateText(input: string, maxChars: number): TruncatedText {
  assertValidLimit(maxChars)

  if (input.length <= maxChars) {
    return {
      text: input,
      originalCharCount: input.length,
      truncated: false,
    }
  }

  return {
    text: fitTruncatedText(input, maxChars),
    originalCharCount: input.length,
    truncated: true,
  }
}

export function applyTotalContextLimit(
  items: readonly ContextItem[],
  maxTotalChars: number,
): ContextItem[] {
  assertValidLimit(maxTotalChars)

  const limited: ContextItem[] = []
  let remaining = maxTotalChars

  for (const item of items) {
    if (remaining === 0) {
      break
    }

    if (item.text.length <= remaining) {
      limited.push({ ...item })
      remaining -= item.text.length
      continue
    }

    limited.push({
      ...item,
      text: fitTruncatedText(stripTruncationMarker(item.text), remaining),
      truncated: true,
    })
    remaining = 0
  }

  return limited
}

function fitTruncatedText(input: string, maxChars: number): string {
  if (maxChars === 0) {
    return ''
  }

  if (maxChars <= TRUNCATION_MARKER.length) {
    return TRUNCATION_MARKER.slice(0, maxChars)
  }

  const separator = '\n\n'
  const prefixLength = Math.max(0, maxChars - separator.length - TRUNCATION_MARKER.length)
  return `${input.slice(0, prefixLength)}${separator}${TRUNCATION_MARKER}`
}

function stripTruncationMarker(input: string): string {
  const suffix = `\n\n${TRUNCATION_MARKER}`
  return input.endsWith(suffix) ? input.slice(0, -suffix.length) : input
}

function assertValidLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError('Character limit must be a non-negative safe integer.')
  }
}
