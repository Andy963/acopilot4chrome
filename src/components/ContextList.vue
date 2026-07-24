<script setup lang="ts">
import { computed } from 'vue'

import { applyTotalContextLimit } from '../context/truncate'
import type { ContextItem } from '../context/types'

import ContextCard from './ContextCard.vue'

const props = defineProps<{
  items: readonly ContextItem[]
  captureAction: 'selection' | 'page' | null
  maxTotalContextChars: number
  historyWindow: number
}>()

defineEmits<{
  captureSelection: []
  capturePage: []
  clear: []
  remove: [id: string]
  historyWindowChange: [value: number]
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
      <div class="heading-actions">
        <label class="window-control" title="How many recent message turns are resent as history">
          <span>Window</span>
          <input
            type="number"
            min="1"
            max="50"
            :value="historyWindow"
            aria-label="Context window: recent message turns kept as history"
            @change="
              $emit('historyWindowChange', Number(($event.target as HTMLInputElement).value))
            "
          />
        </label>
        <button v-if="items.length" class="text-button" type="button" @click="$emit('clear')">
          Clear all
        </button>
      </div>
    </div>

    <div class="capture-actions" aria-label="Capture page context">
      <button
        type="button"
        class="capture-button capture-button--selection"
        data-tooltip="Capture the text currently selected on the active page."
        title="Capture selected text"
        :disabled="captureAction !== null"
        @click="$emit('captureSelection')"
      >
        {{ captureAction === 'selection' ? 'Adding…' : 'Add selection' }}
      </button>
      <button
        type="button"
        class="capture-button capture-button--page"
        data-tooltip="Extract the readable text from the active page."
        title="Capture current page"
        :disabled="captureAction !== null"
        @click="$emit('capturePage')"
      >
        {{ captureAction === 'page' ? 'Adding…' : 'Add current page' }}
      </button>
    </div>

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
.limit-warning {
  margin: 0;
}

h2 {
  font-size: 0.9rem;
}

.heading-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.window-control {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 650;
}

.window-control input {
  width: 3rem;
  padding: 0.2rem 0.3rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.4rem;
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
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

.capture-button {
  position: relative;
  border-color: color-mix(in srgb, var(--capture-color) 48%, var(--border-strong));
  background: color-mix(in srgb, var(--capture-color) 12%, var(--surface-raised));
  color: color-mix(in srgb, var(--capture-color) 78%, var(--text));
  transition:
    background 120ms ease,
    border-color 120ms ease,
    transform 120ms ease;
}

.capture-button--selection {
  --capture-color: var(--context-selection);
}

.capture-button--page {
  --capture-color: var(--context-page);
}

.capture-button:hover:not(:disabled),
.capture-button:focus-visible {
  border-color: var(--capture-color);
  background: color-mix(in srgb, var(--capture-color) 20%, var(--surface-raised));
}

.capture-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.capture-button::after {
  position: absolute;
  z-index: 5;
  top: calc(100% + 0.45rem);
  left: 50%;
  width: max-content;
  max-width: min(18rem, calc(100vw - 2rem));
  padding: 0.42rem 0.55rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.45rem;
  background: var(--text);
  color: var(--surface-raised);
  content: attr(data-tooltip);
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1.35;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -0.2rem);
  transition:
    opacity 120ms ease,
    transform 120ms ease,
    visibility 120ms ease;
  visibility: hidden;
  white-space: normal;
}

.capture-button:hover::after,
.capture-button:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
  visibility: visible;
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
