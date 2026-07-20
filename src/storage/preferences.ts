import type { StorageArea } from './storage-area'

export const SYNC_ENABLED_STORAGE_KEY = 'syncSettingsEnabled'

/**
 * Device-local preferences. These never sync: whether *this* device mirrors its
 * configuration to `chrome.storage.sync` is a per-device choice.
 */
export class PreferencesRepository {
  constructor(private readonly localStorage: StorageArea) {}

  async getSyncEnabled(): Promise<boolean> {
    const values = await this.localStorage.get(SYNC_ENABLED_STORAGE_KEY)
    return values[SYNC_ENABLED_STORAGE_KEY] === true
  }

  async setSyncEnabled(enabled: boolean): Promise<void> {
    await this.localStorage.set({ [SYNC_ENABLED_STORAGE_KEY]: enabled })
  }
}
