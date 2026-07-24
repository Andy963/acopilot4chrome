<script setup lang="ts">
import { computed } from 'vue'

import type { ContextItem } from '../context/types'

const props = defineProps<{
  item: ContextItem
}>()

defineEmits<{
  remove: [id: string]
}>()

const sourceUrl = computed(() => {
  try {
    const url = new URL(props.item.url)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
})
</script>

<template>
  <article class="context-card" :data-context-id="item.id">
    <header>
      <span
        class="kind"
        :class="`kind--${item.kind}`"
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
      <h3 :title="item.title">{{ item.title || 'Untitled page' }}</h3>
      <button
        class="icon-button"
        type="button"
        :aria-label="`Remove ${item.title || 'context'}`"
        @click="$emit('remove', item.id)"
      >
        ×
      </button>
    </header>

    <a
      v-if="sourceUrl"
      class="source"
      :href="sourceUrl"
      target="_blank"
      rel="noopener noreferrer"
      :title="item.url"
    >
      {{ item.url }}
    </a>
    <span v-else class="source" :title="item.url">{{ item.url }}</span>

    <details class="context-preview">
      <summary>Preview selected context</summary>
      <pre>{{ item.text }}</pre>
    </details>
  </article>
</template>

<style scoped>
.context-card {
  min-width: 14rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface-raised);
}

header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.kind {
  display: inline-flex;
  flex: none;
  align-items: center;
}

.kind--page {
  color: var(--context-page);
}

.kind--selection {
  color: var(--context-selection);
}

.kind-icon {
  width: 0.95rem;
  height: 0.95rem;
}

.icon-button {
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 1.15rem;
}

.icon-button:hover,
.icon-button:focus-visible {
  background: var(--surface-hover);
  color: var(--text);
}

h3 {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  margin: 0;
  font-size: 0.85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source {
  display: block;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

a.source:hover {
  color: var(--accent);
}

.context-preview {
  margin-top: 0.5rem;
  border-top: 1px solid var(--border);
  padding-top: 0.45rem;
}

summary {
  color: var(--muted);
  cursor: pointer;
  font-size: 0.74rem;
}

pre {
  overflow: auto;
  max-height: 12rem;
  margin: 0.55rem 0 0;
  padding: 0.6rem;
  border-radius: 0.5rem;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
