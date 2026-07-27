import { defineBackground } from 'wxt/utils/define-background'

import { createRuntimeMessageRouter } from '../src/messaging/router'
import {
  BackgroundController,
  SELECTION_CONTEXT_MENU_ID,
} from '../src/runtime/background-controller'
import { SidePanelVisibility } from '../src/runtime/side-panel-visibility'
import { HIDDEN_URL_PATTERNS_STORAGE_KEY, PreferencesRepository } from '../src/storage/preferences'
import { SessionRepository } from '../src/storage/session-repository'
import type { StorageArea } from '../src/storage/storage-area'

const SIDE_PANEL_PATH = 'sidepanel.html'

export default defineBackground(() => {
  const sessions = new SessionRepository(chrome.storage.session as StorageArea)
  const preferences = new PreferencesRepository(chrome.storage.local as StorageArea)
  const sidePanelVisibility = new SidePanelVisibility({
    loadHiddenUrlPatterns: () => preferences.getHiddenUrlPatterns(),
    async setTabPanelEnabled(tabId, enabled) {
      await chrome.sidePanel.setOptions(
        enabled ? { tabId, path: SIDE_PANEL_PATH, enabled: true } : { tabId, enabled: false },
      )
    },
    listTabs: () => chrome.tabs.query({}),
  })
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
  void sidePanelVisibility.refresh()

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void controller.handleContextMenuClick(info, tab)
  })

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url === undefined && changeInfo.status === undefined) return
    void sidePanelVisibility.applyToTab(tabId, changeInfo.url ?? tab.url ?? tab.pendingUrl)
  })

  chrome.tabs.onCreated.addListener((tab) => {
    void sidePanelVisibility.applyToTab(tab.id, tab.url ?? tab.pendingUrl)
  })

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || changes[HIDDEN_URL_PATTERNS_STORAGE_KEY] === undefined) return
    void sidePanelVisibility.refresh()
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
