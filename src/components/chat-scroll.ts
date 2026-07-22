export const AUTO_SCROLL_BOTTOM_THRESHOLD = 48

export interface StreamingScrollGeometry {
  scrollHeight: number
  clientHeight: number
  scrollTop: number
  containerTop: number
  messageTop: number
  paddingTop: number
}

export function isNearScrollBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = AUTO_SCROLL_BOTTOM_THRESHOLD,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold
}

export function shouldPauseFollowingForWheel(deltaY: number, isAtBottom: boolean): boolean {
  return deltaY < 0 || (deltaY > 0 && !isAtBottom)
}

export function shouldFollowAfterManualScroll(
  scrollHeight: number,
  previousScrollTop: number,
  scrollTop: number,
  clientHeight: number,
): boolean {
  if (scrollTop < previousScrollTop) return false
  return isNearScrollBottom(scrollHeight, scrollTop, clientHeight)
}

export function getBoundedStreamingScrollTop(geometry: StreamingScrollGeometry): number {
  const bottom = Math.max(0, geometry.scrollHeight - geometry.clientHeight)
  const messageTopInContent =
    geometry.scrollTop + geometry.messageTop - geometry.containerTop - geometry.paddingTop
  return Math.min(bottom, Math.max(0, messageTopInContent))
}
