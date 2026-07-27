import { MAX_URL_PATTERNS } from '../permissions/url-blocklist'
import type { StorageArea } from './storage-area'

export const SYNC_ENABLED_STORAGE_KEY = 'syncSettingsEnabled'
export const HISTORY_WINDOW_STORAGE_KEY = 'historyWindowTurns'
export const HIDDEN_URL_PATTERNS_STORAGE_KEY = 'hiddenUrlPatterns'

export const DEFAULT_HISTORY_WINDOW = 4
export const MIN_HISTORY_WINDOW = 1
export const MAX_HISTORY_WINDOW = 50

export function clampHistoryWindow(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HISTORY_WINDOW
  return Math.min(MAX_HISTORY_WINDOW, Math.max(MIN_HISTORY_WINDOW, Math.round(value)))
}

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

  async getHistoryWindow(): Promise<number> {
    const values = await this.localStorage.get(HISTORY_WINDOW_STORAGE_KEY)
    const stored = values[HISTORY_WINDOW_STORAGE_KEY]
    return typeof stored === 'number' ? clampHistoryWindow(stored) : DEFAULT_HISTORY_WINDOW
  }

  async setHistoryWindow(turns: number): Promise<void> {
    await this.localStorage.set({ [HISTORY_WINDOW_STORAGE_KEY]: clampHistoryWindow(turns) })
  }

  async getHiddenUrlPatterns(): Promise<string[]> {
    const values = await this.localStorage.get(HIDDEN_URL_PATTERNS_STORAGE_KEY)
    return sanitizeUrlPatterns(values[HIDDEN_URL_PATTERNS_STORAGE_KEY])
  }

  async setHiddenUrlPatterns(patterns: readonly string[]): Promise<void> {
    await this.localStorage.set({
      [HIDDEN_URL_PATTERNS_STORAGE_KEY]: sanitizeUrlPatterns(patterns),
    })
  }
}

function sanitizeUrlPatterns(stored: unknown): string[] {
  if (!Array.isArray(stored)) return []
  const seen = new Set<string>()
  const patterns: string[] = []
  for (const entry of stored) {
    if (typeof entry !== 'string') continue
    const pattern = entry.trim()
    if (pattern === '' || seen.has(pattern)) continue
    seen.add(pattern)
    patterns.push(pattern)
    if (patterns.length === MAX_URL_PATTERNS) break
  }
  return patterns
}
