<script setup lang="ts">
import { computed } from 'vue'

import type { ContextItem } from '../context/types'

const props = defineProps<{
  item: ContextItem
  nextRequestStatus: 'included' | 'truncated' | 'omitted'
  nextRequestText: string | null
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

const characterLabel = computed(() => new Intl.NumberFormat().format(props.item.originalCharCount))

const nextRequestCharacterLabel = computed(() =>
  props.nextRequestText === null
    ? null
    : new Intl.NumberFormat().format(props.nextRequestText.length),
)

const nextRequestStatusLabels = {
  included: 'Included in next request',
  truncated: 'Truncated by total limit',
  omitted: 'Omitted by total limit',
} as const

const nextRequestStatusLabel = computed(() => nextRequestStatusLabels[props.nextRequestStatus])
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

    <div class="metadata">
      <span>{{ characterLabel }} original characters</span>
      <span v-if="item.truncated" class="warning">Saved text truncated</span>
    </div>

    <div class="request-metadata">
      <span
        class="request-status"
        :class="`request-status--${nextRequestStatus}`"
        :aria-label="`Next request status: ${nextRequestStatusLabel}`"
      >
        {{ nextRequestStatusLabel }}
      </span>
      <span v-if="nextRequestCharacterLabel !== null" class="request-character-count">
        {{ nextRequestCharacterLabel }} characters
      </span>
    </div>

    <details>
      <summary>Preview saved text</summary>
      <pre>{{ item.text }}</pre>
    </details>

    <details class="request-preview" :open="nextRequestStatus !== 'included'">
      <summary>Preview next request text</summary>
      <pre v-if="nextRequestText !== null">{{ nextRequestText }}</pre>
      <p v-else class="no-request-text">
        No text from this card will be included in the next request.
      </p>
    </details>
  </article>
</template>

<style scoped>
.context-card {
  min-width: 14rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface-raised);
}

header,
.metadata,
.request-metadata {
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
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 1.25rem;
}

.icon-button:hover,
.icon-button:focus-visible {
  background: var(--surface-hover);
  color: var(--text);
}

h3 {
  overflow: hidden;
  margin: 0.45rem 0 0.2rem;
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source {
  display: block;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

a.source:hover {
  color: var(--accent);
}

.metadata {
  margin-top: 0.65rem;
  color: var(--muted);
  font-size: 0.72rem;
}

.warning {
  color: var(--warning);
  font-weight: 700;
}

.request-metadata {
  align-items: flex-start;
  margin-top: 0.55rem;
}

.request-status {
  font-size: 0.72rem;
  font-weight: 700;
}

.request-status--included {
  color: var(--success);
}

.request-status--truncated,
.request-status--omitted {
  color: var(--warning);
}

.request-character-count {
  color: var(--muted);
  font-size: 0.72rem;
  white-space: nowrap;
}

details {
  margin-top: 0.65rem;
  border-top: 1px solid var(--border);
  padding-top: 0.55rem;
}

summary {
  color: var(--muted);
  cursor: pointer;
  font-size: 0.75rem;
}

pre {
  overflow: auto;
  max-height: 12rem;
  margin: 0.65rem 0 0;
  padding: 0.65rem;
  border-radius: 0.5rem;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.no-request-text {
  margin: 0.65rem 0 0;
  color: var(--warning);
  font-size: 0.75rem;
  line-height: 1.45;
}
</style>
