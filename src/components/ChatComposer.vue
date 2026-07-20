<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = defineProps<{
  active: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  send: [question: string]
  cancel: []
}>()

const question = ref('')
const input = ref<HTMLTextAreaElement>()

function send(): void {
  const value = question.value.trim()
  if (!value || props.active || props.disabled) return

  emit('send', value)
  question.value = ''
  void nextTick(() => input.value?.focus())
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  send()
}
</script>

<template>
  <form class="composer" @submit.prevent="send">
    <label for="question" class="sr-only">Ask about the captured context</label>
    <div class="composer-box">
      <textarea
        id="question"
        ref="input"
        v-model="question"
        rows="3"
        :disabled="disabled"
        @keydown="handleKeydown"
      />
      <div v-if="!question" class="placeholder" aria-hidden="true">
        <span class="placeholder__title">Ask a question…</span>
        <span class="placeholder__hint">Enter to send · Shift+Enter for a new line</span>
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
  position: relative;
}

textarea {
  display: block;
  width: 100%;
  min-height: 4.25rem;
  max-height: 11rem;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--border-strong);
  border-radius: 0.75rem;
  outline: none;
  padding: 0.65rem 3rem 0.65rem 0.75rem;
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  line-height: 1.45;
}

textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.placeholder {
  position: absolute;
  top: 0.65rem;
  right: 3rem;
  left: 0.78rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  pointer-events: none;
}

.placeholder__title {
  color: var(--muted);
}

.placeholder__hint {
  color: var(--muted);
  font-size: 0.66rem;
  opacity: 0.8;
}

.send {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: grid;
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
</style>
