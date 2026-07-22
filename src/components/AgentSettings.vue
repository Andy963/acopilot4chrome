<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

import type { AgentProfile } from '../agent/adapter'
import type { AgentProfileDraft, AgentSettingsSubmission } from '../stores/profiles'

const props = defineProps<{
  profile: AgentProfile | null
  busy: boolean
  connectionStatus: 'idle' | 'success' | 'error'
  connectionMessage: string | undefined
  syncEnabled: boolean
}>()

const emit = defineEmits<{
  close: []
  delete: []
  save: [submission: AgentSettingsSubmission]
  test: [submission: AgentSettingsSubmission]
  toggleSync: [enabled: boolean]
}>()

function initialDraft(profile: AgentProfile | null): AgentProfileDraft {
  return {
    name: profile?.name ?? 'My agent',
    baseUrl: profile?.baseUrl ?? '',
    chatPath: profile?.chatPath ?? 'chat/completions',
    models: [...(profile?.models ?? [])],
    visionModels: [...(profile?.visionModels ?? [])],
    authHeader: profile?.authHeader ?? 'Authorization',
    authScheme: profile?.authScheme ?? 'Bearer',
    apiKeyStorageMode: profile?.apiKeyStorageMode ?? 'session',
    requestTimeoutMs: profile?.requestTimeoutMs ?? 60_000,
    maxContextItemChars: profile?.maxContextItemChars ?? 50_000,
    maxTotalContextChars: profile?.maxTotalContextChars ?? 100_000,
    systemPrompt: profile?.systemPrompt ?? '',
  }
}

interface ModelRow {
  name: string
  vision: boolean
}

function initialModelRows(profile: AgentProfile | null): ModelRow[] {
  const vision = new Set(profile?.visionModels ?? [])
  const rows = (profile?.models ?? []).map((name) => ({ name, vision: vision.has(name) }))
  return rows.length ? rows : [{ name: '', vision: false }]
}

const draft = reactive<AgentProfileDraft>(initialDraft(props.profile))
const apiKey = ref('')
const showApiKey = ref(false)
const persistentStorageConfirmed = ref(props.profile?.apiKeyStorageMode === 'local')
const modelRows = ref<ModelRow[]>(initialModelRows(props.profile))

watch(
  () => props.profile,
  (profile) => {
    Object.assign(draft, initialDraft(profile))
    apiKey.value = ''
    persistentStorageConfirmed.value = profile?.apiKeyStorageMode === 'local'
    modelRows.value = initialModelRows(profile)
  },
)

function addModel(): void {
  modelRows.value.push({ name: '', vision: false })
}

function removeModel(index: number): void {
  modelRows.value.splice(index, 1)
  if (modelRows.value.length === 0) modelRows.value.push({ name: '', vision: false })
}

function parseModelRows(rows: readonly ModelRow[]): { models: string[]; visionModels: string[] } {
  const seen = new Set<string>()
  const models: string[] = []
  const visionModels: string[] = []
  for (const row of rows) {
    const name = row.name.trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      models.push(name)
      if (row.vision) visionModels.push(name)
    }
  }
  return { models, visionModels }
}

function submission(): AgentSettingsSubmission {
  const authScheme = draft.authScheme?.trim()
  const systemPrompt = draft.systemPrompt?.trim()
  const { models, visionModels } = parseModelRows(modelRows.value)
  return {
    profile: {
      name: draft.name,
      baseUrl: draft.baseUrl,
      chatPath: draft.chatPath,
      models,
      visionModels,
      authHeader: draft.authHeader,
      ...(authScheme ? { authScheme } : {}),
      apiKeyStorageMode: draft.apiKeyStorageMode,
      requestTimeoutMs: draft.requestTimeoutMs,
      maxContextItemChars: draft.maxContextItemChars,
      maxTotalContextChars: draft.maxTotalContextChars,
      ...(systemPrompt ? { systemPrompt } : {}),
    },
    apiKey: apiKey.value,
  }
}

function setStorageMode(remember: boolean): void {
  draft.apiKeyStorageMode = remember ? 'local' : 'session'
  persistentStorageConfirmed.value = remember
}

function submit(): void {
  if (draft.apiKeyStorageMode === 'local' && !persistentStorageConfirmed.value) return
  emit('save', submission())
}

const importInput = ref<HTMLInputElement>()
const importError = ref('')

function exportSettings(): void {
  const { models, visionModels } = parseModelRows(modelRows.value)
  const data = {
    type: 'acopilot4chrome-settings',
    version: 1,
    profile: {
      name: draft.name,
      baseUrl: draft.baseUrl,
      chatPath: draft.chatPath,
      models,
      visionModels,
      authHeader: draft.authHeader,
      authScheme: draft.authScheme,
      apiKeyStorageMode: draft.apiKeyStorageMode,
      requestTimeoutMs: draft.requestTimeoutMs,
      maxContextItemChars: draft.maxContextItemChars,
      maxTotalContextChars: draft.maxTotalContextChars,
      systemPrompt: draft.systemPrompt,
    },
  }
  // The API key is a secret and is intentionally never exported.
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'acopilot-settings.json'
  anchor.click()
  // Defer revocation so the browser has started the download before the blob
  // URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function triggerImport(): void {
  importError.value = ''
  importInput.value?.click()
}

async function importSettings(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return

  importError.value = ''
  try {
    const parsed = JSON.parse(await file.text()) as { profile?: Partial<AgentProfileDraft> }
    const source = parsed?.profile
    if (!source || typeof source !== 'object') throw new Error('Missing profile.')
    applyImported(source)
  } catch {
    importError.value = 'That file is not a valid Acopilot settings export.'
  }
}

function applyImported(source: Partial<AgentProfileDraft>): void {
  if (typeof source.name === 'string') draft.name = source.name
  if (typeof source.baseUrl === 'string') draft.baseUrl = source.baseUrl
  if (typeof source.chatPath === 'string') draft.chatPath = source.chatPath
  if (typeof source.authHeader === 'string') draft.authHeader = source.authHeader
  if (typeof source.authScheme === 'string') draft.authScheme = source.authScheme
  if (source.apiKeyStorageMode === 'local' || source.apiKeyStorageMode === 'session') {
    draft.apiKeyStorageMode = source.apiKeyStorageMode
  }
  if (typeof source.requestTimeoutMs === 'number') draft.requestTimeoutMs = source.requestTimeoutMs
  if (typeof source.maxContextItemChars === 'number') {
    draft.maxContextItemChars = source.maxContextItemChars
  }
  if (typeof source.maxTotalContextChars === 'number') {
    draft.maxTotalContextChars = source.maxTotalContextChars
  }
  if (typeof source.systemPrompt === 'string') draft.systemPrompt = source.systemPrompt

  const models = Array.isArray(source.models)
    ? source.models.filter((model): model is string => typeof model === 'string')
    : []
  const vision = new Set(
    Array.isArray(source.visionModels)
      ? source.visionModels.filter((model): model is string => typeof model === 'string')
      : [],
  )
  modelRows.value = models.length
    ? models.map((name) => ({ name, vision: vision.has(name) }))
    : [{ name: '', vision: false }]
  persistentStorageConfirmed.value = draft.apiKeyStorageMode === 'local'
}
</script>

<template>
  <section class="settings" aria-labelledby="settings-heading">
    <header>
      <div>
        <p class="eyebrow">OpenAI-compatible</p>
        <h2 id="settings-heading">Agent settings</h2>
      </div>
      <div class="header-actions">
        <button class="text-button" type="button" @click="triggerImport">Import</button>
        <button class="text-button" type="button" @click="exportSettings">Export</button>
        <button class="text-button" type="button" @click="$emit('close')">Close</button>
      </div>
      <input
        ref="importInput"
        hidden
        type="file"
        accept="application/json,.json"
        @change="importSettings"
      />
    </header>
    <p v-if="importError" class="import-error" role="alert">{{ importError }}</p>

    <form @submit.prevent="submit">
      <label>
        <span>Profile name</span>
        <input v-model.trim="draft.name" autocomplete="off" required />
      </label>

      <label>
        <span>Base URL</span>
        <input
          v-model.trim="draft.baseUrl"
          type="url"
          inputmode="url"
          placeholder="https://example.com/v1"
          autocomplete="url"
          required
        />
      </label>

      <label>
        <span>API key</span>
        <div class="secret-field">
          <input
            v-model="apiKey"
            :type="showApiKey ? 'text' : 'password'"
            autocomplete="off"
            :placeholder="
              profile ? 'Leave blank to keep the saved key' : 'Required by your endpoint'
            "
          />
          <button type="button" @click="showApiKey = !showApiKey">
            {{ showApiKey ? 'Hide' : 'Show' }}
          </button>
        </div>
      </label>

      <label class="checkbox-row">
        <input
          type="checkbox"
          :checked="draft.apiKeyStorageMode === 'local'"
          @change="setStorageMode(($event.target as HTMLInputElement).checked)"
        />
        <span>Remember API key across browser restarts</span>
      </label>
      <p v-if="draft.apiKeyStorageMode === 'local'" class="storage-warning">
        This stores the key in Chrome extension storage. It is not protected by the operating system
        keychain.
      </p>

      <div class="field">
        <div class="field-header">
          <span>Models <small>optional</small></span>
          <button
            type="button"
            class="icon-button"
            aria-label="Add model"
            title="Add model"
            @click="addModel"
          >
            +
          </button>
        </div>
        <div v-for="(row, index) in modelRows" :key="index" class="model-row">
          <input
            v-model.trim="row.name"
            autocomplete="off"
            placeholder="Model name (blank = endpoint default)"
          />
          <label class="vision-toggle" title="This model accepts image input (multimodal)">
            <input v-model="row.vision" type="checkbox" />
            <span>Vision</span>
          </label>
          <button
            type="button"
            class="icon-button"
            aria-label="Remove model"
            title="Remove model"
            @click="removeModel(index)"
          >
            −
          </button>
        </div>
      </div>

      <label class="checkbox-row">
        <input
          type="checkbox"
          :checked="syncEnabled"
          @change="$emit('toggleSync', ($event.target as HTMLInputElement).checked)"
        />
        <span>Sync settings across Chrome (via your Google account)</span>
      </label>
      <p v-if="syncEnabled" class="test-note">
        Base URL, models, and system instruction sync to your other Chrome devices signed in to the
        same Google account. Your API key never syncs — enter it once per device.
      </p>

      <details>
        <summary>Advanced settings</summary>
        <div class="advanced-grid">
          <label>
            <span>Request timeout (ms)</span>
            <input v-model.number="draft.requestTimeoutMs" type="number" min="1000" required />
          </label>
          <label>
            <span>Maximum characters per context item</span>
            <input v-model.number="draft.maxContextItemChars" type="number" min="1000" required />
          </label>
          <label>
            <span>Maximum total context characters</span>
            <input v-model.number="draft.maxTotalContextChars" type="number" min="1000" required />
          </label>
          <label>
            <span>System instruction <small>optional</small></span>
            <textarea v-model="draft.systemPrompt" rows="8" />
          </label>
        </div>
      </details>

      <p class="test-note">
        Connection tests send a minimal request and may use a small number of tokens.
      </p>
      <p
        v-if="connectionMessage"
        class="connection-status"
        :class="`connection-status--${connectionStatus}`"
        role="status"
      >
        {{ connectionMessage }}
      </p>

      <div class="form-actions">
        <button
          v-if="profile"
          class="danger-button"
          type="button"
          :disabled="busy"
          @click="$emit('delete')"
        >
          Delete profile
        </button>
        <div class="action-group">
          <button type="button" :disabled="busy" @click="$emit('test', submission())">
            {{ busy ? 'Working…' : 'Test connection' }}
          </button>
          <button class="primary-button" type="submit" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </form>
  </section>
</template>

<style scoped>
.settings {
  overflow-y: auto;
  height: 100%;
  padding: 1rem;
  box-sizing: border-box;
  background: var(--surface);
}

header,
.form-actions,
.secret-field,
.checkbox-row {
  display: flex;
  align-items: center;
}

header {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.import-error {
  margin: -0.5rem 0 0.5rem;
  color: var(--danger);
  font-size: 0.74rem;
}

.eyebrow,
h2,
.storage-warning,
.test-note,
.connection-status {
  margin: 0;
}

.eyebrow {
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin-top: 0.15rem;
  font-size: 1.15rem;
}

form,
.advanced-grid {
  display: grid;
  gap: 0.85rem;
}

label {
  display: grid;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 650;
}

small {
  font-weight: 450;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 650;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.model-row > input {
  flex: 1;
  min-width: 0;
}

.vision-toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.25rem;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.vision-toggle input {
  width: auto;
}

.icon-button {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  font-size: 1.15rem;
  line-height: 1;
}

input,
textarea,
button {
  font: inherit;
}

input,
textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-strong);
  border-radius: 0.55rem;
  outline: none;
  padding: 0.65rem;
  background: var(--surface-raised);
  color: var(--text);
}

input:focus,
textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.secret-field {
  gap: 0.4rem;
}

.secret-field button {
  flex: none;
}

.checkbox-row {
  display: flex;
  gap: 0.5rem;
  color: var(--text);
}

.checkbox-row input {
  width: auto;
}

.storage-warning {
  margin-top: -0.45rem;
  padding: 0.65rem;
  border-left: 3px solid var(--warning);
  background: var(--warning-soft);
  color: var(--text);
  font-size: 0.74rem;
  line-height: 1.45;
}

details {
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  padding: 0.7rem;
}

summary {
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
}

.advanced-grid {
  margin-top: 0.85rem;
}

.test-note {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.4;
}

.connection-status {
  padding: 0.6rem;
  border-radius: 0.5rem;
  font-size: 0.76rem;
}

.connection-status--success {
  background: var(--success-soft);
  color: var(--success);
}

.connection-status--error {
  background: var(--danger-soft);
  color: var(--danger);
}

.form-actions {
  flex-wrap: wrap;
  gap: 0.5rem;
}

.action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-left: auto;
}

button {
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.55rem;
  background: var(--surface-raised);
  color: var(--text);
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.text-button {
  border-color: transparent;
  background: transparent;
}

.primary-button {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.danger-button {
  border-color: var(--danger);
  color: var(--danger);
}

@media (min-width: 34rem) {
  .advanced-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .advanced-grid label:last-child {
    grid-column: 1 / -1;
  }
}
</style>
