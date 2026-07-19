import type { PendingCapture } from '../context/types'

export interface RuntimeError {
  code: 'INVALID_MESSAGE' | 'PERMISSION_DENIED' | 'UNSUPPORTED_PAGE' | 'INTERNAL_ERROR'
  message: string
}

export type RuntimeResult<T> = { ok: true; value: T } | { ok: false; error: RuntimeError }

export interface RuntimeRequestMap {
  'pending-captures:list': {
    request: object
    response: PendingCapture[]
  }
  'pending-captures:ack': {
    request: { captureIds: string[] }
    response: { removed: number }
  }
}

export type RuntimeRequestType = keyof RuntimeRequestMap

export type RuntimeRequest<T extends RuntimeRequestType = RuntimeRequestType> = {
  [K in T]: { type: K } & RuntimeRequestMap[K]['request']
}[T]

export type RuntimeResponse<T extends RuntimeRequestType> = RuntimeResult<
  RuntimeRequestMap[T]['response']
>

export interface PendingCapturesChangedMessage {
  type: 'pending-captures:changed'
}

export type RuntimeNotification = PendingCapturesChangedMessage

export interface RuntimeMessenger {
  sendMessage(message: unknown): Promise<unknown>
}

export async function sendRuntimeRequest<T extends RuntimeRequestType>(
  messenger: RuntimeMessenger,
  request: RuntimeRequest<T>,
): Promise<RuntimeResponse<T>> {
  return (await messenger.sendMessage(request)) as RuntimeResponse<T>
}

export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false
  }

  const type = (value as { type?: unknown }).type
  if (type === 'pending-captures:list') {
    return true
  }

  if (type === 'pending-captures:ack') {
    const captureIds = (value as { captureIds?: unknown }).captureIds
    return (
      Array.isArray(captureIds) && captureIds.every((captureId) => typeof captureId === 'string')
    )
  }

  return false
}
