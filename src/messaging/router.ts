import type { RuntimeRequestMap, RuntimeRequestType } from './messages'
import { isRuntimeRequest, type RuntimeRequest, type RuntimeResult } from './messages'

type RequestFor<T extends RuntimeRequestType> = Extract<RuntimeRequest, { type: T }>

export type RuntimeMessageHandlers = {
  [T in RuntimeRequestType]: (request: RequestFor<T>) => Promise<RuntimeRequestMap[T]['response']>
}

export interface RuntimeMessageSender {
  tab?: { id?: number | undefined } | undefined
}

export type RuntimeMessageListener = (
  message: unknown,
  sender: RuntimeMessageSender,
  sendResponse: (response: RuntimeResult<unknown>) => void,
) => boolean | void

export function createRuntimeMessageRouter(
  handlers: RuntimeMessageHandlers,
): RuntimeMessageListener {
  return (message, _sender, sendResponse) => {
    if (!isRuntimeRequest(message)) {
      return undefined
    }

    void routeRequest(message, handlers).then(sendResponse)
    return true
  }
}

async function routeRequest(
  request: RuntimeRequest,
  handlers: RuntimeMessageHandlers,
): Promise<RuntimeResult<unknown>> {
  try {
    if (request.type === 'pending-captures:list') {
      return { ok: true, value: await handlers[request.type](request) }
    }

    return { ok: true, value: await handlers[request.type](request) }
  } catch {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The extension could not process the request.',
      },
    }
  }
}
