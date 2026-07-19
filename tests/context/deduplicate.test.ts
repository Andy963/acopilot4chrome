import { describe, expect, it } from 'vitest'

import { deduplicateContextItems, isDuplicateContextItem } from '../../src/context/deduplicate'
import type { ContextItem } from '../../src/context/types'

function item(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: 'context-1',
    kind: 'selection',
    title: 'Example',
    url: 'https://example.com/article#heading',
    text: 'selected text',
    originalCharCount: 13,
    truncated: false,
    capturedAt: 1,
    ...overrides,
  }
}

describe('context deduplication', () => {
  it('removes exact duplicates after URL normalization', () => {
    const first = item()
    const duplicate = item({ id: 'context-2', url: 'https://example.com/article' })

    expect(deduplicateContextItems([first, duplicate])).toEqual([first])
    expect(isDuplicateContextItem(duplicate, [first])).toBe(true)
  })

  it('allows different selections from the same URL', () => {
    const items = [item(), item({ id: 'context-2', text: 'different text' })]
    expect(deduplicateContextItems(items)).toEqual(items)
  })

  it('does not merge selection and page contexts with the same text', () => {
    const items = [item(), item({ id: 'context-2', kind: 'page' })]
    expect(deduplicateContextItems(items)).toEqual(items)
  })
})
