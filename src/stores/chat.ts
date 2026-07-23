import { computed, reactive, readonly } from 'vue'

import type { AgentAdapter, AgentMessage, AgentProfile, AgentRequest } from '../agent/adapter'
import type { AgentError } from '../agent/errors'
import { buildPromptMessages } from '../context/prompt-builder'
import { applyTotalContextLimit } from '../context/truncate'
import type { ChatMessage, ChatSession, ContextItem } from '../context/types'

export type ChatPhase = 'idle' | 'validating' | 'requesting' | 'streaming' | 'failed'

const MAX_ATTEMPTS = 3

export interface ChatStoreDependencies {
  adapter: AgentAdapter
  loadApiKey(profile: AgentProfile): Promise<string | undefined>
  persist(messages: readonly ChatMessage[]): Promise<void>
  createId(): string
  now(): number
  delay?(ms: number): Promise<void>
}

export function createChatStore(dependencies: ChatStoreDependencies) {
  const state = reactive({
    messages: [] as ChatMessage[],
    phase: 'idle' as ChatPhase,
    error: null as string | null,
    canRetry: false,
  })
  let abortController: AbortController | null = null
  let cancelledManually = false
  let lastPrompt: AgentMessage[] | null = null
  let requestGeneration = 0

  const delay =
    dependencies.delay ?? ((ms: number) => new Promise<void>((r) => globalThis.setTimeout(r, ms)))
  const active = computed(() => ['validating', 'requesting', 'streaming'].includes(state.phase))

  function hydrate(session: ChatSession | null): void {
    requestGeneration += 1
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
    state.canRetry = false
    lastPrompt = null
  }

  async function send(
    question: string,
    profile: AgentProfile | null,
    contextItems: readonly ContextItem[],
    images: readonly string[] = [],
    historyWindow: number = Number.POSITIVE_INFINITY,
  ): Promise<boolean> {
    const latestQuestion = question.trim()
    if (!latestQuestion || active.value) return false
    if (!profile) {
      state.error = 'Configure an agent before sending a message.'
      state.phase = 'failed'
      return false
    }

    const generation = ++requestGeneration
    state.phase = 'validating'
    state.error = null
    state.canRetry = false
    lastPrompt = null
    const apiKey = await dependencies.loadApiKey(profile)
    if (generation !== requestGeneration) return false
    if (!apiKey) {
      state.error = 'Enter an API key in Agent settings.'
      state.phase = 'failed'
      return false
    }

    const attachedImages = images.filter((url) => url.trim().length > 0)
    const completeHistory = state.messages.filter((message) => message.status === 'complete')
    const history = limitHistoryByRounds(completeHistory, historyWindow)
    const limitedContextItems = applyTotalContextLimit(contextItems, profile.maxTotalContextChars)
    const messages = buildPromptMessages({
      contextItems: limitedContextItems,
      history,
      latestQuestion,
      ...(attachedImages.length ? { latestImages: attachedImages } : {}),
      ...(profile.systemPrompt ? { systemPrompt: profile.systemPrompt } : {}),
    })
    const createdAt = dependencies.now()
    const userMessage: ChatMessage = {
      id: dependencies.createId(),
      role: 'user',
      content: latestQuestion,
      ...(attachedImages.length ? { images: attachedImages } : {}),
      ...(limitedContextItems.length ? { contextItems: limitedContextItems } : {}),
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
    lastPrompt = messages
    await persist()
    if (generation !== requestGeneration) return false

    const result = await streamRequest(assistantIndex, { profile, apiKey, messages }, generation)
    if (generation === requestGeneration && result !== 'error') lastPrompt = null
    return result === 'ok'
  }

  async function retry(profile: AgentProfile | null): Promise<boolean> {
    if (active.value || !lastPrompt) return false
    if (!profile) {
      state.error = 'Configure an agent before sending a message.'
      state.phase = 'failed'
      return false
    }

    const generation = ++requestGeneration
    state.phase = 'validating'
    state.error = null
    state.canRetry = false
    const apiKey = await dependencies.loadApiKey(profile)
    if (generation !== requestGeneration) return false
    if (!apiKey) {
      state.error = 'Enter an API key in Agent settings.'
      state.phase = 'failed'
      state.canRetry = true
      return false
    }

    const prompt = lastPrompt
    if (!prompt) return false

    // Drop the failed/cancelled reply so a successful retry doesn't leave a
    // dead "Response failed" bubble behind.
    const last = state.messages[state.messages.length - 1]
    if (
      last &&
      last.role === 'assistant' &&
      (last.status === 'error' || last.status === 'cancelled')
    ) {
      state.messages.pop()
    }
    const assistantMessage: ChatMessage = {
      id: dependencies.createId(),
      role: 'assistant',
      content: '',
      createdAt: dependencies.now(),
      status: 'streaming',
    }
    state.messages.push(assistantMessage)
    const assistantIndex = state.messages.length - 1
    await persist()
    if (generation !== requestGeneration) return false

    const result = await streamRequest(
      assistantIndex,
      { profile, apiKey, messages: prompt },
      generation,
    )
    if (generation === requestGeneration && result !== 'error') lastPrompt = null
    return result === 'ok'
  }

  /**
   * Stream one request into the assistant message at `assistantIndex`, retrying
   * retryable failures up to MAX_ATTEMPTS. Each attempt starts from empty text.
   */
  async function streamRequest(
    assistantIndex: number,
    request: AgentRequest,
    generation: number,
  ): Promise<'ok' | 'cancelled' | 'error'> {
    cancelledManually = false

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (generation !== requestGeneration) return 'cancelled'
      const message = state.messages[assistantIndex]
      if (!message) return 'cancelled'
      message.content = ''
      message.status = 'streaming'
      const controller = new AbortController()
      abortController = controller
      state.phase = 'requesting'

      let streamError: AgentError | null = null
      try {
        for await (const event of dependencies.adapter.stream(request, controller.signal)) {
          if (generation !== requestGeneration) return 'cancelled'
          if (event.type === 'content-delta') {
            state.phase = 'streaming'
            message.content += event.text
            await persist()
            if (generation !== requestGeneration) return 'cancelled'
          } else if (event.type === 'error') {
            streamError = event.error
            break
          } else if (event.type === 'completed') {
            message.status = 'complete'
          }
        }
      } catch (error) {
        streamError = controller.signal.aborted
          ? { code: 'CANCELLED', message: 'The request was cancelled.', retryable: false }
          : {
              code: 'NETWORK_ERROR',
              message: safeErrorMessage(error, 'The agent request failed.'),
              retryable: true,
            }
      } finally {
        if (abortController === controller) abortController = null
      }

      if (generation !== requestGeneration) return 'cancelled'

      if (streamError) {
        if (streamError.code === 'CANCELLED' || controller.signal.aborted || cancelledManually) {
          message.status = 'cancelled'
          state.phase = 'idle'
          await persist()
          if (generation !== requestGeneration) return 'cancelled'
          return 'cancelled'
        }
        if (streamError.retryable && attempt < MAX_ATTEMPTS) {
          await delay(400 * attempt)
          if (generation !== requestGeneration) return 'cancelled'
          if (cancelledManually) {
            message.status = 'cancelled'
            state.phase = 'idle'
            await persist()
            if (generation !== requestGeneration) return 'cancelled'
            return 'cancelled'
          }
          continue
        }
        message.status = 'error'
        state.error = streamError.message
        state.phase = 'failed'
        state.canRetry = true
        await persist()
        if (generation !== requestGeneration) return 'cancelled'
        return 'error'
      }

      if (message.status === 'streaming') message.status = 'complete'
      state.phase = 'idle'
      state.canRetry = false
      await persist()
      if (generation !== requestGeneration) return 'cancelled'
      return 'ok'
    }

    return 'error'
  }

  function cancel(): void {
    cancelledManually = true
    abortController?.abort()
  }

  async function clear(): Promise<void> {
    requestGeneration += 1
    if (active.value) cancel()
    state.messages = []
    state.phase = 'idle'
    state.error = null
    state.canRetry = false
    lastPrompt = null
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
    retry,
    cancel,
    clear,
  }
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Keep only the most recent `window` conversation rounds — i.e. the last
 * `window` complete user messages and the assistant replies that follow them.
 * A non-finite window keeps the whole history.
 */
export function limitHistoryByRounds(
  messages: readonly ChatMessage[],
  window: number,
): ChatMessage[] {
  if (!Number.isFinite(window)) return [...messages]
  const rounds = Math.max(0, Math.floor(window))
  if (rounds === 0) return []

  let userCount = 0
  let startIndex = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    startIndex = i
    if (messages[i]!.role === 'user') {
      userCount += 1
      if (userCount >= rounds) break
    }
  }
  return messages.slice(startIndex)
}
