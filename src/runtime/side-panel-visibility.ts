import {
  compileUrlBlocklist,
  EMPTY_URL_BLOCKLIST,
  isUrlBlocked,
  type UrlBlocklist,
} from '../permissions/url-blocklist'

export interface SidePanelVisibilityTab {
  id?: number | undefined
  url?: string | undefined
  pendingUrl?: string | undefined
}

export interface SidePanelVisibilityPorts {
  loadHiddenUrlPatterns(): Promise<readonly string[]>
  setTabPanelEnabled(tabId: number, enabled: boolean): Promise<void>
  listTabs(): Promise<readonly SidePanelVisibilityTab[]>
}

/**
 * Chrome's side panel is window-level UI, so the only way to hide it for a page
 * is to disable the panel on that specific tab.
 */
export class SidePanelVisibility {
  private blocklist: UrlBlocklist = EMPTY_URL_BLOCKLIST

  constructor(private readonly ports: SidePanelVisibilityPorts) {}

  get invalidPatterns(): readonly string[] {
    return this.blocklist.invalidPatterns
  }

  async refresh(): Promise<void> {
    this.blocklist = compileUrlBlocklist(await this.ports.loadHiddenUrlPatterns())
    await this.applyToAllTabs()
  }

  async applyToAllTabs(): Promise<void> {
    const tabs = await this.ports.listTabs()
    await Promise.all(tabs.map((tab) => this.applyToTab(tab.id, tab.url ?? tab.pendingUrl)))
  }

  async applyToTab(tabId: number | undefined, url: string | undefined): Promise<void> {
    if (tabId === undefined) return
    try {
      await this.ports.setTabPanelEnabled(tabId, !isUrlBlocked(url, this.blocklist))
    } catch {
      // The tab closed, or navigated, between the event and this write.
    }
  }
}
