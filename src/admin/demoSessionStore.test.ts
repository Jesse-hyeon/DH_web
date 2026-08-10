import { beforeEach, describe, expect, it } from 'vitest'

import {
  createDemoSession,
  deactivateDemoSession,
  listDemoSessions,
  listDemoSubmissions,
  parseDemoSessionId,
  resetDemoSessionStore,
  resolveDemoSession,
  resolveDemoSessionState,
  submitDemoAttendance,
} from './demoSessionStore'

describe('admin demo session store', () => {
  beforeEach(() => {
    resetDemoSessionStore()
  })

  it('creates deterministic tagged sessions with the exact demo route', () => {
    const session = createDemoSession({ part: 2, date: '2026-08-10', startsAt: '11:00', tag: 'Sunday 2nd service' })

    expect(session).toMatchObject({
      id: 'admin-demo-session-0001',
      tag: 'Sunday 2nd service',
      status: 'active',
      url: '/attend?demoSessionId=admin-demo-session-0001',
    })
    expect(parseDemoSessionId('?demoSessionId=admin-demo-session-0001')).toBe(session.id)
    expect(listDemoSessions()).toEqual([session])
  })

  it('accepts active submissions, preserves duplicates, and rejects unknown sessions', () => {
    const session = createDemoSession({ part: 1, date: '2026-08-10', startsAt: '09:00' })

    const first = submitDemoAttendance({ sessionId: session.id, memberId: 'member-a' })
    const duplicate = submitDemoAttendance(session.id, 'member-a')
    const unknown = submitDemoAttendance({ sessionId: 'missing', memberId: 'member-a' })

    expect(first.accepted).toBe(true)
    expect(duplicate.accepted).toBe(true)
    expect(unknown).toEqual({ accepted: false, reason: 'invalid-session', submission: undefined })
    expect(listDemoSubmissions(session.id)).toHaveLength(2)
    expect(new Set(listDemoSubmissions(session.id).map((submission) => submission.id)).size).toBe(2)
  })

  it('deactivates without deleting history and rejects subsequent submissions', () => {
    const session = createDemoSession({ part: 3, date: '2026-08-10', startsAt: '14:00' })
    expect(submitDemoAttendance({ sessionId: session.id, memberId: 'member-a' }).accepted).toBe(true)

    expect(deactivateDemoSession(session.id)).toBe(true)
    expect(resolveDemoSession(session.id)).toMatchObject({ status: 'inactive' })
    expect(resolveDemoSessionState(session.id).status).toBe('inactive')
    expect(submitDemoAttendance({ sessionId: session.id, memberId: 'member-b' })).toEqual({
      accepted: false,
      reason: 'inactive-session',
      submission: undefined,
    })
    expect(listDemoSubmissions(session.id)).toHaveLength(1)
    expect(listDemoSessions({ activeOnly: true })).toEqual([])
  })

  it('validates creation fields and reset restores the empty fixture-only state', () => {
    expect(() => createDemoSession({ part: 4 as 1, date: '2026-08-10', startsAt: '09:00' })).toThrow()
    expect(() => createDemoSession({ part: 1, date: '2026-02-30', startsAt: '09:00' })).toThrow()
    expect(() => createDemoSession({ part: 1, date: '2026-08-10', startsAt: '9:00' })).toThrow()

    const session = createDemoSession({ part: 1, date: '2026-08-10', startsAt: '09:00' })
    expect(submitDemoAttendance({ sessionId: session.id, memberId: 'member-a' }).accepted).toBe(true)
    resetDemoSessionStore()

    expect(listDemoSessions()).toEqual([])
    expect(listDemoSubmissions()).toEqual([])
    expect(resolveDemoSessionState(undefined)).toEqual({ status: 'invalid', session: undefined })
    expect(createDemoSession({ part: 1, date: '2026-08-10', startsAt: '09:00' }).id).toBe('admin-demo-session-0001')
  })
})
