import { describe, expect, it } from 'vitest'

import {
  parseAttendanceServicePart,
  parseAttendanceServiceDate,
  validateAttendanceTargetUrl,
  withAttendanceSession,
} from './attendanceUrl'

describe('attendance URL validation', () => {
  it('accepts http attendance URLs with optional query and hash', () => {
    expect(validateAttendanceTargetUrl(' http://localhost:5173/attend?source=monitor#front ')).toEqual({
      ok: true,
      url: 'http://localhost:5173/attend?source=monitor#front',
    })
  })

  it('rejects missing, non-http, admin, and non-attend targets', () => {
    expect(validateAttendanceTargetUrl(undefined)).toMatchObject({
      ok: false,
      error: expect.stringContaining('VITE_ATTENDANCE_URL'),
    })
    expect(validateAttendanceTargetUrl('mailto:demo@example.test')).toMatchObject({
      ok: false,
      error: expect.stringContaining('http 또는 https'),
    })
    expect(validateAttendanceTargetUrl('http://localhost:5173/admin')).toMatchObject({
      ok: false,
      error: expect.stringContaining('관리자 경로'),
    })
    expect(validateAttendanceTargetUrl('http://localhost:5173/attend/admin')).toMatchObject({
      ok: false,
      error: expect.stringContaining('관리자 경로'),
    })
    expect(validateAttendanceTargetUrl('http://localhost:5173/check-in')).toMatchObject({
      ok: false,
      error: expect.stringContaining('/attend'),
    })
    expect(validateAttendanceTargetUrl('http://localhost:5173/notattend')).toMatchObject({
      ok: false,
      error: expect.stringContaining('/attend'),
    })
  })

  it('adds and parses the service part without losing existing query values', () => {
    expect(withAttendanceSession('https://example.test/attend?source=qr', '2026-08-16', 2))
      .toBe('https://example.test/attend?source=qr&serviceDate=2026-08-16&servicePart=2')
    expect(parseAttendanceServiceDate('?serviceDate=2026-08-16&servicePart=3')).toBe('2026-08-16')
    expect(parseAttendanceServiceDate('?serviceDate=2026-02-30')).toBeUndefined()
    expect(parseAttendanceServicePart('?source=qr&servicePart=3')).toBe(3)
    expect(parseAttendanceServicePart('?servicePart=4')).toBeUndefined()
  })
})
