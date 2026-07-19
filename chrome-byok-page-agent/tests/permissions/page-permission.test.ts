import { describe, expect, it, vi } from 'vitest'

import { ensurePagePermission, getPageOriginPattern } from '../../src/permissions/page-permission'

describe('page permissions', () => {
  it.each([
    'chrome://settings/',
    'chrome-extension://extension-id/page.html',
    'https://chromewebstore.google.com/detail/example/id',
    'https://example.com/file.pdf',
  ])('rejects unsupported page %s', (url) => {
    expect(getPageOriginPattern(url)).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_PAGE' },
    })
  })

  it('returns a deterministic permission denial', async () => {
    const result = await ensurePagePermission('https://example.com/article', {
      contains: vi.fn().mockResolvedValue(false),
      request: vi.fn().mockResolvedValue(false),
      remove: vi.fn(),
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: 'Permission to access this page was denied.',
      },
    })
  })

  it('requires the user-controlled file scheme toggle', async () => {
    const result = await ensurePagePermission(
      'file:///tmp/article.html',
      { contains: vi.fn(), request: vi.fn(), remove: vi.fn() },
      { isAllowedFileSchemeAccess: vi.fn().mockResolvedValue(false) },
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'FILE_ACCESS_DENIED' },
    })
  })
})
