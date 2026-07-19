import { computed, reactive, readonly } from 'vue'

import type { AgentAdapter, AgentProfile } from '../agent/adapter'
import { buildPromptMessages } from '../context/prompt-builder'
import { applyTotalContextLimit } from '../context/truncate'
import type { ChatMessage, ChatSession, ContextItem } from '../context/types'

export type ChatPhase = 'idle' | 'validating' | 'requesting' | 'streaming' | 'failed'

export interface ChatStoreDependencies {
  adapter: AgentAdapter
  loadApiKey(profile: AgentProfile): Promise<string | undefined>
  persist(messages: readonly ChatMessage[]): Promise<void>
  createId(): string
  now(): number
}

export function createChatStore(dependencies: ChatStoreDependencies) {
  const state = reactive({
    messages: [] as ChatMessage[],
    phase: 'idle' as ChatPhase,
    error: null as string | null,
  })
  let abortController: AbortController | null = null

  const active = computed(() => ['validating', 'requesting', 'streaming'].includes(state.phase))

  function hydrate(session: ChatSession | null): void {
    state.messages = (session?.messages ?? []).map((message) =>
      message.status === 'streaming'
        ? {
            ...message,
            status: 'error',
            content: message.content || 'The response was interrupted.',
          }
        : message,
    )
    state.phase = 'idle'
    state.error = null
  }

  async function send(
    question: string,
    profile: AgentProfile | null,
    contextItems: readonly ContextItem[],
  ): Promise<boolean> {
    const latestQuestion = question.trim()
    if (!latestQuestion || active.value) return false
    if (!profile) {
      state.error = 'Configure an agent before sending a message.'
      state.phase = 'failed'
      return false
    }

    state.phase = 'validating'
    state.error = null
    const apiKey = await dependencies.loadApiKey(profile)
    if (!apiKey) {
      state.error = 'Enter an API key in Agent settings.'
      state.phase = 'failed'
      return false
    }

    const history = state.messages.filter((message) => message.status === 'complete')
    const limitedContextItems = applyTotalContextLimit(contextItems, profile.maxTotalContextChars)
    const messages = buildPromptMessages({
      contextItems: limitedContextItems,
      history,
      latestQuestion,
      ...(profile.systemPrompt ? { systemPrompt: profile.systemPrompt } : {}),
    })
    const createdAt = dependencies.now()
    const userMessage: ChatMessage = {
      id: dependencies.createId(),
      role: 'user',
      content: latestQuestion,
      createdAt,
      status: 'complete',
    }
    const assistantMessage: ChatMessage = {
      id: dependencies.createId(),
      role: 'assistant',
      content: '',
      createdAt,
      status: 'streaming',
    }
    state.messages.push(userMessage, assistantMessage)
    const assistantIndex = state.messages.length - 1
    await persist()

    const controller = new AbortController()
    abortController = controller
    state.phase = 'requesting'
    try {
      const stream = dependencies.adapter.stream({ profile, apiKey, messages }, controller.signal)
      for await (const event of stream) {
        if (event.type === 'content-delta') {
          state.phase = 'streaming'
          state.messages[assistantIndex]!.content += event.text
          await persist()
        } else if (event.type === 'error') {
          throw new Error(event.error.message)
        } else if (event.type === 'completed') {
          state.messages[assistantIndex]!.status = 'complete'
        }
      }

      if (state.messages[assistantIndex]!.status === 'streaming') {
        state.messages[assistantIndex]!.status = 'complete'
      }
      state.phase = 'idle'
      await persist()
      return true
    } catch (error) {
      if (controller.signal.aborted) {
        state.messages[assistantIndex]!.status = 'cancelled'
        state.phase = 'idle'
      } else {
        state.messages[assistantIndex]!.status = 'error'
        state.error = safeErrorMessage(error, 'The agent request failed.')
        state.phase = 'failed'
      }
      await persist()
      return false
    } finally {
      abortController = null
    }
  }

  function cancel(): void {
    abortController?.abort()
  }

  async function clear(): Promise<void> {
    if (active.value) cancel()
    state.messages = []
    state.phase = 'idle'
    state.error = null
    await persist()
  }

  async function persist(): Promise<void> {
    try {
      await dependencies.persist(state.messages)
    } catch (error) {
      state.error = safeErrorMessage(error, 'Session recovery could not be updated.')
    }
  }

  return {
    state: readonly(state),
    active,
    hydrate,
    send,
    cancel,
    clear,
  }
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
