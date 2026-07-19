import { describe, expect, it } from 'vitest'

import { SecretRepository, secretKey } from '../../src/storage/secret-repository'
import { MemoryStorage } from './memory-storage'

describe('SecretRepository', () => {
  it('keeps session secrets out of local storage', async () => {
    const session = new MemoryStorage()
    const local = new MemoryStorage()
    const repository = new SecretRepository(session, local)

    await repository.set('profile-1', 'session-key', 'session')

    expect(session.values[secretKey('profile-1')]).toBe('session-key')
    expect(local.values[secretKey('profile-1')]).toBeUndefined()
    expect(await repository.get('profile-1', 'session')).toBe('session-key')
    expect(await repository.get('profile-1', 'local')).toBeNull()
  })

  it('moves a secret only after explicit local mode selection', async () => {
    const session = new MemoryStorage()
    const local = new MemoryStorage()
    const repository = new SecretRepository(session, local)

    await repository.set('profile-1', 'session-key', 'session')
    await repository.set('profile-1', 'local-key', 'local')

    expect(session.values[secretKey('profile-1')]).toBeUndefined()
    expect(local.values[secretKey('profile-1')]).toBe('local-key')
  })

  it('deletes secrets from both storage areas', async () => {
    const session = new MemoryStorage()
    const local = new MemoryStorage()
    const repository = new SecretRepository(session, local)
    session.values[secretKey('profile-1')] = 'session-key'
    local.values[secretKey('profile-1')] = 'local-key'

    await repository.delete('profile-1')

    expect(session.values[secretKey('profile-1')]).toBeUndefined()
    expect(local.values[secretKey('profile-1')]).toBeUndefined()
  })
})
