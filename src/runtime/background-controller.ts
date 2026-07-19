import type { ContextItem, PendingCapture } from '../context/types'
import { isSupportedPageUrl } from '../permissions/page-permission'

export const SELECTION_CONTEXT_MENU_ID = 'ask-with-selected-text'

export interface ContextMenuClickInfo {
  menuItemId: string | number
  selectionText?: string | undefined
  pageUrl?: string | undefined
}

export interface ContextMenuTab {
  id?: number | undefined
  title?: string | undefined
  url?: string | undefined
  windowId?: number | undefined
}

export interface PendingCaptureQueue {
  appendPendingCapture(capture: PendingCapture): Promise<void>
}

export interface BackgroundPorts {
  registerSelectionContextMenu(): Promise<void>
  enableActionClickSidePanel(): Promise<void>
  openSidePanel(windowId: number): Promise<void>
  notifyPendingCapturesChanged(): Promise<void>
}

export type BackgroundCaptureErrorCode =
  | 'NO_SELECTION'
  | 'UNSUPPORTED_PAGE'
  | 'TAB_UNAVAILABLE'
  | 'SIDE_PANEL_OPEN_FAILED'

export type BackgroundCaptureResult =
  | { ok: true; capture: PendingCapture }
  | {
      ok: false
      error: { code: BackgroundCaptureErrorCode; message: string }
    }

export class BackgroundController {
  constructor(
    private readonly queue: PendingCaptureQueue,
    private readonly ports: BackgroundPorts,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async initialize(): Promise<void> {
    await Promise.all([
      this.ports.registerSelectionContextMenu(),
      this.ports.enableActionClickSidePanel(),
    ])
  }

  async handleContextMenuClick(
    info: ContextMenuClickInfo,
    tab?: ContextMenuTab,
  ): Promise<BackgroundCaptureResult | null> {
    if (info.menuItemId !== SELECTION_CONTEXT_MENU_ID) {
      return null
    }

    const selectionText = info.selectionText
    if (selectionText === undefined || selectionText.trim() === '') {
      return failure('NO_SELECTION', 'No selected text was provided by Chrome.')
    }

    const pageUrl = info.pageUrl ?? tab?.url
    if (pageUrl === undefined || !isSupportedPageUrl(pageUrl)) {
      return failure('UNSUPPORTED_PAGE', 'This browser page cannot be captured.')
    }

    if (tab?.windowId === undefined) {
      return failure('TAB_UNAVAILABLE', 'The source tab is not available.')
    }

    const capturedAt = this.now()
    const context: ContextItem = {
      id: this.createId(),
      kind: 'selection',
      title: tab.title?.trim() || pageUrl,
      url: pageUrl,
      text: selectionText,
      originalCharCount: selectionText.length,
      truncated: false,
      ...(typeof tab.id === 'number' ? { tabId: tab.id } : {}),
      capturedAt,
    }
    const capture: PendingCapture = {
      id: this.createId(),
      context,
      createdAt: capturedAt,
    }

    await this.queue.appendPendingCapture(capture)

    let openFailed = false
    try {
      await this.ports.openSidePanel(tab.windowId)
    } catch {
      openFailed = true
    }

    try {
      await this.ports.notifyPendingCapturesChanged()
    } catch {
      // The durable queue is the delivery mechanism when the side panel is absent.
    }

    if (openFailed) {
      return failure(
        'SIDE_PANEL_OPEN_FAILED',
        'The selection was saved, but the side panel could not be opened.',
      )
    }

    return { ok: true, capture }
  }
}

function failure(code: BackgroundCaptureErrorCode, message: string): BackgroundCaptureResult {
  return { ok: false, error: { code, message } }
}
