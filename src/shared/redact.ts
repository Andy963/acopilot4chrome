const REDACTION = '[REDACTED]'

export function redactSensitiveText(input: string, secrets: readonly string[] = []): string {
  let redacted = input
    .replace(/\bBearer\s+[^\s,"'}]+/gi, `Bearer ${REDACTION}`)
    .replace(/([?&](?:api[_-]?key|token|access[_-]?token)=)[^&#\s]*/gi, `$1${REDACTION}`)
    .replace(/("(?:api[_-]?key|token|access[_-]?token)"\s*:\s*")[^"]*(")/gi, `$1${REDACTION}$2`)

  for (const secret of secrets) {
    if (secret.length > 0) {
      redacted = redacted.split(secret).join(REDACTION)
    }
  }

  return redacted
}

export function safeErrorMessage(error: unknown, secrets: readonly string[] = []): string {
  const message = error instanceof Error ? error.message : String(error)
  return redactSensitiveText(message, secrets).slice(0, 500)
}
