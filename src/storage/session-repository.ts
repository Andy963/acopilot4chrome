import type { ChatMessage, ChatSession, ContextItem, PendingCapture } from '../context/types'
import type { StorageArea } from './storage-area'

export const ACTIVE_SESSION_STORAGE_KEY = 'activeChatSession'
export const PENDING_CAPTURES_STORAGE_KEY = 'pendingCaptures'

export class SessionRepository {
  private pendingMutation = Promise.resolve()

  constructor(private readonly sessionStorage: StorageArea) {}

  async loadActiveSession(): Promise<ChatSession | null> {
    const values = await this.sessionStorage.get(ACTIVE_SESSION_STORAGE_KEY)
    return sanitizeSession(values[ACTIVE_SESSION_STORAGE_KEY])
  }

  async saveActiveSession(session: ChatSession): Promise<void> {
    await this.sessionStorage.set({
      [ACTIVE_SESSION_STORAGE_KEY]: projectSession(session),
    })
  }

  async clearActiveSession(): Promise<void> {
    await this.sessionStorage.remove(ACTIVE_SESSION_STORAGE_KEY)
  }

  async listPendingCaptures(): Promise<PendingCapture[]> {
    const values = await this.sessionStorage.get(PENDING_CAPTURES_STORAGE_KEY)
    return sanitizePendingCaptures(values[PENDING_CAPTURES_STORAGE_KEY])
  }

  async appendPendingCapture(capture: PendingCapture): Promise<void> {
    await this.mutatePendingCaptures((captures) => [...captures, capture])
  }

  async acknowledgePendingCaptures(captureIds: readonly string[]): Promise<number> {
    const ids = new Set(captureIds)
    let removed = 0

    await this.mutatePendingCaptures((captures) => {
      const remaining = captures.filter((capture) => {
        if (!ids.has(capture.id)) {
          return true
        }

        removed += 1
        return false
      })
      return remaining
    })

    return removed
  }

  async clearPendingCaptures(): Promise<void> {
    await this.mutatePendingCaptures(() => [])
  }

  private async mutatePendingCaptures(
    mutate: (captures: PendingCapture[]) => PendingCapture[],
  ): Promise<void> {
    const operation = this.pendingMutation.then(async () => {
      const captures = await this.listPendingCaptures()
      await this.sessionStorage.set({
        [PENDING_CAPTURES_STORAGE_KEY]: mutate(captures).map(projectPendingCapture),
      })
    })

    this.pendingMutation = operation.catch(() => undefined)
    await operation
  }
}

function sanitizeSession(value: unknown): ChatSession | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const session = value as Partial<ChatSession>
  if (
    typeof session.id !== 'string' ||
    typeof session.profileId !== 'string' ||
    !Array.isArray(session.contextItems) ||
    !Array.isArray(session.messages) ||
    typeof session.createdAt !== 'number' ||
    typeof session.updatedAt !== 'number'
  ) {
    return null
  }

  const contextItems = session.contextItems
    .map(sanitizeContextItem)
    .filter((item): item is ContextItem => item !== null)
  const messages = session.messages
    .map(sanitizeMessage)
    .filter((message): message is ChatMessage => message !== null)

  return {
    id: session.id,
    profileId: session.profileId,
    contextItems,
    messages,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function sanitizeMessage(value: unknown): ChatMessage | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const message = value as Partial<ChatMessage>
  const status = message.status
  if (
    typeof message.id !== 'string' ||
    (message.role !== 'user' && message.role !== 'assistant') ||
    typeof message.content !== 'string' ||
    typeof message.createdAt !== 'number' ||
    (status !== 'complete' &&
      status !== 'streaming' &&
      status !== 'cancelled' &&
      status !== 'error')
  ) {
    return null
  }

  const images = Array.isArray(message.images)
    ? message.images.filter((url): url is string => typeof url === 'string' && url.length > 0)
    : []
  const contextItems = Array.isArray(message.contextItems)
    ? message.contextItems
        .map(sanitizeContextItem)
        .filter((item): item is ContextItem => item !== null)
    : []

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    ...(images.length ? { images } : {}),
    ...(contextItems.length ? { contextItems } : {}),
    createdAt: message.createdAt,
    status: status === 'streaming' ? 'error' : status,
  }
}

function sanitizeContextItem(value: unknown): ContextItem | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const item = value as Partial<ContextItem>
  if (
    typeof item.id !== 'string' ||
    (item.kind !== 'selection' && item.kind !== 'page') ||
    typeof item.title !== 'string' ||
    typeof item.url !== 'string' ||
    typeof item.text !== 'string' ||
    typeof item.originalCharCount !== 'number' ||
    typeof item.truncated !== 'boolean' ||
    typeof item.capturedAt !== 'number'
  ) {
    return null
  }

  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    url: item.url,
    text: item.text,
    originalCharCount: item.originalCharCount,
    truncated: item.truncated,
    ...(typeof item.tabId === 'number' ? { tabId: item.tabId } : {}),
    capturedAt: item.capturedAt,
  }
}

function sanitizePendingCaptures(value: unknown): PendingCapture[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry): PendingCapture | null => {
      if (typeof entry !== 'object' || entry === null) {
        return null
      }

      const capture = entry as Partial<PendingCapture>
      const context = sanitizeContextItem(capture.context)
      if (
        typeof capture.id !== 'string' ||
        typeof capture.createdAt !== 'number' ||
        context === null
      ) {
        return null
      }

      return { id: capture.id, context, createdAt: capture.createdAt }
    })
    .filter((capture): capture is PendingCapture => capture !== null)
}

function projectSession(session: ChatSession): ChatSession {
  return {
    id: session.id,
    profileId: session.profileId,
    contextItems: session.contextItems.map(projectContextItem),
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      ...(message.images && message.images.length ? { images: [...message.images] } : {}),
      ...(message.contextItems && message.contextItems.length
        ? { contextItems: message.contextItems.map(projectContextItem) }
        : {}),
      createdAt: message.createdAt,
      status: message.status,
    })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function projectPendingCapture(capture: PendingCapture): PendingCapture {
  return {
    id: capture.id,
    context: projectContextItem(capture.context),
    createdAt: capture.createdAt,
  }
}

function projectContextItem(item: ContextItem): ContextItem {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    url: item.url,
    text: item.text,
    originalCharCount: item.originalCharCount,
    truncated: item.truncated,
    ...(typeof item.tabId === 'number' ? { tabId: item.tabId } : {}),
    capturedAt: item.capturedAt,
  }
}
