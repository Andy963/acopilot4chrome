<script setup lang="ts">
/* eslint-disable vue/no-v-html -- MarkdownIt disables raw HTML and validates links. */
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

import type { ChatMessage } from '../context/types'

const props = defineProps<{
  message: ChatMessage
}>()

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: false,
})

markdown.validateLink = (url) => /^(https?:|mailto:)/i.test(url)
markdown.renderer.rules.link_open = (tokens, index, options, _environment, renderer) => {
  const token = tokens[index]
  if (token) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }
  return renderer.renderToken(tokens, index, options)
}
const renderFence = markdown.renderer.rules.fence?.bind(markdown.renderer.rules)
markdown.renderer.rules.fence = (tokens, index, options, environment, renderer) => {
  const code = renderFence
    ? renderFence(tokens, index, options, environment, renderer)
    : renderer.renderToken(tokens, index, options)
  return `<div class="code-block"><button class="copy-code" type="button">Copy code</button>${code}</div>`
}

const renderedContent = computed(() => markdown.render(props.message.content))

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
      <p
        v-if="message.status === 'error' || message.status === 'cancelled'"
        class="status"
        :class="`status--${message.status}`"
      >
        {{ message.status === 'error' ? 'Response failed' : 'Cancelled' }}
      </p>
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
</style>
