<script setup lang="ts">
/* eslint-disable vue/no-v-html -- renderMarkdown disables raw HTML and validates links. */
import { computed, ref } from 'vue'
import 'katex/dist/katex.min.css'

import { renderMarkdown } from '../context/markdown'
import type { ChatMessage } from '../context/types'

const props = defineProps<{
  message: ChatMessage
  canRetry?: boolean
  busy?: boolean
}>()

defineEmits<{
  retry: []
  regenerate: []
}>()

const renderedContent = computed(() => renderMarkdown(props.message.content))

type MessageCopyState = 'idle' | 'copied' | 'failed'
const messageCopyState = ref<MessageCopyState>('idle')
let messageCopyTimer: number | undefined

const copyLabel = computed(() => {
  if (messageCopyState.value === 'copied') return 'Copied'
  if (messageCopyState.value === 'failed') return 'Copy failed'
  return 'Copy'
})

async function copyMessage(): Promise<void> {
  try {
    // Assistant replies copy their raw Markdown source, not the rendered HTML.
    await navigator.clipboard.writeText(props.message.content)
    messageCopyState.value = 'copied'
  } catch {
    messageCopyState.value = 'failed'
  }
  if (messageCopyTimer) window.clearTimeout(messageCopyTimer)
  messageCopyTimer = window.setTimeout(() => {
    messageCopyState.value = 'idle'
  }, 1200)
}

const COPY_BUTTON_ICONS = {
  copy: '<rect x="9" y="9" width="10" height="10" rx="1.5"/><path d="M15 9V6.5A1.5 1.5 0 0 0 13.5 5h-7A1.5 1.5 0 0 0 5 6.5v7A1.5 1.5 0 0 0 6.5 15H9"/>',
  copied: '<path d="m5 12 4 4L19 6"/>',
  failed: '<path d="m7 7 10 10M17 7 7 17"/>',
} as const

const COPY_BUTTON_LABELS = {
  copy: 'Copy code',
  copied: 'Copied',
  failed: 'Copy failed',
} as const

type CopyButtonState = keyof typeof COPY_BUTTON_ICONS

function setCopyButtonState(button: HTMLButtonElement, state: CopyButtonState): void {
  const icon = button.querySelector('svg')
  if (icon) icon.innerHTML = COPY_BUTTON_ICONS[state]
  button.dataset.copyState = state
  button.setAttribute('aria-label', COPY_BUTTON_LABELS[state])
  button.title = COPY_BUTTON_LABELS[state]
}

async function copyCode(event: MouseEvent): Promise<void> {
  const target = event.target
  if (!(target instanceof Element)) return

  const button = target.closest<HTMLButtonElement>('.copy-code')
  const container = event.currentTarget
  if (!(container instanceof Element) || !button || !container.contains(button)) return

  const code = button.closest('.code-block')?.querySelector('pre code')
  if (!code) return

  try {
    await navigator.clipboard.writeText(code.textContent ?? '')
    setCopyButtonState(button, 'copied')
    window.setTimeout(() => {
      if (button.isConnected) setCopyButtonState(button, 'copy')
    }, 1200)
  } catch {
    setCopyButtonState(button, 'failed')
  }
}
</script>

<template>
  <article
    class="message"
    :class="`message--${message.role}`"
    :data-message-role="message.role"
    :data-message-status="message.status"
  >
    <ul
      v-if="message.contextItems?.length"
      class="message-context"
      aria-label="Context sent with this message"
    >
      <li v-for="item in message.contextItems" :key="item.id">
        <details class="context-quote" :class="`context-quote--${item.kind}`">
          <summary>
            <span
              class="context-kind"
              :class="`context-kind--${item.kind}`"
              :title="item.kind === 'page' ? 'Page context' : 'Selection context'"
            >
              <svg
                v-if="item.kind === 'page'"
                class="kind-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                role="img"
                aria-label="Page"
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M16 13H8M16 17H8M10 9H8" />
              </svg>
              <svg
                v-else
                class="kind-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                role="img"
                aria-label="Selection"
              >
                <rect x="3" y="4.5" width="18" height="15" rx="2" stroke-dasharray="3 2.4" />
                <path d="M7 10h10M7 14h6" />
              </svg>
            </span>
            <span class="context-title">{{ item.title || item.url || 'Context' }}</span>
            <span v-if="item.truncated" class="context-truncated">truncated</span>
          </summary>
          <pre>{{ item.text }}</pre>
        </details>
      </li>
    </ul>
    <ul v-if="message.images?.length" class="message-images" aria-label="Attached images">
      <li v-for="(image, index) in message.images" :key="index">
        <img :src="image" alt="Attached image" loading="lazy" />
      </li>
    </ul>
    <p v-if="message.role === 'user'" class="plain-content">{{ message.content }}</p>
    <template v-else>
      <p
        v-if="message.status === 'streaming' && message.content"
        class="plain-content streaming-content"
        aria-live="polite"
      >
        {{ message.content }}
      </p>
      <div
        v-else-if="message.content"
        class="markdown-content"
        @click="copyCode"
        v-html="renderedContent"
      />
      <div
        v-else-if="message.status === 'streaming'"
        class="typing"
        role="status"
        aria-label="Assistant is responding"
      >
        <span class="typing-dot" />
        <span class="typing-dot" />
        <span class="typing-dot" />
      </div>
      <div v-if="message.status === 'error' || message.status === 'cancelled'" class="status-row">
        <p class="status" :class="`status--${message.status}`">
          {{ message.status === 'error' ? 'Response failed' : 'Cancelled' }}
        </p>
        <button v-if="canRetry" type="button" class="retry-button" @click="$emit('retry')">
          Retry
        </button>
      </div>
    </template>

    <footer
      v-if="message.role === 'user' || (message.status === 'complete' && !!message.content)"
      class="message-actions"
    >
      <button
        type="button"
        class="msg-action"
        :class="{
          'is-done': messageCopyState === 'copied',
          'is-failed': messageCopyState === 'failed',
        }"
        :aria-label="copyLabel"
        :title="copyLabel"
        @click="copyMessage"
      >
        <svg
          class="action-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.9"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path v-if="messageCopyState === 'copied'" d="m5 12 4 4L19 6" />
          <path v-else-if="messageCopyState === 'failed'" d="m7 7 10 10M17 7 7 17" />
          <template v-else>
            <rect x="9" y="9" width="10" height="10" rx="1.5" />
            <path
              d="M15 9V6.5A1.5 1.5 0 0 0 13.5 5h-7A1.5 1.5 0 0 0 5 6.5v7A1.5 1.5 0 0 0 6.5 15H9"
            />
          </template>
        </svg>
      </button>
      <button
        v-if="message.role === 'user'"
        type="button"
        class="msg-action msg-action--regen"
        :disabled="busy"
        aria-label="Regenerate response"
        title="Regenerate response"
        @click="$emit('regenerate')"
      >
        <svg
          class="action-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.9"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
      </button>
    </footer>
  </article>
</template>

<style scoped>
.message {
  max-width: 92%;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 0.85rem;
  background: var(--surface-raised);
}

/* When a message shows the copy/regenerate footer, tuck it closer to the
   bottom edge so the actions sit at the bottom-left of the bubble. */
.message:has(.message-actions) {
  padding-bottom: 0.4rem;
}

.message--user {
  align-self: end;
  border-bottom-right-radius: 0.25rem;
  background: var(--accent-soft);
}

.message--assistant {
  align-self: start;
  border-bottom-left-radius: 0.25rem;
}

.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.5rem;
  padding: 0;
  list-style: none;
}

.message-context {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin: 0 0 0.5rem;
  padding: 0;
  list-style: none;
}

.message-context details {
  border: none;
  border-left: 3px solid var(--border-strong);
  border-radius: 0;
  background: transparent;
}

.message-context .context-quote--page {
  border-left-color: var(--context-page);
}

.message-context .context-quote--selection {
  border-left-color: var(--context-selection);
}

.message-context summary {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
}

.context-kind {
  display: inline-flex;
  flex: none;
  align-items: center;
}

.context-kind--page {
  color: var(--context-page);
}

.context-kind--selection {
  color: var(--context-selection);
}

.kind-icon {
  width: 0.85rem;
  height: 0.85rem;
}

.context-title {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-truncated {
  flex: none;
  margin-left: auto;
  color: var(--warning);
  font-size: 0.62rem;
  text-transform: uppercase;
}

.message-context pre {
  overflow: auto;
  max-height: 10rem;
  margin: 0;
  padding: 0.15rem 0.5rem 0.35rem;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.message-images img {
  display: block;
  max-width: 8rem;
  max-height: 8rem;
  border: 1px solid var(--border);
  border-radius: 0.55rem;
  object-fit: cover;
}

.typing {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0;
}

.typing-dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--muted);
  animation: typing-bounce 1.2s ease-in-out infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typing-bounce {
  0%,
  70%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  35% {
    opacity: 1;
    transform: translateY(-0.2rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .typing-dot {
    animation: none;
    opacity: 0.6;
  }
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.status {
  margin: 0.4rem 0 0;
  font-size: 0.7rem;
  font-weight: 600;
}

.status--error {
  color: var(--danger);
}

.status--cancelled {
  color: var(--muted);
}

.retry-button {
  margin-top: 0.4rem;
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.4rem;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
}

.retry-button:hover,
.retry-button:focus-visible {
  border-color: var(--accent);
}

.message-actions {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.2rem;
}

.msg-action {
  display: grid;
  place-items: center;
  width: 1.65rem;
  height: 1.65rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  transition:
    color 120ms ease,
    border-color 120ms ease,
    background 120ms ease;
}

.msg-action:hover:not(:disabled),
.msg-action:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-strong));
  background: var(--accent-soft);
}

.msg-action:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.msg-action.is-done {
  color: var(--success);
}

.msg-action.is-failed {
  color: var(--danger);
}

.action-icon {
  display: block;
  width: 0.95rem;
  height: 0.95rem;
}

.plain-content {
  margin: 0;
  line-height: 1.55;
  white-space: pre-wrap;
}

.streaming-content {
  overflow-wrap: anywhere;
}

.markdown-content {
  overflow-wrap: anywhere;
  line-height: 1.55;
}

.markdown-content :deep(> :first-child) {
  margin-top: 0;
}

.markdown-content :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(pre) {
  overflow: auto;
  padding: 0.75rem;
  border-radius: 0.55rem;
  background: var(--code-bg);
  color: var(--code-text);
}

/* The .code-block wrapper carries the block's vertical rhythm so the edge
   margin reset above (which now targets the wrapper) keeps working; the inner
   <pre>'s UA margin is neutralized to avoid collapsing through the wrapper. */
.markdown-content :deep(.code-block pre) {
  margin: 0;
}

.markdown-content :deep(pre code) {
  font-family: var(--font-mono);
  font-size: 0.76rem;
}

.markdown-content :deep(.code-block) {
  position: relative;
  margin: 0.75rem 0;
}

.markdown-content :deep(.copy-code) {
  display: grid;
  place-items: center;
  position: absolute;
  z-index: 1;
  top: 0.35rem;
  right: 0.4rem;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  padding: 0.2rem;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 0;
  opacity: 0;
  transition:
    opacity 120ms ease,
    color 120ms ease;
}

.markdown-content :deep(.code-block:hover .copy-code),
.markdown-content :deep(.code-block:focus-within .copy-code),
.markdown-content :deep(.copy-code:focus-visible) {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .markdown-content :deep(.copy-code) {
    transition: none;
  }
}

.markdown-content :deep(.copy-code:hover),
.markdown-content :deep(.copy-code:focus-visible) {
  color: var(--accent);
}

.markdown-content :deep(.copy-code[data-copy-state='copied']) {
  color: var(--success);
}

.markdown-content :deep(.copy-code[data-copy-state='failed']) {
  color: var(--danger);
}

.markdown-content :deep(.copy-code svg) {
  display: block;
  width: 1rem;
  height: 1rem;
}

.markdown-content :deep(a) {
  color: var(--accent);
}

.markdown-content :deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
  margin: 0.5rem 0;
  padding: 0.15rem 0;
}
</style>
