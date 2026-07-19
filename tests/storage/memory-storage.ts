import type { StorageArea } from '../../src/storage/storage-area'

export class MemoryStorage implements StorageArea {
  readonly values: Record<string, unknown> = {}
  readonly writes: Array<Record<string, unknown>> = []

  async get(
    keys?: string | string[] | Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    if (keys === undefined || keys === null) {
      return { ...this.values }
    }

    const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)
    return Object.fromEntries(names.map((key) => [key, this.values[key]]))
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items)
    this.writes.push(items)
  }

  async remove(keys: string | string[]): Promise<void> {
    for (const key of typeof keys === 'string' ? [keys] : keys) {
      delete this.values[key]
    }
  }
}
