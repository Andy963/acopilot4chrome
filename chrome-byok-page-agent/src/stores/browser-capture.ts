import { prepareSelectionText } from '../context/extract-selection'
import { ensurePagePermission } from '../permissions/page-permission'
import { captureActivePage } from '../runtime/page-capture'
import { captureActiveSelection, type TabsApi } from '../runtime/selection-capture'

import type { CaptureKind, CaptureResult } from './context'

export async function captureBrowserContext(
  kind: CaptureKind,
  maxChars: number,
): Promise<CaptureResult> {
  const tabs = chromeTabsAdapter()
  const capture = async (): Promise<CaptureResult> => {
    if (kind === 'page') {
      return captureActivePage(tabs, chrome.scripting, maxChars)
    }

    const result = await captureActiveSelection(tabs, chrome.scripting)
    if (!result.ok) return result
    const prepared = prepareSelectionText(result.context.text, maxChars)
    return {
      ok: true,
      context: {
        ...result.context,
        text: prepared.text,
        originalCharCount: prepared.originalCharCount,
        truncated: prepared.truncated,
      },
    }
  }

  const initial = await capture()
  if (initial.ok || initial.error.code !== 'PERMISSION_DENIED') return initial

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return initial
  const permission = await ensurePagePermission(tab.url, chrome.permissions, {
    isAllowedFileSchemeAccess: () => chrome.extension.isAllowedFileSchemeAccess(),
  })
  if (!permission.ok) return { ok: false, error: permission.error }

  return capture()
}

function chromeTabsAdapter(): TabsApi {
  return {
    async query(queryInfo) {
      const tabs = await chrome.tabs.query(queryInfo)
      return tabs.map((tab) => ({
        ...(tab.id === undefined ? {} : { id: tab.id }),
        ...(tab.title === undefined ? {} : { title: tab.title }),
        ...(tab.url === undefined ? {} : { url: tab.url }),
      }))
    },
  }
}
