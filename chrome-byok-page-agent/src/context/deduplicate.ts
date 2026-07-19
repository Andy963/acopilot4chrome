import { normalizeContextUrl } from './normalize'
import type { ContextItem } from './types'

export function hashContextText(text: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createContextDeduplicationKey(item: ContextItem): string {
  return [item.kind, normalizeContextUrl(item.url), hashContextText(item.text)].join('\u0000')
}

export function deduplicateContextItems(items: readonly ContextItem[]): ContextItem[] {
  const buckets = new Map<string, ContextItem[]>()
  const result: ContextItem[] = []

  for (const item of items) {
    const key = createContextDeduplicationKey(item)
    const bucket = buckets.get(key)
    const duplicate = bucket?.some(
      (candidate) =>
        candidate.kind === item.kind &&
        normalizeContextUrl(candidate.url) === normalizeContextUrl(item.url) &&
        candidate.text === item.text,
    )

    if (duplicate) {
      continue
    }

    if (bucket) {
      bucket.push(item)
    } else {
      buckets.set(key, [item])
    }
    result.push(item)
  }

  return result
}

export function isDuplicateContextItem(
  candidate: ContextItem,
  existingItems: readonly ContextItem[],
): boolean {
  const candidateKey = createContextDeduplicationKey(candidate)
  return existingItems.some(
    (item) =>
      createContextDeduplicationKey(item) === candidateKey &&
      item.kind === candidate.kind &&
      normalizeContextUrl(item.url) === normalizeContextUrl(candidate.url) &&
      item.text === candidate.text,
  )
}
