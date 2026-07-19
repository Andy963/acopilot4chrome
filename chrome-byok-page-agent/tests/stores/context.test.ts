import { describe, expect, it, vi } from 'vitest'

import type { ContextItem } from '../../src/context/types'
import { createContextStore } from '../../src/stores/context'

const baseItem: ContextItem = {
  id: 'context-1',
  kind: 'selection',
  title: 'Example',
  url: 'https://example.com/article#section',
  text: 'Saved selection',
  originalCharCount: 15,
  truncated: false,
  capturedAt: 1,
}

describe('context store', () => {
  it('deduplicates exact snapshots while retaining source metadata', async () => {
    const persist = vi.fn(async () => undefined)
    const store = createContextStore({
      capture: vi.fn(),
      persist,
    })

    expect(await store.add(baseItem)).toBe(true)
    expect(
      await store.add({
        ...baseItem,
        id: 'context-2',
        url: 'https://example.com/article',
        capturedAt: 2,
      }),
    ).toBe(false)
    expect(store.state.items).toEqual([baseItem])
    expect(store.state.notice).toContain('already included')
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('allows different selections from the same page', async () => {
    const store = createContextStore({
      capture: vi.fn(),
      persist: vi.fn(async () => undefined),
    })

    await store.add(baseItem)
    await store.add({ ...baseItem, id: 'context-2', text: 'Another selection' })

    expect(store.state.items).toHaveLength(2)
  })

  it('prevents overlapping capture actions', async () => {
    let resolveCapture: ((value: { ok: true; context: ContextItem }) => void) | undefined
    const capture = vi.fn(
      () =>
        new Promise<{ ok: true; context: ContextItem }>((resolve) => {
          resolveCapture = resolve
        }),
    )
    const store = createContextStore({ capture, persist: vi.fn(async () => undefined) })

    const first = store.capture('selection')
    await store.capture('page')
    expect(capture).toHaveBeenCalledTimes(1)

    resolveCapture?.({ ok: true, context: baseItem })
    await first
    expect(store.state.captureAction).toBeNull()
  })
})
