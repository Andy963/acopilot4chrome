import type { AgentProfile } from '../agent/adapter'

export interface PermissionsApi {
  contains(permissions: { origins: string[] }): Promise<boolean>
  request(permissions: { origins: string[] }): Promise<boolean>
  remove(permissions: { origins: string[] }): Promise<boolean>
}

export type EndpointPermissionErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'PERMISSION_DENIED'

export interface EndpointPermissionError {
  code: EndpointPermissionErrorCode
  message: string
}

export type EndpointPermissionResult =
  | { ok: true; originPattern: string; alreadyGranted: boolean }
  | { ok: false; error: EndpointPermissionError }

export type EndpointPermissionRemovalResult =
  | { ok: true; originPattern: string; removed: boolean; inUse: boolean }
  | { ok: false; error: EndpointPermissionError }

export function getEndpointOriginPattern(baseUrl: string): EndpointPermissionResult {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return failure('INVALID_URL', 'The endpoint URL is invalid.')
  }

  if (url.username !== '' || url.password !== '') {
    return failure('INVALID_URL', 'The endpoint URL must not contain credentials.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return failure('UNSUPPORTED_PROTOCOL', 'The endpoint must use HTTP or HTTPS.')
  }

  return { ok: true, originPattern: `${url.origin}/*`, alreadyGranted: false }
}

export async function ensureEndpointPermission(
  baseUrl: string,
  permissions: PermissionsApi,
): Promise<EndpointPermissionResult> {
  const parsed = getEndpointOriginPattern(baseUrl)
  if (!parsed.ok) {
    return parsed
  }

  try {
    if (await permissions.contains({ origins: [parsed.originPattern] })) {
      return { ...parsed, alreadyGranted: true }
    }

    const granted = await permissions.request({ origins: [parsed.originPattern] })
    if (!granted) {
      return failure('PERMISSION_DENIED', 'Permission to access the endpoint was denied.')
    }

    return parsed
  } catch {
    return failure('PERMISSION_DENIED', 'Permission to access the endpoint could not be granted.')
  }
}

export async function removeEndpointPermissionIfUnused(
  baseUrl: string,
  remainingProfiles: readonly Pick<AgentProfile, 'baseUrl'>[],
  permissions: PermissionsApi,
): Promise<EndpointPermissionRemovalResult> {
  const parsed = getEndpointOriginPattern(baseUrl)
  if (!parsed.ok) {
    return parsed
  }

  const inUse = remainingProfiles.some((profile) => {
    const candidate = getEndpointOriginPattern(profile.baseUrl)
    return candidate.ok && candidate.originPattern === parsed.originPattern
  })
  if (inUse) {
    return {
      ok: true,
      originPattern: parsed.originPattern,
      removed: false,
      inUse: true,
    }
  }

  try {
    const removed = await permissions.remove({ origins: [parsed.originPattern] })
    return {
      ok: true,
      originPattern: parsed.originPattern,
      removed,
      inUse: false,
    }
  } catch {
    return failure('PERMISSION_DENIED', 'Permission to access the endpoint could not be removed.')
  }
}

function failure(
  code: EndpointPermissionErrorCode,
  message: string,
): { ok: false; error: EndpointPermissionError } {
  return { ok: false, error: { code, message } }
}
