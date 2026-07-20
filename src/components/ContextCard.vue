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
      <span class="kind">{{ item.kind === 'page' ? 'Page' : 'Selection' }}</span>
      <button
        class="icon-button"
        type="button"
        :aria-label="`Remove ${item.title || 'context'}`"
        @click="$emit('remove', item.id)"
      >
        ×
      </button>
    </header>

    <h3 :title="item.title">{{ item.title || 'Untitled page' }}</h3>
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
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface-raised);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.kind {
  color: var(--accent);
  font-size: 0.7rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.icon-button {
  width: 1.6rem;
  height: 1.6rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 1.2rem;
}

.icon-button:hover,
.icon-button:focus-visible {
  background: var(--surface-hover);
  color: var(--text);
}

h3 {
  overflow: hidden;
  margin: 0.35rem 0 0.15rem;
  font-size: 0.88rem;
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
