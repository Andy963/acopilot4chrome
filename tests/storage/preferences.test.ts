import { describe, expect, it } from 'vitest'

import { PreferencesRepository } from '../../src/storage/preferences'
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
})
