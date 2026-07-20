import type { AgentError } from './errors'

export type AgentAdapterType = 'openai-compatible'
export type ApiKeyStorageMode = 'session' | 'local'

export interface AgentProfile {
  id: string
  name: string
  adapter: AgentAdapterType
  baseUrl: string
  chatPath: string
  models: readonly string[]
  model?: string
  authHeader: string
  authScheme?: string
  apiKeyStorageMode: ApiKeyStorageMode
  requestTimeoutMs: number
  maxContextItemChars: number
  maxTotalContextChars: number
  systemPrompt?: string
  createdAt: number
  updatedAt: number
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AgentRequest {
  profile: AgentProfile
  apiKey: string
  messages: AgentMessage[]
}

export type AgentStreamEvent =
  | { type: 'content-delta'; text: string }
  | { type: 'completed' }
  | { type: 'error'; error: AgentError }

export interface AgentAdapter {
  testConnection(profile: AgentProfile, apiKey: string, signal?: AbortSignal): Promise<void>
  stream(request: AgentRequest, signal: AbortSignal): AsyncIterable<AgentStreamEvent>
}
