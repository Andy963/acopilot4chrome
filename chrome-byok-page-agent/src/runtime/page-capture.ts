import { extractPageText } from '../context/extract-page'
import type { ContextItem } from '../context/types'
import { getPageOriginPattern } from '../permissions/page-permission'
import type { ActiveTab, TabsApi } from './selection-capture'

interface SerializedPage {
  html: string
  title: string
  url: string
}

export interface PageScriptingApi {
  executeScript(options: {
    target: { tabId: number }
    func: () => SerializedPage
  }): Promise<Array<{ result?: SerializedPage }>>
}

export type PageCaptureResult =
  | { ok: true; context: ContextItem; extractionMethod: 'readability' | 'visible-text' }
  | {
      ok: false
      error: {
        code:
          | 'TAB_UNAVAILABLE'
          | 'UNSUPPORTED_PAGE'
          | 'SOURCE_CHANGED'
          | 'EMPTY_PAGE'
          | 'PERMISSION_DENIED'
          | 'EXTRACTION_FAILED'
        message: string
      }
    }

export async function captureActivePage(
  tabs: TabsApi,
  scripting: PageScriptingApi,
  maxChars: number,
  createId: () => string = () => crypto.randomUUID(),
  now: () => number = () => Date.now(),
  parseDocument: (html: string) => Document = parseHtmlDocument,
): Promise<PageCaptureResult> {
  const [tab] = await tabs.query({ active: true, currentWindow: true })
  const validation = validateTab(tab)
  if (!validation.ok) {
    return validation
  }

  let serialized: SerializedPage | undefined
  try {
    const results = await scripting.executeScript({
      target: { tabId: validation.tab.id },
      func: serializeSanitizedPage,
    })
    serialized = results[0]?.result
  } catch {
    return failure('PERMISSION_DENIED', 'The extension could not access the active page.')
  }

  if (serialized === undefined) {
    return failure('EXTRACTION_FAILED', 'The page did not return extractable content.')
  }

  if (serialized.url !== validation.tab.url) {
    return failure('SOURCE_CHANGED', 'The active page changed while it was being captured.')
  }

  try {
    const extracted = extractPageText(parseDocument(serialized.html), maxChars)
    if (extracted.text.trim() === '') {
      return failure('EMPTY_PAGE', 'The page does not contain readable text.')
    }

    return {
      ok: true,
      context: {
        id: createId(),
        kind: 'page',
        title: extracted.title || serialized.title || serialized.url,
        url: serialized.url,
        text: extracted.text,
        originalCharCount: extracted.originalCharCount,
        truncated: extracted.truncated,
        tabId: validation.tab.id,
        capturedAt: now(),
      },
      extractionMethod: extracted.extractionMethod,
    }
  } catch {
    return failure('EXTRACTION_FAILED', 'The page text could not be extracted.')
  }
}

function validateTab(
  tab: ActiveTab | undefined,
):
  | { ok: true; tab: { id: number; title?: string | undefined; url: string } }
  | Extract<PageCaptureResult, { ok: false }> {
  if (tab?.id === undefined || tab.url === undefined) {
    return failure('TAB_UNAVAILABLE', 'The active tab is not available.')
  }

  if (!getPageOriginPattern(tab.url).ok) {
    return failure('UNSUPPORTED_PAGE', 'This browser page cannot be captured.')
  }

  return { ok: true, tab: { id: tab.id, title: tab.title, url: tab.url } }
}

function parseHtmlDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function serializeSanitizedPage(): SerializedPage {
  const clone = document.cloneNode(true) as Document
  const sourceElements = Array.from(document.querySelectorAll('*'))
  const clonedElements = Array.from(clone.querySelectorAll('*'))
  const removableTags = new Set([
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
  ])

  sourceElements.forEach((element, index) => {
    const clonedElement = clonedElements[index]
    if (!clonedElement) {
      return
    }

    const tagName = element.tagName.toLowerCase()
    const contentEditable = element.getAttribute('contenteditable')?.toLowerCase()
    const editable =
      (element as HTMLElement).isContentEditable === true ||
      contentEditable === '' ||
      contentEditable === 'true' ||
      contentEditable === 'plaintext-only'
    const computedStyle = window.getComputedStyle(element)
    const hiddenByStyle =
      computedStyle.display === 'none' ||
      computedStyle.visibility === 'hidden' ||
      computedStyle.visibility === 'collapse' ||
      computedStyle.getPropertyValue('content-visibility') === 'hidden'

    if (
      removableTags.has(tagName) ||
      editable ||
      element.hasAttribute('hidden') ||
      element.getAttribute('aria-hidden') === 'true' ||
      hiddenByStyle
    ) {
      clonedElement.remove()
    }
  })

  return {
    html: clone.documentElement?.outerHTML ?? '',
    title: document.title,
    url: location.href,
  }
}

function failure(
  code:
    | 'TAB_UNAVAILABLE'
    | 'UNSUPPORTED_PAGE'
    | 'SOURCE_CHANGED'
    | 'EMPTY_PAGE'
    | 'PERMISSION_DENIED'
    | 'EXTRACTION_FAILED',
  message: string,
): Extract<PageCaptureResult, { ok: false }> {
  return { ok: false, error: { code, message } }
}
