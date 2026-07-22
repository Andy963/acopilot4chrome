import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const chatMessageSource = readFileSync(
  resolve(__dirname, '../../src/components/ChatMessage.vue'),
  'utf8',
)

describe('ChatMessage Markdown rendering', () => {
  it('keeps streaming content as text and renders Markdown only after completion', () => {
    expect(chatMessageSource).toContain(
      'v-if="message.status === \'streaming\' && message.content"',
    )
    expect(chatMessageSource).toContain('class="plain-content streaming-content"')
    expect(chatMessageSource).toContain('v-else-if="message.content"')
    expect(chatMessageSource).toContain('class="markdown-content"')
  })
})
