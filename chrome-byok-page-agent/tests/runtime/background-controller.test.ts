import { describe, expect, it, vi } from 'vitest'

import {
  BackgroundController,
  SELECTION_CONTEXT_MENU_ID,
  type BackgroundPorts,
} from '../../src/runtime/background-controller'

describe('BackgroundController', () => {
  it('durably queues Chrome selectionText before opening the side panel', async () => {
    const events: string[] = []
    const appendPendingCapture = vi.fn(async () => {
      events.push('stored')
    })
    const ports = backgroundPorts(events)
    const ids = ['context-1', 'capture-1']
    const controller = new BackgroundController(
      { appendPendingCapture },
      ports,
      () => ids.shift() ?? 'unexpected',
      () => 42,
    )

    const result = await controller.handleContextMenuClick(
      {
        menuItemId: SELECTION_CONTEXT_MENU_ID,
        selectionText: '  selected text  ',
        pageUrl: 'https://example.com/article',
      },
      { id: 7, title: 'Article', windowId: 9 },
    )

    expect(events).toEqual(['stored', 'opened', 'notified'])
    expect(result).toMatchObject({
      ok: true,
      capture: {
        id: 'capture-1',
        context: {
          id: 'context-1',
          text: '  selected text  ',
          tabId: 7,
          originalCharCount: 17,
        },
      },
    })
  })

  it('rejects unsupported pages without writing a capture', async () => {
    const appendPendingCapture = vi.fn()
    const controller = new BackgroundController({ appendPendingCapture }, backgroundPorts([]))

    const result = await controller.handleContextMenuClick(
      {
        menuItemId: SELECTION_CONTEXT_MENU_ID,
        selectionText: 'text',
        pageUrl: 'chrome://settings/',
      },
      { windowId: 1 },
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_PAGE' },
    })
    expect(appendPendingCapture).not.toHaveBeenCalled()
  })

  it('keeps the queued capture when opening the panel fails', async () => {
    const appendPendingCapture = vi.fn().mockResolvedValue(undefined)
    const ports = backgroundPorts([])
    vi.mocked(ports.openSidePanel).mockRejectedValue(new Error('closed window'))
    const controller = new BackgroundController(
      { appendPendingCapture },
      ports,
      () => 'id',
      () => 1,
    )

    const result = await controller.handleContextMenuClick(
      {
        menuItemId: SELECTION_CONTEXT_MENU_ID,
        selectionText: 'text',
        pageUrl: 'https://example.com/',
      },
      { windowId: 1 },
    )

    expect(appendPendingCapture).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'SIDE_PANEL_OPEN_FAILED' },
    })
  })
})

function backgroundPorts(events: string[]): BackgroundPorts {
  return {
    registerSelectionContextMenu: vi.fn().mockResolvedValue(undefined),
    enableActionClickSidePanel: vi.fn().mockResolvedValue(undefined),
    openSidePanel: vi.fn(async () => {
      events.push('opened')
    }),
    notifyPendingCapturesChanged: vi.fn(async () => {
      events.push('notified')
    }),
  }
}
