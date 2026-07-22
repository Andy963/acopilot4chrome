<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { OpenAICompatibleAdapter } from '../../src/agent/openai-compatible'
import type { AgentProfile } from '../../src/agent/adapter'
import { validateAgentProfile } from '../../src/agent/url'
import AgentSettings from '../../src/components/AgentSettings.vue'
import ChatComposer from '../../src/components/ChatComposer.vue'
import ChatMessage from '../../src/components/ChatMessage.vue'
import ContextList from '../../src/components/ContextList.vue'
import EmptyState from '../../src/components/EmptyState.vue'
import type { ChatMessage as ChatMessageData, ContextItem } from '../../src/context/types'
import { prepareSelectionText } from '../../src/context/extract-selection'
import { DEFAULT_MAX_TOTAL_CONTEXT_CHARS } from '../../src/context/truncate'
import { sendRuntimeRequest } from '../../src/messaging/messages'
import {
  ensureEndpointPermission,
  removeEndpointPermissionIfUnused,
} from '../../src/permissions/endpoint-permission'
import { createId } from '../../src/shared/ids'
import {
  clampHistoryWindow,
  DEFAULT_HISTORY_WINDOW,
  PreferencesRepository,
} from '../../src/storage/preferences'
import { ProfileRepository } from '../../src/storage/profile-repository'
import { SecretRepository } from '../../src/storage/secret-repository'
import { SessionRepository } from '../../src/storage/session-repository'
import { captureBrowserContext } from '../../src/stores/browser-capture'
import { createChatStore } from '../../src/stores/chat'
import { createContextStore } from '../../src/stores/context'
import {
  createProfileStore,
  type AgentProfileDraft,
  type AgentSettingsSubmission,
} from '../../src/stores/profiles'

const secrets = new SecretRepository(chrome.storage.session, chrome.storage.local)
const preferences = new PreferencesRepository(chrome.storage.local)
const profiles = new ProfileRepository(chrome.storage.local, chrome.storage.sync, secrets, () =>
  preferences.getSyncEnabled(),
)
const sessions = new SessionRepository(chrome.storage.session)
const adapter = new OpenAICompatibleAdapter()

const settingsVisible = ref(false)
const restoring = ref(true)
const appError = ref<string | null>(null)
const messageList = ref<HTMLElement>()
const syncEnabled = ref(false)
const historyWindow = ref(DEFAULT_HISTORY_WINDOW)
const pinnedToBottom = ref(true)

let sessionId = createId()
let sessionCreatedAt = Date.now()
let currentContextItems: readonly ContextItem[] = []
let currentMessages: readonly ChatMessageData[] = []
let persistenceQueue = Promise.resolve()

const profileStore = createProfileStore({
  async loadActiveProfile() {
    const activeId = await profiles.getActiveProfileId()
    return activeId ? profiles.get(activeId) : null
  },
  async saveProfile(current, draft, apiKey) {
    const now = Date.now()
    const profile = buildProfile(current, draft, now)
    validateAgentProfile(profile)
    const permission = await ensureEndpointPermission(draft.baseUrl, chrome.permissions)
    if (!permission.ok) throw new Error(permission.error.message)

    const resolvedKey = await resolveApiKey(current, apiKey)
    if (!resolvedKey) throw new Error('An API key is required.')

    await profiles.save(profile)
    await secrets.set(profile.id, resolvedKey, profile.apiKeyStorageMode)
    await profiles.setActiveProfileId(profile.id)
    return profile
  },
  async testConnection(current, submission) {
    const profile = buildProfile(current, submission.profile, Date.now())
    validateAgentProfile(profile)
    const permission = await ensureEndpointPermission(
      submission.profile.baseUrl,
      chrome.permissions,
    )
    if (!permission.ok) throw new Error(permission.error.message)

    const apiKey = await resolveApiKey(current, submission.apiKey)
    if (!apiKey) throw new Error('Enter an API key before testing the connection.')
    await adapter.testConnection(profile, apiKey)
  },
  async deleteProfile(profile) {
    await profiles.delete(profile.id)
    const remaining = await profiles.list()
    await removeEndpointPermissionIfUnused(profile.baseUrl, remaining, chrome.permissions)
  },
  async updateActiveModel(profile, model) {
    const updated: AgentProfile = { ...profile, model }
    await profiles.save(updated)
    return updated
  },
})

const contextStore = createContextStore({
  capture(kind) {
    return captureBrowserContext(kind, profileStore.profile.value?.maxContextItemChars ?? 50_000)
  },
  async persist(items) {
    currentContextItems = [...items]
    await persistSession()
  },
})

const chatStore = createChatStore({
  adapter,
  loadApiKey(profile) {
    return secrets.get(profile.id, profile.apiKeyStorageMode).then((key) => key ?? undefined)
  },
  async persist(messages) {
    currentMessages = [...messages]
    await persistSession()
  },
  createId,
  now: Date.now,
})

const combinedError = computed(
  () =>
    appError.value ?? profileStore.state.error ?? contextStore.state.error ?? chatStore.state.error,
)

const activeModelIsMultimodal = computed(() => {
  const profile = profileStore.profile.value
  if (!profile) return false
  const active = profile.model ?? profile.models?.[0]
  return !!active && (profile.visionModels?.includes(active) ?? false)
})

async function persistSession(): Promise<void> {
  const snapshot = {
    id: sessionId,
    profileId: profileStore.profile.value?.id ?? '',
    contextItems: [...currentContextItems],
    messages: [...currentMessages],
    createdAt: sessionCreatedAt,
    updatedAt: Date.now(),
  }
  persistenceQueue = persistenceQueue.then(() => sessions.saveActiveSession(snapshot))
  await persistenceQueue
}

async function restore(): Promise<void> {
  restoring.value = true
  appError.value = null
  try {
    syncEnabled.value = await preferences.getSyncEnabled()
    historyWindow.value = await preferences.getHistoryWindow()
    await profileStore.restore()
    const session = await sessions.loadActiveSession()
    const activeProfileId = profileStore.profile.value?.id
    const canRestore = session && (!session.profileId || session.profileId === activeProfileId)
    if (canRestore) {
      sessionId = session.id
      sessionCreatedAt = session.createdAt
      currentContextItems = session.contextItems
      currentMessages = session.messages
      contextStore.hydrate(session.contextItems)
      chatStore.hydrate(session)
    }
    settingsVisible.value = profileStore.profile.value === null
    await consumePendingCaptures()
  } catch (error) {
    appError.value = safeErrorMessage(error, 'The side panel could not restore its session.')
  } finally {
    restoring.value = false
  }
}

async function consumePendingCaptures(): Promise<void> {
  const response = await sendRuntimeRequest<'pending-captures:list'>(chrome.runtime, {
    type: 'pending-captures:list',
  })
  if (!response.ok) {
    appError.value = response.error.message
    return
  }

  const captureIds: string[] = []
  for (const pending of response.value) {
    const maxChars = profileStore.profile.value?.maxContextItemChars ?? 50_000
    const context =
      pending.context.kind === 'selection'
        ? (() => {
            const prepared = prepareSelectionText(pending.context.text, maxChars)
            return {
              ...pending.context,
              text: prepared.text,
              originalCharCount: prepared.originalCharCount,
              truncated: prepared.truncated,
            }
          })()
        : pending.context
    try {
      await contextStore.add(context)
      captureIds.push(pending.id)
    } catch {
      appError.value = 'A pending page capture could not be restored.'
    }
  }
  if (!captureIds.length) return

  const acknowledgement = await sendRuntimeRequest(chrome.runtime, {
    type: 'pending-captures:ack',
    captureIds,
  })
  if (!acknowledgement.ok) appError.value = acknowledgement.error.message
}

async function saveSettings(submission: AgentSettingsSubmission): Promise<void> {
  if (await profileStore.save(submission)) {
    settingsVisible.value = false
    await persistSession()
  }
}

async function deleteProfile(): Promise<void> {
  if (!window.confirm('Delete this Agent profile and its saved API key?')) return
  if (await profileStore.remove()) {
    await chatStore.clear()
    settingsVisible.value = true
  }
}

async function setSync(enabled: boolean): Promise<void> {
  if (enabled === syncEnabled.value) return
  try {
    await profiles.mirror(enabled)
    await preferences.setSyncEnabled(enabled)
    syncEnabled.value = enabled
    await restore()
  } catch (error) {
    appError.value = safeErrorMessage(error, 'Unable to change the sync setting.')
  }
}

async function submitQuestion(question: string, images: string[]): Promise<void> {
  pinnedToBottom.value = true
  const sent = await chatStore.send(
    question,
    profileStore.profile.value,
    contextStore.state.items,
    images,
    historyWindow.value,
  )
  // Context belongs to the question it was sent with, so release the staging
  // area once it has been folded into that message.
  if (sent) await contextStore.clear()
}

async function retryLast(): Promise<void> {
  pinnedToBottom.value = true
  await chatStore.retry(profileStore.profile.value)
}

async function updateHistoryWindow(value: number): Promise<void> {
  const clamped = clampHistoryWindow(value)
  historyWindow.value = clamped
  try {
    await preferences.setHistoryWindow(clamped)
  } catch (error) {
    appError.value = safeErrorMessage(error, 'Unable to save the history window.')
  }
}

function onMessagesScroll(): void {
  const element = messageList.value
  if (element) {
    pinnedToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 48
  }
}

function buildProfile(
  current: AgentProfile | null,
  draft: AgentProfileDraft,
  updatedAt: number,
): AgentProfile {
  const models = draft.models
  const activeModel = current?.model && models.includes(current.model) ? current.model : models[0]
  const visionModels = draft.visionModels.filter((model) => models.includes(model))
  return {
    id: current?.id ?? createId(),
    name: draft.name,
    adapter: 'openai-compatible',
    baseUrl: draft.baseUrl,
    chatPath: draft.chatPath,
    models,
    ...(activeModel ? { model: activeModel } : {}),
    ...(visionModels.length ? { visionModels } : {}),
    authHeader: draft.authHeader,
    ...(draft.authScheme ? { authScheme: draft.authScheme } : {}),
    apiKeyStorageMode: draft.apiKeyStorageMode,
    requestTimeoutMs: draft.requestTimeoutMs,
    maxContextItemChars: draft.maxContextItemChars,
    maxTotalContextChars: draft.maxTotalContextChars,
    ...(draft.systemPrompt ? { systemPrompt: draft.systemPrompt } : {}),
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
  }
}

async function resolveApiKey(current: AgentProfile | null, input: string): Promise<string | null> {
  if (input) return input
  return current ? secrets.get(current.id, current.apiKeyStorageMode) : null
}

function handleRuntimeMessage(message: unknown): void {
  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'pending-captures:changed'
  ) {
    void consumePendingCaptures()
  }
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

watch(
  () => chatStore.state.messages.map((message) => `${message.id}:${message.content.length}`),
  () => {
    // Follow streaming output only while the user is parked at the bottom; if
    // they scroll up to read, stop yanking the view down.
    if (!pinnedToBottom.value) return
    void nextTick(() => {
      const element = messageList.value
      if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'instant' })
    })
  },
)

onMounted(() => {
  chrome.runtime.onMessage.addListener(handleRuntimeMessage)
  void restore()
})

onBeforeUnmount(() => {
  chatStore.cancel()
  chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
})
</script>

<template>
  <main class="app-shell">
    <AgentSettings
      v-if="settingsVisible"
      :profile="profileStore.profile.value"
      :busy="profileStore.state.busy"
      :connection-status="profileStore.state.connectionStatus"
      :connection-message="profileStore.state.connectionMessage ?? undefined"
      :sync-enabled="syncEnabled"
      @close="profileStore.profile.value && (settingsVisible = false)"
      @delete="deleteProfile"
      @save="saveSettings"
      @test="profileStore.test"
      @toggle-sync="setSync"
    />

    <template v-else>
      <header class="app-header">
        <div>
          <p>Acopilot</p>
          <span>{{ profileStore.profile.value?.name ?? 'No agent configured' }}</span>
        </div>
        <div class="header-actions">
          <button
            type="button"
            class="icon-button"
            aria-label="Open Agent settings"
            title="Settings"
            @click="settingsVisible = true"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              />
            </svg>
          </button>
        </div>
      </header>

      <div v-if="combinedError" class="banner banner--error" role="alert">
        {{ combinedError }}
      </div>
      <div v-else-if="contextStore.state.notice" class="banner" role="status">
        {{ contextStore.state.notice }}
      </div>

      <ContextList
        :items="contextStore.state.items"
        :capture-action="contextStore.state.captureAction"
        :history-window="historyWindow"
        :max-total-context-chars="
          profileStore.profile.value?.maxTotalContextChars ?? DEFAULT_MAX_TOTAL_CONTEXT_CHARS
        "
        @capture-selection="contextStore.capture('selection')"
        @capture-page="contextStore.capture('page')"
        @history-window-change="updateHistoryWindow"
        @clear="contextStore.clear"
        @remove="contextStore.remove"
      />

      <section
        ref="messageList"
        class="messages"
        aria-label="Conversation"
        aria-live="polite"
        @scroll="onMessagesScroll"
      >
        <p v-if="restoring" class="loading">Restoring session…</p>
        <EmptyState
          v-else-if="!chatStore.state.messages.length"
          title="Ready when you are"
          description="Captured page text is sent only when you press Send, directly to the configured endpoint."
        />
        <ChatMessage
          v-for="(message, index) in chatStore.state.messages"
          :key="message.id"
          :message="message"
          :can-retry="chatStore.state.canRetry && index === chatStore.state.messages.length - 1"
          @retry="retryLast"
        />
      </section>

      <ChatComposer
        :active="chatStore.active.value"
        :disabled="restoring || !profileStore.profile.value"
        :multimodal="activeModelIsMultimodal"
        :models="profileStore.profile.value?.models ?? []"
        :active-model="profileStore.profile.value?.model ?? profileStore.profile.value?.models?.[0]"
        @send="submitQuestion"
        @select-model="profileStore.selectModel"
        @cancel="chatStore.cancel"
      />
    </template>
  </main>
</template>

<style>
:root {
  color-scheme: light dark;
  --surface: #f7f7f5;
  --surface-raised: #ffffff;
  --surface-hover: #eeeeea;
  --text: #1f2421;
  --muted: #69716c;
  --border: #dedfda;
  --border-strong: #c7cac3;
  --accent: #15705f;
  --accent-soft: #dff3ed;
  --accent-contrast: #ffffff;
  --warning: #8b5b00;
  --warning-soft: #fff1cf;
  --danger: #a43d39;
  --danger-soft: #fbe8e6;
  --success: #256c47;
  --success-soft: #e1f3e8;
  --code-bg: #18201d;
  --code-text: #eef7f2;
  --font-sans:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-family: var(--font-sans);
  font-synthesis: none;
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface: #171a18;
    --surface-raised: #202522;
    --surface-hover: #2b302d;
    --text: #f0f2ef;
    --muted: #a6afa9;
    --border: #303732;
    --border-strong: #465049;
    --accent: #63cbb3;
    --accent-soft: #183e35;
    --accent-contrast: #10221d;
    --warning: #f1bf5c;
    --warning-soft: #3f3218;
    --danger: #f08f89;
    --danger-soft: #452321;
    --success: #79d69e;
    --success-soft: #193a27;
  }
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  min-width: 20rem;
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
}

button:focus-visible,
a:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.context-section,
.composer {
  flex: none;
}

.app-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.4rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
}

.app-header p,
.app-header span {
  margin: 0;
}

.app-header p {
  font-size: 0.9rem;
  font-weight: 750;
}

.app-header span {
  color: var(--muted);
  font-size: 0.7rem;
}

.app-header button {
  border: 1px solid var(--border-strong);
  border-radius: 0.5rem;
  padding: 0.45rem 0.65rem;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.app-header .icon-button {
  display: grid;
  place-items: center;
  padding: 0.35rem;
}

.banner {
  flex: none;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.75rem;
}

.banner--error {
  background: var(--danger-soft);
  color: var(--danger);
}

.messages {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  scroll-behavior: smooth;
}

.loading {
  margin: auto;
  color: var(--muted);
}

@media (max-width: 22rem) {
  .app-header,
  .messages {
    padding-right: 0.75rem;
    padding-left: 0.75rem;
  }
}
</style>
