import { Readability } from '@mozilla/readability'

import { normalizeWhitespace } from './normalize'
import { truncateText, type TruncatedText } from './truncate'

const REMOVED_ELEMENTS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'input',
  'textarea',
  'select',
  'option',
].join(',')

export interface ExtractedPageText extends TruncatedText {
  title: string
  extractionMethod: 'readability' | 'visible-text'
}

export function cloneAndCleanDocument(source: Document): Document {
  const clone = source.cloneNode(true) as Document
  clone.querySelectorAll(REMOVED_ELEMENTS).forEach((element) => element.remove())
  clone.querySelectorAll('[hidden], [aria-hidden="true"], [style]').forEach((element) => {
    if (isObviouslyHidden(element)) {
      element.remove()
    }
  })
  return clone
}

export function extractPageText(source: Document, maxChars: number): ExtractedPageText {
  const cleanDocument = cloneAndCleanDocument(source)
  const readabilityDocument = cleanDocument.cloneNode(true) as Document
  const article = new Readability(readabilityDocument).parse()
  const readableText = normalizeWhitespace(article?.textContent ?? '')
  const fallbackText = normalizeWhitespace(getVisibleBodyText(cleanDocument))
  const useReadability = readableText.length >= 200 || fallbackText.length === 0
  const text = useReadability ? readableText : fallbackText
  const truncated = truncateText(text, maxChars)

  return {
    ...truncated,
    title: normalizeWhitespace(article?.title || cleanDocument.title || source.title),
    extractionMethod: useReadability ? 'readability' : 'visible-text',
  }
}

function getVisibleBodyText(document: Document): string {
  const body = document.body
  if (!body) {
    return ''
  }

  return typeof body.innerText === 'string' ? body.innerText : (body.textContent ?? '')
}

function isObviouslyHidden(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return true
  }

  const style = element.getAttribute('style')?.toLowerCase() ?? ''
  return (
    /(?:^|;)\s*display\s*:\s*none(?:\s*!important)?\s*(?:;|$)/.test(style) ||
    /(?:^|;)\s*visibility\s*:\s*hidden(?:\s*!important)?\s*(?:;|$)/.test(style)
  )
}
