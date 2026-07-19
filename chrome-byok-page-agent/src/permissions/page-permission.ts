import type { PermissionsApi } from './endpoint-permission'

export interface FileSchemeAccessApi {
  isAllowedFileSchemeAccess(): Promise<boolean>
}

export type PagePermissionErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PAGE'
  | 'FILE_ACCESS_DENIED'
  | 'PERMISSION_DENIED'

export interface PagePermissionError {
  code: PagePermissionErrorCode
  message: string
}

export type PagePermissionResult =
  | { ok: true; originPattern: string; alreadyGranted: boolean }
  | { ok: false; error: PagePermissionError }

export function getPageOriginPattern(pageUrl: string): PagePermissionResult {
  let url: URL
  try {
    url = new URL(pageUrl)
  } catch {
    return failure('INVALID_URL', 'The page URL is invalid.')
  }

  if (url.protocol === 'file:') {
    return { ok: true, originPattern: 'file:///*', alreadyGranted: false }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return failure('UNSUPPORTED_PAGE', 'This browser page cannot be captured.')
  }

  if (isChromeWebStore(url) || isPdfUrl(url)) {
    return failure('UNSUPPORTED_PAGE', 'This browser page cannot be captured.')
  }

  return { ok: true, originPattern: `${url.origin}/*`, alreadyGranted: false }
}

export async function ensurePagePermission(
  pageUrl: string,
  permissions: PermissionsApi,
  fileSchemeAccess?: FileSchemeAccessApi,
): Promise<PagePermissionResult> {
  const parsed = getPageOriginPattern(pageUrl)
  if (!parsed.ok) {
    return parsed
  }

  if (parsed.originPattern === 'file:///*') {
    if (fileSchemeAccess === undefined || !(await fileSchemeAccess.isAllowedFileSchemeAccess())) {
      return failure('FILE_ACCESS_DENIED', 'File page access is disabled for this extension.')
    }

    return { ...parsed, alreadyGranted: true }
  }

  try {
    if (await permissions.contains({ origins: [parsed.originPattern] })) {
      return { ...parsed, alreadyGranted: true }
    }

    const granted = await permissions.request({ origins: [parsed.originPattern] })
    if (!granted) {
      return failure('PERMISSION_DENIED', 'Permission to access this page was denied.')
    }

    return parsed
  } catch {
    return failure('PERMISSION_DENIED', 'Permission to access this page could not be granted.')
  }
}

export function isSupportedPageUrl(pageUrl: string): boolean {
  return getPageOriginPattern(pageUrl).ok
}

function isChromeWebStore(url: URL): boolean {
  return (
    url.hostname === 'chromewebstore.google.com' ||
    (url.hostname === 'chrome.google.com' && url.pathname.toLowerCase().startsWith('/webstore'))
  )
}

function isPdfUrl(url: URL): boolean {
  return url.pathname.toLowerCase().endsWith('.pdf')
}

function failure(
  code: PagePermissionErrorCode,
  message: string,
): { ok: false; error: PagePermissionError } {
  return { ok: false, error: { code, message } }
}
