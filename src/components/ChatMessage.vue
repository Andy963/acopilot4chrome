<script setup lang="ts">
/* eslint-disable vue/no-v-html -- renderMarkdown disables raw HTML and validates links. */
import { computed } from 'vue'
import 'katex/dist/katex.min.css'

import { renderMarkdown } from '../context/markdown'
import type { ChatMessage } from '../context/types'

const props = defineProps<{
  message: ChatMessage
  canRetry?: boolean
}>()

defineEmits<{
  retry: []
}>()

const renderedContent = computed(() => renderMarkdown(props.message.content))

async function copyCode(event: MouseEvent): Promise<void> {
  const target = event.target
  if (!(target instanceof HTMLButtonElement) || !target.matches('.copy-code')) return

  const code = target.parentElement?.querySelector('pre code')
  if (!code) return

  try {
    await navigator.clipboard.writeText(code.textContent ?? '')
    target.textContent = 'Copied'
    window.setTimeout(() => {
      target.textContent = 'Copy code'
    }, 1200)
  } catch {
    target.textContent = 'Copy failed'
  }
}
</script>

<template>
  <article class="message" :class="`message--${message.role}`">
    <ul
      v-if="message.contextItems?.length"
      class="message-context"
      aria-label="Context sent with this message"
    >
      <li v-for="item in message.contextItems" :key="item.id">
        <details>
          <summary>
            <span class="context-kind">{{ item.kind === 'page' ? 'Page' : 'Selection' }}</span>
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
      <div
        v-if="message.content"
        class="markdown-content"
        :aria-busy="message.status === 'streaming'"
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
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
}

.message-context summary {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
}

.context-kind {
  flex: none;
  color: var(--accent);
  font-size: 0.62rem;
  font-weight: 750;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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
  padding: 0.5rem;
  border-top: 1px solid var(--border);
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

.plain-content {
  margin: 0;
  line-height: 1.55;
  white-space: pre-wrap;
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

.markdown-content :deep(pre code) {
  font-family: var(--font-mono);
  font-size: 0.76rem;
}

.markdown-content :deep(.code-block) {
  position: relative;
}

.markdown-content :deep(.copy-code) {
  position: absolute;
  z-index: 1;
  top: 0.35rem;
  right: 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.35rem;
  padding: 0.25rem 0.4rem;
  background: var(--surface-raised);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.65rem;
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
