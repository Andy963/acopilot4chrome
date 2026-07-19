import { normalizeWhitespace } from './normalize'
import { truncateText, type TruncatedText } from './truncate'

export function extractSelection(
  selection: Selection | null = globalThis.getSelection?.() ?? null,
): string {
  return selection?.toString() ?? ''
}

export function prepareSelectionText(text: string, maxChars: number): TruncatedText {
  return truncateText(normalizeWhitespace(text), maxChars)
}
