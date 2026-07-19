import { defineBackground } from 'wxt/utils/define-background'

import { createRuntimeMessageRouter } from '../src/messaging/router'
import {
  BackgroundController,
  SELECTION_CONTEXT_MENU_ID,
} from '../src/runtime/background-controller'
import { SessionRepository } from '../src/storage/session-repository'
import type { StorageArea } from '../src/storage/storage-area'

export default defineBackground(() => {
  const sessions = new SessionRepository(chrome.storage.session as StorageArea)
  const controller = new BackgroundController(sessions, {
    async registerSelectionContextMenu() {
      await removeContextMenuIfPresent(SELECTION_CONTEXT_MENU_ID)
      chrome.contextMenus.create({
        id: SELECTION_CONTEXT_MENU_ID,
        title: 'Ask with selected text',
        contexts: ['selection'],
      })
    },
    async enableActionClickSidePanel() {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    },
    async openSidePanel(windowId) {
      await chrome.sidePanel.open({ windowId })
    },
    async notifyPendingCapturesChanged() {
      await chrome.runtime.sendMessage({ type: 'pending-captures:changed' })
    },
  })

  void controller.initialize()

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void controller.handleContextMenuClick(info, tab)
  })

  chrome.runtime.onMessage.addListener(
    createRuntimeMessageRouter({
      'pending-captures:list': async () => sessions.listPendingCaptures(),
      'pending-captures:ack': async ({ captureIds }) => ({
        removed: await sessions.acknowledgePendingCaptures(captureIds),
      }),
    }),
  )
})

async function removeContextMenuIfPresent(menuItemId: string): Promise<void> {
  try {
    await chrome.contextMenus.remove(menuItemId)
  } catch {
    // The menu is absent on first install.
  }
}
