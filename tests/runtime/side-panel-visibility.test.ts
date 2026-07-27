import { describe, expect, it, vi } from 'vitest'

import {
  SidePanelVisibility,
  type SidePanelVisibilityPorts,
  type SidePanelVisibilityTab,
} from '../../src/runtime/side-panel-visibility'

describe('SidePanelVisibility', () => {
  it('disables the panel only on tabs whose URL matches a pattern', async () => {
    const ports = visibilityPorts(
      ['^https://mail\\.google\\.com/'],
      [
        { id: 1, url: 'https://mail.google.com/u/0/' },
        { id: 2, url: 'https://example.com/' },
      ],
    )
    const visibility = new SidePanelVisibility(ports)

    await visibility.refresh()

    expect(ports.setTabPanelEnabled).toHaveBeenCalledWith(1, false)
    expect(ports.setTabPanelEnabled).toHaveBeenCalledWith(2, true)
  })

  it('re-enables the panel when a blocked tab navigates away', async () => {
    const ports = visibilityPorts(['^https://mail\\.google\\.com/'], [])
    const visibility = new SidePanelVisibility(ports)
    await visibility.refresh()

    await visibility.applyToTab(5, 'https://mail.google.com/u/0/')
    await visibility.applyToTab(5, 'https://example.com/')

    expect(ports.setTabPanelEnabled).toHaveBeenNthCalledWith(1, 5, false)
    expect(ports.setTabPanelEnabled).toHaveBeenNthCalledWith(2, 5, true)
  })

  it('reports invalid patterns while still applying the valid ones', async () => {
    const ports = visibilityPorts(['(', 'example\\.com'], [{ id: 3, url: 'https://example.com/' }])
    const visibility = new SidePanelVisibility(ports)

    await visibility.refresh()

    expect(visibility.invalidPatterns).toEqual(['('])
    expect(ports.setTabPanelEnabled).toHaveBeenCalledWith(3, false)
  })

  it('falls back to the pending URL of a tab that has not committed yet', async () => {
    const ports = visibilityPorts(
      ['example\\.com'],
      [{ id: 4, pendingUrl: 'https://example.com/' }],
    )
    const visibility = new SidePanelVisibility(ports)

    await visibility.refresh()

    expect(ports.setTabPanelEnabled).toHaveBeenCalledWith(4, false)
  })

  it('ignores tabs without an id and swallows races with closing tabs', async () => {
    const ports = visibilityPorts(['example\\.com'], [{ url: 'https://example.com/' }])
    vi.mocked(ports.setTabPanelEnabled).mockRejectedValue(new Error('No tab with id'))
    const visibility = new SidePanelVisibility(ports)

    await visibility.refresh()
    expect(ports.setTabPanelEnabled).not.toHaveBeenCalled()

    await expect(visibility.applyToTab(9, 'https://example.com/')).resolves.toBeUndefined()
  })

  it('treats every tab as allowed before any pattern is configured', async () => {
    const ports = visibilityPorts(['example\\.com'], [])
    const visibility = new SidePanelVisibility(ports)

    await visibility.applyToTab(1, 'https://example.com/')

    expect(ports.setTabPanelEnabled).toHaveBeenCalledWith(1, true)
  })
})

function visibilityPorts(
  patterns: readonly string[],
  tabs: readonly SidePanelVisibilityTab[],
): SidePanelVisibilityPorts {
  return {
    loadHiddenUrlPatterns: vi.fn().mockResolvedValue(patterns),
    setTabPanelEnabled: vi.fn().mockResolvedValue(undefined),
    listTabs: vi.fn().mockResolvedValue(tabs),
  }
}
