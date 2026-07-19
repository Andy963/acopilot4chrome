import { describe, expect, it } from 'vitest'

import type { AgentProfile } from '../../src/agent/adapter'
import {
  ACTIVE_PROFILE_ID_STORAGE_KEY,
  ProfileRepository,
  PROFILES_STORAGE_KEY,
} from '../../src/storage/profile-repository'
import { SecretRepository, secretKey } from '../../src/storage/secret-repository'
import { MemoryStorage } from './memory-storage'

describe('ProfileRepository', () => {
  it('never persists an API key as profile state', async () => {
    const local = new MemoryStorage()
    const secrets = new SecretRepository(new MemoryStorage(), local)
    const repository = new ProfileRepository(local, secrets)
    const unsafe = { ...profile(), apiKey: 'must-not-persist' }

    await repository.save(unsafe)

    const stored = local.values[PROFILES_STORAGE_KEY] as Array<Record<string, unknown>>
    expect(stored[0]).not.toHaveProperty('apiKey')
  })

  it('deletes the profile, active selection, and both secret variants', async () => {
    const session = new MemoryStorage()
    const local = new MemoryStorage()
    const secrets = new SecretRepository(session, local)
    const repository = new ProfileRepository(local, secrets)
    await repository.save(profile())
    await repository.setActiveProfileId('profile-1')
    session.values[secretKey('profile-1')] = 'session-key'
    local.values[secretKey('profile-1')] = 'local-key'

    await repository.delete('profile-1')

    expect(await repository.list()).toEqual([])
    expect(local.values[ACTIVE_PROFILE_ID_STORAGE_KEY]).toBeUndefined()
    expect(session.values[secretKey('profile-1')]).toBeUndefined()
    expect(local.values[secretKey('profile-1')]).toBeUndefined()
  })
})

function profile(): AgentProfile {
  return {
    id: 'profile-1',
    name: 'Test',
    adapter: 'openai-compatible',
    baseUrl: 'https://example.com/v1',
    chatPath: 'chat/completions',
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    apiKeyStorageMode: 'session',
    requestTimeoutMs: 30_000,
    maxContextItemChars: 50_000,
    maxTotalContextChars: 100_000,
    createdAt: 1,
    updatedAt: 1,
  }
}
