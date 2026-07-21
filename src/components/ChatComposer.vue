<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  active: boolean
  disabled: boolean
  multimodal: boolean
}>()

const emit = defineEmits<{
  send: [question: string, images: string[]]
  cancel: []
}>()

interface Attachment {
  id: string
  url: string
  name: string
  bytes: number
}

const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_BYTES = 6 * 1024 * 1024

const question = ref('')
const attachments = ref<Attachment[]>([])
const attachError = ref('')
const input = ref<HTMLTextAreaElement>()
const fileInput = ref<HTMLInputElement>()
let attachmentSeq = 0

function send(): void {
  const value = question.value.trim()
  if (!value || props.active || props.disabled) return

  emit('send', value, props.multimodal ? attachments.value.map((attachment) => attachment.url) : [])
  question.value = ''
  attachments.value = []
  attachError.value = ''
  void nextTick(() => input.value?.focus())
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  send()
}

function handlePaste(event: ClipboardEvent): void {
  if (!props.multimodal || props.disabled) return
  const files = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  if (files.length === 0) return

  event.preventDefault()
  void addFiles(files)
}

function pickFiles(): void {
  fileInput.value?.click()
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  if (target.files) void addFiles(Array.from(target.files))
  target.value = ''
}

async function addFiles(files: readonly File[]): Promise<void> {
  attachError.value = ''
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    if (attachments.value.length >= MAX_IMAGES) {
      attachError.value = `You can attach up to ${MAX_IMAGES} images.`
      break
    }
    if (file.size > MAX_IMAGE_BYTES) {
      attachError.value = `Each image must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB or smaller.`
      continue
    }
    if (totalBytes() + file.size > MAX_TOTAL_BYTES) {
      attachError.value = `Attached images must total ${Math.floor(MAX_TOTAL_BYTES / (1024 * 1024))} MB or less.`
      break
    }
    try {
      const url = await readFileAsDataUrl(file)
      // Re-check caps after the async read so concurrent adds can't overshoot.
      const withinCaps =
        attachments.value.length < MAX_IMAGES && totalBytes() + file.size <= MAX_TOTAL_BYTES
      if (url && withinCaps) {
        attachments.value.push({
          id: `attachment-${++attachmentSeq}`,
          url,
          name: file.name,
          bytes: file.size,
        })
      }
    } catch {
      attachError.value = 'One image could not be read.'
    }
  }
}

function totalBytes(): number {
  return attachments.value.reduce((sum, attachment) => sum + attachment.bytes, 0)
}

function removeAttachment(id: string): void {
  attachments.value = attachments.value.filter((attachment) => attachment.id !== id)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'))
    reader.readAsDataURL(file)
  })
}

// Drop attachments if the active model stops being vision-capable.
watch(
  () => props.multimodal,
  (enabled) => {
    if (!enabled) {
      attachments.value = []
      attachError.value = ''
    }
  },
)
</script>

<template>
  <form class="composer" @submit.prevent="send">
    <label for="question" class="sr-only">Ask about the captured context</label>
    <div class="composer-box" :class="{ 'composer-box--disabled': disabled }">
      <ul v-if="attachments.length" class="attachments" aria-label="Attached images">
        <li v-for="attachment in attachments" :key="attachment.id" class="thumb">
          <img :src="attachment.url" :alt="attachment.name" />
          <button
            type="button"
            class="thumb-remove"
            :aria-label="`Remove ${attachment.name}`"
            @click="removeAttachment(attachment.id)"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </li>
      </ul>

      <textarea
        id="question"
        ref="input"
        v-model="question"
        rows="3"
        placeholder="Ask a question…"
        :disabled="disabled"
        @keydown="handleKeydown"
        @paste="handlePaste"
      />

      <div class="toolbar">
        <div class="toolbar-left">
          <button
            v-if="multimodal"
            type="button"
            class="attach"
            :disabled="disabled"
            aria-label="Attach image"
            title="Attach image"
            @click="pickFiles"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <span class="hint">Enter to send · Shift+Enter for a new line</span>
        </div>

        <button
          v-if="active"
          class="send send--cancel"
          type="button"
          aria-label="Cancel"
          @click="$emit('cancel')"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
          </svg>
        </button>
        <button
          v-else
          class="send"
          type="submit"
          :disabled="disabled || !question.trim()"
          aria-label="Send"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>

    <p v-if="attachError" class="attach-error" role="alert">{{ attachError }}</p>

    <input
      ref="fileInput"
      class="sr-only"
      type="file"
      accept="image/*"
      multiple
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChange"
    />
  </form>
</template>

<style scoped>
.composer {
  padding: 0.6rem 0.85rem 0.8rem;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
}

.sr-only {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.composer-box {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.75rem;
  padding: 0.5rem;
  background: var(--surface-raised);
}

.composer-box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.composer-box--disabled {
  opacity: 0.7;
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0.15rem 0.15rem 0;
  list-style: none;
}

.thumb {
  position: relative;
  width: 3.5rem;
  height: 3.5rem;
}

.thumb img {
  width: 100%;
  height: 100%;
  border: 1px solid var(--border);
  border-radius: 0.55rem;
  object-fit: cover;
}

.thumb-remove {
  position: absolute;
  top: -0.35rem;
  right: -0.35rem;
  display: grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  padding: 0;
  background: var(--surface-raised);
  color: var(--text);
  cursor: pointer;
}

textarea {
  display: block;
  width: 100%;
  min-height: 3.25rem;
  max-height: 11rem;
  box-sizing: border-box;
  resize: vertical;
  border: none;
  outline: none;
  padding: 0.15rem 0.25rem;
  background: transparent;
  color: var(--text);
  font: inherit;
  line-height: 1.45;
}

textarea::placeholder {
  color: var(--muted);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.hint {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.66rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}

.attach:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.send {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-contrast);
  cursor: pointer;
}

.send:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.send--cancel {
  background: var(--danger);
}

.attach-error {
  margin: 0.4rem 0 0;
  color: var(--danger);
  font-size: 0.72rem;
}
</style>
