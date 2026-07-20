import { describe, expect, it, vi } from 'vitest'

import {
  ensureEndpointPermission,
  getEndpointOriginPattern,
  removeEndpointPermissionIfUnused,
  type PermissionsApi,
} from '../../src/permissions/endpoint-permission'

describe('endpoint permissions', () => {
  it('normalizes an endpoint to one optional origin pattern', () => {
    expect(getEndpointOriginPattern('https://Example.com:8443/v1')).toEqual({
      ok: true,
      originPattern: 'https://example.com:8443/*',
      alreadyGranted: false,
    })
  })

  it('allows HTTP and HTTPS endpoints, rejects other protocols', () => {
    expect(getEndpointOriginPattern('http://127.0.0.1:8080/v1').ok).toBe(true)
    expect(getEndpointOriginPattern('http://llm-server:8080/v1').ok).toBe(true)
    expect(getEndpointOriginPattern('http://example.com/v1').ok).toBe(true)
    expect(getEndpointOriginPattern('https://example.com/v1').ok).toBe(true)
    expect(getEndpointOriginPattern('ftp://example.com/v1')).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_PROTOCOL' },
    })
  })

  it('does not prompt again when the permission is already granted', async () => {
    const permissions = permissionApi(true, false)

    const result = await ensureEndpointPermission('https://example.com/v1', permissions)

    expect(result).toMatchObject({ ok: true, alreadyGranted: true })
    expect(permissions.request).not.toHaveBeenCalled()
  })

  it('returns a deterministic denial', async () => {
    const result = await ensureEndpointPermission(
      'https://example.com/v1',
      permissionApi(false, false),
    )

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: 'Permission to access the endpoint was denied.',
      },
    })
  })

  it('does not revoke an origin still used by another profile', async () => {
    const permissions = permissionApi(true, true)

    const result = await removeEndpointPermissionIfUnused(
      'https://example.com/v1',
      [{ baseUrl: 'https://example.com/other' }],
      permissions,
    )

    expect(result).toMatchObject({ ok: true, removed: false, inUse: true })
    expect(permissions.remove).not.toHaveBeenCalled()
  })
})

function permissionApi(contains: boolean, request: boolean): PermissionsApi {
  return {
    contains: vi.fn().mockResolvedValue(contains),
    request: vi.fn().mockResolvedValue(request),
    remove: vi.fn().mockResolvedValue(true),
  }
}
