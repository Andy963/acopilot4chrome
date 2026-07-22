import { describe, expect, it } from 'vitest'

import { renderMarkdown } from '../../src/context/markdown'

describe('renderMarkdown', () => {
  it('renders inline and block LaTeX math via KaTeX without throwing', () => {
    const inline = renderMarkdown('The value is $x^2 + 1$.')
    expect(inline).toContain('katex')

    const block = renderMarkdown('$$\\frac{a}{b}$$')
    expect(block).toContain('katex')
  })

  it('keeps code blocks with a copy button and does not emit raw HTML', () => {
    const html = renderMarkdown('```js\nconst a = 1\n```\n\n<img src=x onerror=alert(1)>')
    expect(html).toContain('copy-code')
    expect(html).not.toContain('<img src=x')
  })

  it('opens links safely in a new tab and rejects dangerous schemes', () => {
    const safe = renderMarkdown('[site](https://example.com)')
    expect(safe).toContain('target="_blank"')
    expect(safe).toContain('rel="noopener noreferrer"')

    const dangerous = renderMarkdown('[x](javascript:alert(1))')
    expect(dangerous).not.toContain('href="javascript:')
  })
})
