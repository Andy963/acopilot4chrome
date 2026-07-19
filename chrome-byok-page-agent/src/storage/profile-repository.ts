import type { AgentProfile } from '../agent/adapter'
import type { SecretRepository } from './secret-repository'
import type { StorageArea } from './storage-area'

export const PROFILES_STORAGE_KEY = 'agentProfiles'
export const ACTIVE_PROFILE_ID_STORAGE_KEY = 'activeProfileId'

export class ProfileRepository {
  constructor(
    private readonly localStorage: StorageArea,
    private readonly secrets: SecretRepository,
  ) {}

  async list(): Promise<AgentProfile[]> {
    const values = await this.localStorage.get(PROFILES_STORAGE_KEY)
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
    const profiles = await this.list()
    const safeProfile = sanitizeProfile(profile)
    const index = profiles.findIndex((candidate) => candidate.id === profile.id)

    if (index === -1) {
      profiles.push(safeProfile)
    } else {
      profiles[index] = safeProfile
    }

    await this.localStorage.set({ [PROFILES_STORAGE_KEY]: profiles })
  }

  async delete(profileId: string): Promise<void> {
    const profiles = await this.list()
    const remaining = profiles.filter((profile) => profile.id !== profileId)

    await this.secrets.delete(profileId)
    await this.localStorage.set({ [PROFILES_STORAGE_KEY]: remaining })

    if ((await this.getActiveProfileId()) === profileId) {
      await this.localStorage.remove(ACTIVE_PROFILE_ID_STORAGE_KEY)
    }
  }

  async getActiveProfileId(): Promise<string | null> {
    const values = await this.localStorage.get(ACTIVE_PROFILE_ID_STORAGE_KEY)
    const value = values[ACTIVE_PROFILE_ID_STORAGE_KEY]
    return typeof value === 'string' ? value : null
  }

  async setActiveProfileId(profileId: string | null): Promise<void> {
    if (profileId === null) {
      await this.localStorage.remove(ACTIVE_PROFILE_ID_STORAGE_KEY)
      return
    }

    await this.localStorage.set({ [ACTIVE_PROFILE_ID_STORAGE_KEY]: profileId })
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
  const safeProfile = { ...profile } as AgentProfile & { apiKey?: unknown }
  delete safeProfile.apiKey
  return safeProfile
}
