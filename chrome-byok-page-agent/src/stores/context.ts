import { computed, reactive, readonly } from 'vue'

import type { ContextItem } from '../context/types'

export type CaptureKind = 'selection' | 'page'

export type CaptureResult =
  | { ok: true; context: ContextItem }
  | { ok: false; error: { code: string; message: string } }

export interface ContextStoreDependencies {
  capture(kind: CaptureKind): Promise<CaptureResult>
  persist(items: readonly ContextItem[]): Promise<void>
}

export function createContextStore(dependencies: ContextStoreDependencies) {
  const state = reactive({
    items: [] as ContextItem[],
    captureAction: null as CaptureKind | null,
    error: null as string | null,
    notice: null as string | null,
  })

  const totalOriginalCharacters = computed(() =>
    state.items.reduce((total, item) => total + item.originalCharCount, 0),
  )

  function hydrate(items: readonly ContextItem[]): void {
    state.items = [...items]
  }

  async function add(item: ContextItem): Promise<boolean> {
    state.error = null
    state.notice = null
    if (state.items.some((candidate) => isDuplicate(candidate, item))) {
      state.notice = 'This exact context is already included.'
      return false
    }

    state.items.push(item)
    try {
      await persist()
    } catch (error) {
      state.items = state.items.filter((candidate) => candidate.id !== item.id)
      throw error
    }
    return true
  }

  async function capture(kind: CaptureKind): Promise<void> {
    if (state.captureAction !== null) return

    state.captureAction = kind
    state.error = null
    state.notice = null
    try {
      const result = await dependencies.capture(kind)
      if (!result.ok) {
        state.error = result.error.message
        return
      }
      await add(result.context)
    } catch (error) {
      state.error = safeErrorMessage(error, 'Unable to capture page context.')
    } finally {
      state.captureAction = null
    }
  }

  async function remove(id: string): Promise<void> {
    const previous = state.items
    const next = state.items.filter((item) => item.id !== id)
    if (next.length === state.items.length) return
    state.items = next
    state.notice = null
    try {
      await persist()
    } catch {
      state.items = previous
    }
  }

  async function clear(): Promise<void> {
    if (!state.items.length) return
    const previous = state.items
    state.items = []
    state.notice = null
    try {
      await persist()
    } catch {
      state.items = previous
    }
  }

  async function persist(): Promise<void> {
    try {
      await dependencies.persist(state.items)
    } catch (error) {
      state.error = safeErrorMessage(
        error,
        'Context changed, but session recovery could not be updated.',
      )
      throw error
    }
  }

  return {
    state: readonly(state),
    totalOriginalCharacters,
    hydrate,
    add,
    capture,
    remove,
    clear,
  }
}

function isDuplicate(left: ContextItem, right: ContextItem): boolean {
  return (
    left.kind === right.kind &&
    normalizeUrl(left.url) === normalizeUrl(right.url) &&
    left.text === right.text
  )
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.href
  } catch {
    return value.trim()
  }
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
