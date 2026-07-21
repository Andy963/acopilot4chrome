import { reactive, readonly, shallowRef } from 'vue'

import type { AgentProfile, ApiKeyStorageMode } from '../agent/adapter'

export interface AgentProfileDraft {
  name: string
  baseUrl: string
  chatPath: string
  models: string[]
  visionModels: string[]
  authHeader: string
  authScheme?: string
  apiKeyStorageMode: ApiKeyStorageMode
  requestTimeoutMs: number
  maxContextItemChars: number
  maxTotalContextChars: number
  systemPrompt?: string
}

export interface AgentSettingsSubmission {
  profile: AgentProfileDraft
  apiKey: string
}

export interface ProfileStoreDependencies {
  loadActiveProfile(): Promise<AgentProfile | null>
  saveProfile(
    current: AgentProfile | null,
    draft: AgentProfileDraft,
    apiKey: string,
  ): Promise<AgentProfile>
  testConnection(current: AgentProfile | null, submission: AgentSettingsSubmission): Promise<void>
  deleteProfile(profile: AgentProfile): Promise<void>
  updateActiveModel(profile: AgentProfile, model: string): Promise<AgentProfile>
}

export function createProfileStore(dependencies: ProfileStoreDependencies) {
  const profile = shallowRef<AgentProfile | null>(null)
  const state = reactive({
    busy: false,
    error: null as string | null,
    connectionStatus: 'idle' as 'idle' | 'success' | 'error',
    connectionMessage: null as string | null,
  })

  async function restore(): Promise<void> {
    state.busy = true
    state.error = null
    try {
      profile.value = await dependencies.loadActiveProfile()
    } catch (error) {
      state.error = safeErrorMessage(error, 'Unable to load Agent settings.')
    } finally {
      state.busy = false
    }
  }

  async function save(submission: AgentSettingsSubmission): Promise<boolean> {
    if (state.busy) return false
    state.busy = true
    state.error = null
    try {
      profile.value = await dependencies.saveProfile(
        profile.value,
        submission.profile,
        submission.apiKey,
      )
      state.connectionMessage = 'Agent settings saved.'
      state.connectionStatus = 'success'
      return true
    } catch (error) {
      state.error = safeErrorMessage(error, 'Unable to save Agent settings.')
      state.connectionMessage = state.error
      state.connectionStatus = 'error'
      return false
    } finally {
      state.busy = false
    }
  }

  async function test(submission: AgentSettingsSubmission): Promise<void> {
    if (state.busy) return
    state.busy = true
    state.connectionStatus = 'idle'
    state.connectionMessage = 'Testing the endpoint…'
    try {
      await dependencies.testConnection(profile.value, submission)
      state.connectionStatus = 'success'
      state.connectionMessage = 'Connection succeeded and the response format is compatible.'
    } catch (error) {
      state.connectionStatus = 'error'
      state.connectionMessage = safeErrorMessage(error, 'Connection test failed.')
    } finally {
      state.busy = false
    }
  }

  async function remove(): Promise<boolean> {
    if (!profile.value || state.busy) return false
    state.busy = true
    state.error = null
    try {
      await dependencies.deleteProfile(profile.value)
      profile.value = null
      state.connectionStatus = 'idle'
      state.connectionMessage = null
      return true
    } catch (error) {
      state.error = safeErrorMessage(error, 'Unable to delete Agent settings.')
      return false
    } finally {
      state.busy = false
    }
  }

  async function selectModel(model: string): Promise<void> {
    const current = profile.value
    if (!current || current.model === model) return
    try {
      profile.value = await dependencies.updateActiveModel(current, model)
    } catch (error) {
      state.error = safeErrorMessage(error, 'Unable to switch the model.')
    }
  }

  return {
    profile: readonly(profile),
    state: readonly(state),
    restore,
    save,
    test,
    remove,
    selectModel,
  }
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
