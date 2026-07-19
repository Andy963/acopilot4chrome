import { describe, expect, it } from 'vitest'

import { applyTotalContextLimit, TRUNCATION_MARKER, truncateText } from '../../src/context/truncate'
import type { ContextItem } from '../../src/context/types'

function createItem(id: string, text: string): ContextItem {
  return {
    id,
    kind: 'selection',
    title: id,
    url: `https://example.com/${id}`,
    text,
    originalCharCount: text.length,
    truncated: false,
    capturedAt: 1,
  }
}

describe('truncateText', () => {
  it('keeps content within the item limit and appends the stable marker', () => {
    const result = truncateText('a'.repeat(100), 60)

    expect(result.originalCharCount).toBe(100)
    expect(result.truncated).toBe(true)
    expect(result.text).toHaveLength(60)
    expect(result.text.endsWith(TRUNCATION_MARKER)).toBe(true)
  })

  it('does not modify text that fits', () => {
    expect(truncateText('content', 7)).toEqual({
      text: 'content',
      originalCharCount: 7,
      truncated: false,
    })
  })

  it('rejects invalid limits', () => {
    expect(() => truncateText('content', -1)).toThrow(RangeError)
  })
})

describe('applyTotalContextLimit', () => {
  it('preserves order and truncates only the last included item', () => {
    const items = [createItem('first', 'a'.repeat(30)), createItem('second', 'b'.repeat(80))]
    const result = applyTotalContextLimit(items, 90)

    expect(result).toHaveLength(2)
    expect(result[0]?.text).toBe(items[0]?.text)
    expect(result[1]?.text).toHaveLength(60)
    expect(result[1]?.text.endsWith(TRUNCATION_MARKER)).toBe(true)
    expect(result[1]?.originalCharCount).toBe(80)
    expect(result[1]?.truncated).toBe(true)
  })

  it('omits items after the budget is exhausted', () => {
    const result = applyTotalContextLimit(
      [createItem('first', 'a'.repeat(50)), createItem('second', 'b')],
      50,
    )

    expect(result.map((item) => item.id)).toEqual(['first'])
  })
})
