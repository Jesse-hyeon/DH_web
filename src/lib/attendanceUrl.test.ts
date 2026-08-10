import { describe, expect, it } from 'vitest'

import { validateAttendanceTargetUrl } from './attendanceUrl'

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
})
