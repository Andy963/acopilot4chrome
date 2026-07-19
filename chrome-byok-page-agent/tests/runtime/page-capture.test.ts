import { describe, expect, it, vi } from 'vitest'

import { captureActivePage } from '../../src/runtime/page-capture'

describe('captureActivePage', () => {
  it('extracts and truncates a sanitized page snapshot', async () => {
    const text = 'Readable article content. '.repeat(20)
    const result = await captureActivePage(
      {
        query: vi
          .fn()
          .mockResolvedValue([{ id: 7, title: 'Tab title', url: 'https://example.com/article' }]),
      },
      {
        executeScript: vi.fn().mockResolvedValue([
          {
            result: {
              html: `<html><head><title>Article</title></head><body><main>${text}</main></body></html>`,
              title: 'Article',
              url: 'https://example.com/article',
            },
          },
        ]),
      },
      100,
      () => 'context-1',
      () => 42,
    )

    expect(result).toMatchObject({
      ok: true,
      context: {
        id: 'context-1',
        kind: 'page',
        url: 'https://example.com/article',
        truncated: true,
        tabId: 7,
        capturedAt: 42,
      },
    })
  })

  it('rejects unsupported browser pages before injection', async () => {
    const executeScript = vi.fn()
    const result = await captureActivePage(
      { query: vi.fn().mockResolvedValue([{ id: 7, url: 'chrome://settings/' }]) },
      { executeScript },
      100,
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_PAGE' },
    })
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('filters computed-hidden and contenteditable text before serialization', async () => {
    document.head.innerHTML = `
      <title>Live page</title>
      <style>.private-content { display: none; }</style>
    `
    document.body.innerHTML = `
      <main>
        <p>Public article content.</p>
        <p class="private-content">CSS hidden private content.</p>
        <div contenteditable="true">Draft private content.</div>
      </main>
    `
    const url = window.location.href

    const result = await captureActivePage(
      {
        query: vi.fn().mockResolvedValue([{ id: 7, title: 'Stale tab title', url }]),
      },
      {
        executeScript: vi.fn(
          async (options: { func: () => { html: string; title: string; url: string } }) => [
            { result: options.func() },
          ],
        ),
      },
      1_000,
    )

    expect(result).toMatchObject({
      ok: true,
      context: {
        title: 'Live page',
        url,
        text: 'Public article content.',
      },
    })
    if (result.ok) {
      expect(result.context.text).not.toContain('CSS hidden private content.')
      expect(result.context.text).not.toContain('Draft private content.')
    }
  })

  it('rejects a page snapshot captured after navigation', async () => {
    const result = await captureActivePage(
      {
        query: vi
          .fn()
          .mockResolvedValue([{ id: 7, title: 'Old page', url: 'https://example.com/old' }]),
      },
      {
        executeScript: vi.fn().mockResolvedValue([
          {
            result: {
              html: '<html><body><main>New page content.</main></body></html>',
              title: 'New page',
              url: 'https://example.com/new',
            },
          },
        ]),
      },
      1_000,
    )

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'SOURCE_CHANGED',
        message: 'The active page changed while it was being captured.',
      },
    })
  })
})
