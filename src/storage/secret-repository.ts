import type { ApiKeyStorageMode } from '../agent/adapter'
import type { StorageArea } from './storage-area'

const SECRET_KEY_PREFIX = 'agentSecret:'

export class SecretRepository {
  constructor(
    private readonly sessionStorage: StorageArea,
    private readonly localStorage: StorageArea,
  ) {}

  async get(profileId: string, mode: ApiKeyStorageMode): Promise<string | null> {
    const key = secretKey(profileId)
    const storage = this.storageFor(mode)
    const values = await storage.get(key)
    return typeof values[key] === 'string' ? values[key] : null
  }

  async set(profileId: string, apiKey: string, mode: ApiKeyStorageMode): Promise<void> {
    const key = secretKey(profileId)
    const target = this.storageFor(mode)
    const other = mode === 'session' ? this.localStorage : this.sessionStorage

    await other.remove(key)
    await target.set({ [key]: apiKey })
  }

  async delete(profileId: string): Promise<void> {
    const key = secretKey(profileId)
    await Promise.all([this.sessionStorage.remove(key), this.localStorage.remove(key)])
  }

  private storageFor(mode: ApiKeyStorageMode): StorageArea {
    return mode === 'local' ? this.localStorage : this.sessionStorage
  }
}

export function secretKey(profileId: string): string {
  return `${SECRET_KEY_PREFIX}${profileId}`
}
