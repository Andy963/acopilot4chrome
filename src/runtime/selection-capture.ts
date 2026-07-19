import type { ContextItem } from '../context/types'
import { getPageOriginPattern } from '../permissions/page-permission'

export interface ActiveTab {
  id?: number | undefined
  title?: string | undefined
  url?: string | undefined
}

export interface TabsApi {
  query(queryInfo: { active: true; currentWindow: true }): Promise<ActiveTab[]>
}

export interface ScriptingApi {
  executeScript(options: {
    target: { tabId: number }
    func: () => SerializedSelection
  }): Promise<Array<{ result?: SerializedSelection }>>
}

interface SerializedSelection {
  text: string
  title: string
  url: string
}

export type SelectionCaptureResult =
  | { ok: true; context: ContextItem }
  | {
      ok: false
      error: {
        code:
          | 'TAB_UNAVAILABLE'
          | 'UNSUPPORTED_PAGE'
          | 'SOURCE_CHANGED'
          | 'NO_SELECTION'
          | 'PERMISSION_DENIED'
        message: string
      }
    }

export async function captureActiveSelection(
  tabs: TabsApi,
  scripting: ScriptingApi,
  createId: () => string = () => crypto.randomUUID(),
  now: () => number = () => Date.now(),
): Promise<SelectionCaptureResult> {
  const [tab] = await tabs.query({ active: true, currentWindow: true })
  if (tab?.id === undefined || tab.url === undefined) {
    return failure('TAB_UNAVAILABLE', 'The active tab is not available.')
  }

  if (!getPageOriginPattern(tab.url).ok) {
    return failure('UNSUPPORTED_PAGE', 'This browser page cannot be captured.')
  }

  let results: Array<{ result?: SerializedSelection }>
  try {
    results = await scripting.executeScript({
      target: { tabId: tab.id },
      func: readWindowSelection,
    })
  } catch {
    return failure('PERMISSION_DENIED', 'The extension could not access the active page.')
  }

  const selection = results[0]?.result
  if (selection !== undefined && selection.url !== tab.url) {
    return failure(
      'SOURCE_CHANGED',
      'The active page changed while the selection was being captured.',
    )
  }

  const text = selection?.text ?? ''
  if (text.trim() === '') {
    return failure('NO_SELECTION', 'Select text on the page and try again.')
  }

  return {
    ok: true,
    context: {
      id: createId(),
      kind: 'selection',
      title: selection?.title.trim() || selection?.url || tab.url,
      url: selection?.url ?? tab.url,
      text,
      originalCharCount: text.length,
      truncated: false,
      tabId: tab.id,
      capturedAt: now(),
    },
  }
}

function readWindowSelection(): SerializedSelection {
  return {
    text: window.getSelection()?.toString() ?? '',
    title: document.title,
    url: window.location.href,
  }
}

function failure(
  code:
    | 'TAB_UNAVAILABLE'
    | 'UNSUPPORTED_PAGE'
    | 'SOURCE_CHANGED'
    | 'NO_SELECTION'
    | 'PERMISSION_DENIED',
  message: string,
): SelectionCaptureResult {
  return { ok: false, error: { code, message } }
}
