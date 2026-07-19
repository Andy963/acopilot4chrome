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
    <label for="question">Ask about the captured context</label>
    <textarea
      id="question"
      ref="input"
      v-model="question"
      rows="3"
      placeholder="Ask a question…"
      :disabled="disabled"
      @keydown="handleKeydown"
    />
    <div class="composer-footer">
      <span>Enter to send · Shift+Enter for a new line</span>
      <button v-if="active" class="cancel" type="button" @click="$emit('cancel')">Cancel</button>
      <button v-else type="submit" :disabled="disabled || !question.trim()">Send</button>
    </div>
  </form>
</template>

<style scoped>
.composer {
  display: grid;
  gap: 0.45rem;
  padding: 0.85rem 1rem 1rem;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
}

label {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

textarea {
  width: 100%;
  min-height: 4.5rem;
  max-height: 11rem;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--border-strong);
  border-radius: 0.75rem;
  outline: none;
  padding: 0.75rem;
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  line-height: 1.45;
}

textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

span {
  color: var(--muted);
  font-size: 0.68rem;
}

button {
  min-width: 4.5rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--accent);
  border-radius: 0.55rem;
  background: var(--accent);
  color: var(--accent-contrast);
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.cancel {
  border-color: var(--danger);
  background: transparent;
  color: var(--danger);
}
</style>
