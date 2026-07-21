import type { AgentProfile } from '../agent/adapter'
import type { SecretRepository } from './secret-repository'
import type { StorageArea } from './storage-area'

export const PROFILES_STORAGE_KEY = 'agentProfiles'
export const ACTIVE_PROFILE_ID_STORAGE_KEY = 'activeProfileId'

export class ProfileRepository {
  constructor(
    private readonly localStorage: StorageArea,
    private readonly syncStorage: StorageArea,
    private readonly secrets: SecretRepository,
    private readonly isSyncEnabled: () => Promise<boolean> = async () => false,
  ) {}

  private async store(): Promise<StorageArea> {
    return (await this.isSyncEnabled()) ? this.syncStorage : this.localStorage
  }

  async list(): Promise<AgentProfile[]> {
    const store = await this.store()
    const values = await store.get(PROFILES_STORAGE_KEY)
    const stored = values[PROFILES_STORAGE_KEY]
    if (!Array.isArray(stored)) {
      return []
    }

    return stored.filter(isAgentProfile).map((profile) => sanitizeProfile(profile))
  }

  async get(profileId: string): Promise<AgentProfile | null> {
    const profiles = await this.list()
    return profiles.find((profile) => profile.id === profileId) ?? null
  }

  async save(profile: AgentProfile): Promise<void> {
    const store = await this.store()
    const profiles = await this.list()
    const safeProfile = sanitizeProfile(profile)
    const index = profiles.findIndex((candidate) => candidate.id === profile.id)

    if (index === -1) {
      profiles.push(safeProfile)
    } else {
      profiles[index] = safeProfile
    }

    await store.set({ [PROFILES_STORAGE_KEY]: profiles })
  }

  async delete(profileId: string): Promise<void> {
    const store = await this.store()
    const profiles = await this.list()
    const remaining = profiles.filter((profile) => profile.id !== profileId)

    await this.secrets.delete(profileId)
    await store.set({ [PROFILES_STORAGE_KEY]: remaining })

    if ((await this.getActiveProfileId()) === profileId) {
      await store.remove(ACTIVE_PROFILE_ID_STORAGE_KEY)
    }
  }

  async getActiveProfileId(): Promise<string | null> {
    const store = await this.store()
    const values = await store.get(ACTIVE_PROFILE_ID_STORAGE_KEY)
    const value = values[ACTIVE_PROFILE_ID_STORAGE_KEY]
    return typeof value === 'string' ? value : null
  }

  async setActiveProfileId(profileId: string | null): Promise<void> {
    const store = await this.store()
    if (profileId === null) {
      await store.remove(ACTIVE_PROFILE_ID_STORAGE_KEY)
      return
    }

    await store.set({ [ACTIVE_PROFILE_ID_STORAGE_KEY]: profileId })
  }

  /**
   * Copy profiles and the active selection between the local and sync stores.
   * Called just before flipping the sync preference so the target store is
   * seeded with the current configuration. API keys are never touched here.
   */
  async mirror(toSync: boolean): Promise<void> {
    const from = toSync ? this.localStorage : this.syncStorage
    const to = toSync ? this.syncStorage : this.localStorage
    const values = await from.get([PROFILES_STORAGE_KEY, ACTIVE_PROFILE_ID_STORAGE_KEY])

    const profiles = values[PROFILES_STORAGE_KEY]
    if (Array.isArray(profiles)) {
      await to.set({ [PROFILES_STORAGE_KEY]: profiles.filter(isAgentProfile).map(sanitizeProfile) })
    }

    const active = values[ACTIVE_PROFILE_ID_STORAGE_KEY]
    if (typeof active === 'string') {
      await to.set({ [ACTIVE_PROFILE_ID_STORAGE_KEY]: active })
    }
  }
}

function isAgentProfile(value: unknown): value is AgentProfile {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<AgentProfile>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    candidate.adapter === 'openai-compatible' &&
    typeof candidate.baseUrl === 'string' &&
    typeof candidate.chatPath === 'string' &&
    typeof candidate.authHeader === 'string' &&
    (candidate.apiKeyStorageMode === 'session' || candidate.apiKeyStorageMode === 'local') &&
    typeof candidate.requestTimeoutMs === 'number' &&
    typeof candidate.maxContextItemChars === 'number' &&
    typeof candidate.maxTotalContextChars === 'number' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  )
}

function sanitizeProfile(profile: AgentProfile): AgentProfile {
  const working: Record<string, unknown> = { ...profile }
  delete working.apiKey

  // Normalize the model list and migrate legacy single-model profiles.
  const rawModels = working.models
  const models = Array.isArray(rawModels)
    ? rawModels.filter((model): model is string => typeof model === 'string' && model !== '')
    : typeof working.model === 'string' && working.model !== ''
      ? [working.model]
      : []
  working.models = models

  // Keep the active model valid against the list.
  const active =
    typeof working.model === 'string' && models.includes(working.model) ? working.model : models[0]
  if (active === undefined) {
    delete working.model
  } else {
    working.model = active
  }

  // Keep the vision-capable set a subset of the known models.
  const rawVision = working.visionModels
  const visionModels = Array.isArray(rawVision)
    ? rawVision.filter(
        (model): model is string => typeof model === 'string' && models.includes(model),
      )
    : []
  if (visionModels.length > 0) {
    working.visionModels = visionModels
  } else {
    delete working.visionModels
  }

  return working as unknown as AgentProfile
}
