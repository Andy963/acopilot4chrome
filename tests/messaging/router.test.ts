import { describe, expect, it, vi } from 'vitest'

import { createRuntimeMessageRouter } from '../../src/messaging/router'

describe('runtime message router', () => {
  it('routes typed pending capture requests', async () => {
    const sendResponse = vi.fn()
    const router = createRuntimeMessageRouter({
      'pending-captures:list': vi.fn().mockResolvedValue([]),
      'pending-captures:ack': vi.fn().mockResolvedValue({ removed: 2 }),
    })

    const keepChannelOpen = router(
      { type: 'pending-captures:ack', captureIds: ['one', 'two'] },
      {},
      sendResponse,
    )
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())

    expect(keepChannelOpen).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      value: { removed: 2 },
    })
  })

  it('ignores invalid or notification messages', () => {
    const sendResponse = vi.fn()
    const router = createRuntimeMessageRouter({
      'pending-captures:list': vi.fn(),
      'pending-captures:ack': vi.fn(),
    })

    expect(router({ type: 'pending-captures:changed' }, {}, sendResponse)).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('does not expose thrown error details', async () => {
    const sendResponse = vi.fn()
    const router = createRuntimeMessageRouter({
      'pending-captures:list': vi.fn().mockRejectedValue(new Error('secret detail')),
      'pending-captures:ack': vi.fn(),
    })

    router({ type: 'pending-captures:list' }, {}, sendResponse)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())

    expect(JSON.stringify(sendResponse.mock.calls)).not.toContain('secret detail')
  })
})
