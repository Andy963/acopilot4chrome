import { describe, expect, it, vi } from 'vitest'

import { captureActiveSelection } from '../../src/runtime/selection-capture'

describe('captureActiveSelection', () => {
  it('returns the selection with stable source metadata', async () => {
    const result = await captureActiveSelection(
      {
        query: vi
          .fn()
          .mockResolvedValue([{ id: 7, title: 'Article', url: 'https://example.com/article' }]),
      },
      {
        executeScript: vi.fn().mockResolvedValue([
          {
            result: {
              text: 'selected text',
              title: 'Injected article title',
              url: 'https://example.com/article',
            },
          },
        ]),
      },
      () => 'context-1',
      () => 42,
    )

    expect(result).toEqual({
      ok: true,
      context: {
        id: 'context-1',
        kind: 'selection',
        title: 'Injected article title',
        url: 'https://example.com/article',
        text: 'selected text',
        originalCharCount: 13,
        truncated: false,
        tabId: 7,
        capturedAt: 42,
      },
    })
  })

  it('returns a deterministic error when script injection is denied', async () => {
    const result = await captureActiveSelection(
      {
        query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://example.com/article' }]),
      },
      { executeScript: vi.fn().mockRejectedValue(new Error('denied')) },
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    })
  })

  it('rejects a selection captured after navigation', async () => {
    const result = await captureActiveSelection(
      {
        query: vi
          .fn()
          .mockResolvedValue([{ id: 7, title: 'Old page', url: 'https://example.com/old' }]),
      },
      {
        executeScript: vi.fn().mockResolvedValue([
          {
            result: {
              text: 'new page selection',
              title: 'New page',
              url: 'https://example.com/new',
            },
          },
        ]),
      },
    )

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'SOURCE_CHANGED',
        message: 'The active page changed while the selection was being captured.',
      },
    })
  })
})
