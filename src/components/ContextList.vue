<script setup lang="ts">
import { computed } from 'vue'

import { applyTotalContextLimit } from '../context/truncate'
import type { ContextItem } from '../context/types'

import ContextCard from './ContextCard.vue'

const props = defineProps<{
  items: readonly ContextItem[]
  captureAction: 'selection' | 'page' | null
  maxTotalContextChars: number
}>()

defineEmits<{
  captureSelection: []
  capturePage: []
  clear: []
  remove: [id: string]
}>()

const requestProjection = computed(() => {
  const limitedItems = applyTotalContextLimit(props.items, props.maxTotalContextChars)
  const limitedById = new Map(limitedItems.map((item) => [item.id, item]))

  return props.items.map((item) => {
    const requestItem = limitedById.get(item.id)
    if (!requestItem) {
      return {
        item,
        nextRequestStatus: 'omitted' as const,
        nextRequestText: null,
      }
    }

    return {
      item,
      nextRequestStatus:
        requestItem.text === item.text ? ('included' as const) : ('truncated' as const),
      nextRequestText: requestItem.text,
    }
  })
})

const truncatedCount = computed(
  () => requestProjection.value.filter((entry) => entry.nextRequestStatus === 'truncated').length,
)
const omittedCount = computed(
  () => requestProjection.value.filter((entry) => entry.nextRequestStatus === 'omitted').length,
)
const totalLimitAffectsRequest = computed(() => truncatedCount.value > 0 || omittedCount.value > 0)

const totalLimitWarning = computed(() => {
  const effects: string[] = []
  if (truncatedCount.value > 0) {
    effects.push(
      `${truncatedCount.value} ${truncatedCount.value === 1 ? 'card is' : 'cards are'} truncated`,
    )
  }
  if (omittedCount.value > 0) {
    effects.push(
      `${omittedCount.value} ${omittedCount.value === 1 ? 'card is' : 'cards are'} omitted`,
    )
  }

  const limit = new Intl.NumberFormat().format(props.maxTotalContextChars)
  return `The ${limit}-character total limit affects the next request: ${effects.join(' and ')}.`
})
</script>

<template>
  <section class="context-section" aria-labelledby="context-heading">
    <div class="section-heading">
      <h2 id="context-heading">Page context</h2>
      <button v-if="items.length" class="text-button" type="button" @click="$emit('clear')">
        Clear all
      </button>
    </div>

    <div class="capture-actions" aria-label="Capture page context">
      <button type="button" :disabled="captureAction !== null" @click="$emit('captureSelection')">
        {{ captureAction === 'selection' ? 'Adding…' : 'Add selection' }}
      </button>
      <button type="button" :disabled="captureAction !== null" @click="$emit('capturePage')">
        {{ captureAction === 'page' ? 'Adding…' : 'Add current page' }}
      </button>
    </div>

    <p v-if="!items.length" class="empty-copy">
      Nothing is captured automatically. Add a selection or the current page when you want to use
      it.
    </p>
    <p v-if="items.length && totalLimitAffectsRequest" class="limit-warning" role="status">
      {{ totalLimitWarning }}
    </p>
    <div v-if="items.length" class="context-list">
      <ContextCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        @remove="$emit('remove', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.context-section {
  display: grid;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.section-heading,
.capture-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

h2,
.empty-copy,
.limit-warning {
  margin: 0;
}

h2 {
  font-size: 0.9rem;
}

button {
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.5rem;
  background: var(--surface-raised);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 650;
}

button:hover:not(:disabled),
button:focus-visible {
  border-color: var(--accent);
}

button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.text-button {
  padding: 0.35rem;
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}

.capture-actions {
  justify-content: flex-start;
}

.empty-copy {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.4;
}

.limit-warning {
  padding: 0.65rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
  border-radius: 0.55rem;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.75rem;
  line-height: 1.45;
}

.context-list {
  display: grid;
  grid-auto-columns: minmax(14rem, 85%);
  grid-auto-flow: column;
  gap: 0.65rem;
  overflow-x: auto;
  padding-bottom: 0.2rem;
}
</style>
