<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <section class="empty-state" role="status">
    <div class="empty-state__mark" aria-hidden="true">A</div>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
  </section>
</template>

<style scoped>
.empty-state {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 2.5rem 1rem;
  color: var(--muted);
  text-align: center;
}

.empty-state__mark {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  border: 1px solid var(--border-strong);
  border-radius: 0.8rem;
  color: var(--accent);
  font-weight: 750;
}

h2,
p {
  margin: 0;
}

h2 {
  color: var(--text);
  font-size: 1rem;
}

p {
  max-width: 28rem;
  font-size: 0.875rem;
  line-height: 1.55;
}
</style>
