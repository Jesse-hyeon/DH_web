import type { ServiceKey, ServicePart } from '../domain/types'

export type AttendanceUrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export const ATTENDANCE_URL_ENV_KEY = 'VITE_ATTENDANCE_URL'

const EXAMPLE_ATTENDANCE_URL = 'http://localhost:5173/attend'
const ATTENDANCE_ROUTE_PATH = '/attend'
const SERVICE_DATE_QUERY_KEY = 'serviceDate'
const SERVICE_PART_QUERY_KEY = 'servicePart'
const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase('en-US')
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '[::1]'
    || normalized === '::1'
}

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

/**
 * Keep local development QR codes scannable when the app is opened through a
 * LAN address but the env file still contains the usual localhost example.
 */
export function getAttendanceTargetUrlForCurrentBrowser(): AttendanceUrlValidationResult {
  const configured = getConfiguredAttendanceTargetUrl()

  if (!configured.ok || typeof window === 'undefined') {
    return configured
  }

  const configuredUrl = new URL(configured.url)
  if (!isLoopbackHostname(configuredUrl.hostname) || isLoopbackHostname(window.location.hostname)) {
    return configured
  }

  return validateAttendanceTargetUrl(new URL(ATTENDANCE_ROUTE_PATH, window.location.origin).toString())
}

export function withAttendanceSession(
  url: string,
  serviceDate: ServiceKey,
  servicePart: ServicePart,
): string {
  const target = new URL(url)
  target.searchParams.set(SERVICE_DATE_QUERY_KEY, serviceDate)
  target.searchParams.set(SERVICE_PART_QUERY_KEY, String(servicePart))
  return target.toString()
}

export function parseAttendanceServiceDate(search: string): ServiceKey | undefined {
  const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    .get(SERVICE_DATE_QUERY_KEY)

  if (!value || !SERVICE_DATE_PATTERN.test(value)) {
    return undefined
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined
}

export function parseAttendanceServicePart(search: string): ServicePart | undefined {
  const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    .get(SERVICE_PART_QUERY_KEY)

  return value === '1' || value === '2' || value === '3'
    ? Number(value) as ServicePart
    : undefined
}
