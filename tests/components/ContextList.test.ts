import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const contextListSource = readFileSync(
  resolve(__dirname, '../../src/components/ContextList.vue'),
  'utf8',
)

const contextCardSource = readFileSync(
  resolve(__dirname, '../../src/components/ContextCard.vue'),
  'utf8',
)

describe('ContextList layout', () => {
  it('stacks captured context cards vertically without horizontal overflow', () => {
    expect(contextListSource).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(contextListSource).not.toContain('grid-auto-flow: column')
    expect(contextListSource).not.toContain('overflow-x: auto')
    expect(contextCardSource).toContain('min-width: 0')
  })
})
