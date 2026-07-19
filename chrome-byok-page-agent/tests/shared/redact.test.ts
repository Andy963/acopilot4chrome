import { describe, expect, it } from 'vitest'

import { redactSensitiveText, safeErrorMessage } from '../../src/shared/redact'

describe('redactSensitiveText', () => {
  it('redacts authorization values, query credentials, JSON credentials, and explicit secrets', () => {
    const secret = 'sk-sensitive-value'
    const input = `Authorization: Bearer ${secret} ?api_key=${secret} {"token":"${secret}"}`
    const result = redactSensitiveText(input, [secret])

    expect(result).not.toContain(secret)
    expect(result).toContain('[REDACTED]')
  })

  it('bounds sanitized error messages', () => {
    expect(safeErrorMessage(new Error('x'.repeat(1_000)))).toHaveLength(500)
  })
})
