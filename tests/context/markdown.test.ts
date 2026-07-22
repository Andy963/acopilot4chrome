import { describe, expect, it } from 'vitest'

import { renderMarkdown } from '../../src/context/markdown'

describe('renderMarkdown', () => {
  it('renders inline and block LaTeX math via KaTeX without throwing', () => {
    const inline = renderMarkdown('The value is $x^2 + 1$.')
    expect(inline).toContain('katex')

    const block = renderMarkdown('$$\\frac{a}{b}$$')
    expect(block).toContain('katex')
  })

  it('normalizes common model-generated LaTeX delimiters', () => {
    const inline = renderMarkdown('The value is \\(x^2 + 1\\).')
    expect(inline).toContain('katex')
    expect(inline).not.toContain('\\(')

    const block = renderMarkdown('Before\n\\[\n\\frac{a}{b}\n\\]\nAfter')
    expect(block).toContain('katex-display')
    expect(block).not.toContain('\\[')

    const adjacent = renderMarkdown('\\(a\\)\\(b\\)')
    expect(adjacent.match(/class="katex"/g)).toHaveLength(2)

    const escapedCommands = renderMarkdown(String.raw`$W_v^\\top\\tanh(x)$`)
    expect(escapedCommands).toContain('katex')
    expect(escapedCommands).not.toContain('katex-error')
  })

  it('preserves LaTeX delimiters inside inline and fenced code', () => {
    const html = renderMarkdown('`\\(inline\\)`\n\n```tex\n\\[\nx + y\n\\]\n```')
    expect(html).toContain('\\(inline\\)')
    expect(html).toContain('\\[')
    expect(html).not.toContain('katex')
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
