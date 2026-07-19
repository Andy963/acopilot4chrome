import { describe, expect, it } from 'vitest'

import { cloneAndCleanDocument, extractPageText } from '../../src/context/extract-page'
import { prepareSelectionText } from '../../src/context/extract-selection'

describe('selection extraction', () => {
  it('normalizes and truncates captured selection text', () => {
    const result = prepareSelectionText(`  ${'word '.repeat(30)}  `, 60)
    expect(result.originalCharCount).toBe(149)
    expect(result.text).toHaveLength(60)
    expect(result.truncated).toBe(true)
  })
})

describe('page extraction', () => {
  it('cleans sensitive and hidden nodes without mutating the source document', () => {
    document.body.innerHTML = `
      <main><p>Visible article text</p></main>
      <input value="private value">
      <textarea>private note</textarea>
      <div hidden>hidden text</div>
      <script>secretScript()</script>
    `

    const clean = cloneAndCleanDocument(document)

    expect(clean.body.textContent).toContain('Visible article text')
    expect(clean.body.textContent).not.toContain('private value')
    expect(clean.body.textContent).not.toContain('private note')
    expect(clean.body.textContent).not.toContain('hidden text')
    expect(clean.body.textContent).not.toContain('secretScript')
    expect(document.querySelector('input')).not.toBeNull()
  })

  it('falls back to cleaned visible text for short pages', () => {
    document.title = 'Fixture'
    document.body.innerHTML = '<main><p>Short but useful content.</p></main>'

    const result = extractPageText(document, 1_000)

    expect(result.text).toContain('Short but useful content.')
    expect(result.extractionMethod).toBe('visible-text')
    expect(result.title).toBe('Fixture')
  })
})
