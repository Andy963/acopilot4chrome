import { describe, expect, it } from 'vitest'

import {
  getBoundedStreamingScrollTop,
  isNearScrollBottom,
  shouldFollowAfterManualScroll,
  shouldPauseFollowingForWheel,
} from '../../src/components/chat-scroll'

describe('chat auto-scroll', () => {
  it('follows the bottom while the streaming message top is still visible', () => {
    expect(
      getBoundedStreamingScrollTop({
        scrollHeight: 560,
        clientHeight: 500,
        scrollTop: 40,
        containerTop: 100,
        messageTop: 260,
        paddingTop: 16,
      }),
    ).toBe(60)
  })

  it('stops once the streaming message reaches the top of the viewport', () => {
    expect(
      getBoundedStreamingScrollTop({
        scrollHeight: 1_400,
        clientHeight: 500,
        scrollTop: 300,
        containerTop: 100,
        messageTop: 116,
        paddingTop: 16,
      }),
    ).toBe(300)
  })

  it('does not move past the streaming message top as content grows', () => {
    const geometry = {
      clientHeight: 500,
      scrollTop: 300,
      containerTop: 100,
      messageTop: 116,
      paddingTop: 16,
    }

    expect(getBoundedStreamingScrollTop({ ...geometry, scrollHeight: 1_400 })).toBe(300)
    expect(getBoundedStreamingScrollTop({ ...geometry, scrollHeight: 2_400 })).toBe(300)
  })

  it('recognizes when the user has returned to the bottom', () => {
    expect(isNearScrollBottom(1_000, 452, 500)).toBe(true)
    expect(isNearScrollBottom(1_000, 451, 500)).toBe(false)
  })

  it('pauses immediately when the user wheels up near the bottom', () => {
    expect(shouldPauseFollowingForWheel(-1, true)).toBe(true)
  })

  it('does not chase the stream after a manual wheel below the cap', () => {
    expect(shouldPauseFollowingForWheel(1, false)).toBe(true)
    expect(shouldPauseFollowingForWheel(1, true)).toBe(false)
  })

  it('pauses on upward manual scrolling and resumes only at the bottom', () => {
    expect(shouldFollowAfterManualScroll(1_000, 460, 455, 500)).toBe(false)
    expect(shouldFollowAfterManualScroll(1_000, 300, 400, 500)).toBe(false)
    expect(shouldFollowAfterManualScroll(1_000, 400, 500, 500)).toBe(true)
  })
})
