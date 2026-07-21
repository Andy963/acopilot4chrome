export type ContextKind = 'selection' | 'page'

export interface ContextItem {
  id: string
  kind: ContextKind
  title: string
  url: string
  text: string
  originalCharCount: number
  truncated: boolean
  tabId?: number
  capturedAt: number
}

export type ChatRole = 'user' | 'assistant'

export type ChatMessageStatus = 'complete' | 'streaming' | 'cancelled' | 'error'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  images?: readonly string[]
  contextItems?: readonly ContextItem[]
  createdAt: number
  status: ChatMessageStatus
}

export interface ChatSession {
  id: string
  profileId: string
  contextItems: ContextItem[]
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface PendingCapture {
  id: string
  context: ContextItem
  createdAt: number
}
