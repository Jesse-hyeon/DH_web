export type AttendanceUrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export const ATTENDANCE_URL_ENV_KEY = 'VITE_ATTENDANCE_URL'

const EXAMPLE_ATTENDANCE_URL = 'http://localhost:5173/attend'
const ATTENDANCE_ROUTE_PATH = '/attend'

function configError(detail: string): string {
  return `${ATTENDANCE_URL_ENV_KEY}: ${detail} 예: ${EXAMPLE_ATTENDANCE_URL}`
}

function hasAdminTarget(url: URL): boolean {
  const pathSegments = url.pathname
    .split('/')
    .map((segment) => segment.toLocaleLowerCase('en-US'))
    .filter(Boolean)
  const searchAndHash = `${url.search}${url.hash}`.toLocaleLowerCase('en-US')

  return pathSegments.includes('admin') || searchAndHash.includes('/admin')
}

export function validateAttendanceTargetUrl(value: string | undefined): AttendanceUrlValidationResult {
  const trimmedValue = value?.trim() ?? ''

  if (trimmedValue.length === 0) {
    return {
      ok: false,
      error: configError('/attend 출석 URL을 설정해 주세요.'),
    }
  }

  let url: URL
  try {
    url = new URL(trimmedValue)
  } catch {
    return {
      ok: false,
      error: configError('절대 http(s) URL이어야 합니다.'),
    }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      error: configError('http 또는 https URL만 사용할 수 있습니다.'),
    }
  }

  if (hasAdminTarget(url)) {
    return {
      ok: false,
      error: configError('관리자 경로는 QR 대상으로 사용할 수 없습니다.'),
    }
  }

  if (url.pathname !== ATTENDANCE_ROUTE_PATH) {
    return {
      ok: false,
      error: configError('쿼리와 해시는 허용되지만 경로는 /attend여야 합니다.'),
    }
  }

  return {
    ok: true,
    url: url.toString(),
  }
}

export function getConfiguredAttendanceTargetUrl(): AttendanceUrlValidationResult {
  return validateAttendanceTargetUrl(import.meta.env.VITE_ATTENDANCE_URL)
}
