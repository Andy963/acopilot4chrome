import { describe, expect, it } from 'vitest'

import { DEFAULT_HISTORY_WINDOW, PreferencesRepository } from '../../src/storage/preferences'
import { MemoryStorage } from './memory-storage'

describe('PreferencesRepository', () => {
  it('defaults sync to disabled and round-trips the flag', async () => {
    const prefs = new PreferencesRepository(new MemoryStorage())

    expect(await prefs.getSyncEnabled()).toBe(false)

    await prefs.setSyncEnabled(true)
    expect(await prefs.getSyncEnabled()).toBe(true)

    await prefs.setSyncEnabled(false)
    expect(await prefs.getSyncEnabled()).toBe(false)
  })

  it('defaults the history window and clamps out-of-range values', async () => {
    const prefs = new PreferencesRepository(new MemoryStorage())

    expect(await prefs.getHistoryWindow()).toBe(DEFAULT_HISTORY_WINDOW)

    await prefs.setHistoryWindow(8)
    expect(await prefs.getHistoryWindow()).toBe(8)

    await prefs.setHistoryWindow(0)
    expect(await prefs.getHistoryWindow()).toBe(1)

    await prefs.setHistoryWindow(999)
    expect(await prefs.getHistoryWindow()).toBe(50)
  })

  it('defaults hidden URL patterns to empty and normalizes what it stores', async () => {
    const prefs = new PreferencesRepository(new MemoryStorage())

    expect(await prefs.getHiddenUrlPatterns()).toEqual([])

    await prefs.setHiddenUrlPatterns(['  ^https://a\\.com/  ', '', '^https://a\\.com/', '^b\\.net'])
    expect(await prefs.getHiddenUrlPatterns()).toEqual(['^https://a\\.com/', '^b\\.net'])
  })

  it('ignores hidden URL patterns stored in an unexpected shape', async () => {
    const storage = new MemoryStorage()
    const prefs = new PreferencesRepository(storage)

    await storage.set({ hiddenUrlPatterns: 'example\\.com' })
    expect(await prefs.getHiddenUrlPatterns()).toEqual([])

    await storage.set({ hiddenUrlPatterns: ['a\\.com', 7, null] })
    expect(await prefs.getHiddenUrlPatterns()).toEqual(['a\\.com'])
  })
})
