import { describe, expect, it } from 'vitest'
import {
  ADMIN_DEMO_FIXTURES,
  ADMIN_DEMO_LONG_ABSENCE_ID,
  ADMIN_DEMO_MEMBER_COUNT,
  ADMIN_DEMO_NEW_MEMBER_ID,
  ADMIN_DEMO_REFERENCE_DATE,
  createAdminDemoFixtures,
} from './demoData'

describe('admin demo fixtures', () => {
  it('are deterministic across independent generations', () => {
    const first = createAdminDemoFixtures()
    const second = createAdminDemoFixtures()

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.events.slice(0, 3)).toEqual(ADMIN_DEMO_FIXTURES.events.slice(0, 3))
  })

  it('keeps generated event identities and payloads stable', () => {
    const firstEvents = createAdminDemoFixtures().events
    const secondEvents = createAdminDemoFixtures().events

    expect(secondEvents).toEqual(firstEvents)
    expect(secondEvents.map(({ id, memberId, sessionId, date, part, weekNumber, status }) => ({
      id,
      memberId,
      sessionId,
      date,
      part,
      weekNumber,
      status,
    }))).toEqual(firstEvents)
  })

  it('contains the required member and event scale', () => {
    expect(ADMIN_DEMO_MEMBER_COUNT).toBeGreaterThanOrEqual(2_000)
    expect(ADMIN_DEMO_FIXTURES.members).toHaveLength(ADMIN_DEMO_MEMBER_COUNT)
    expect(ADMIN_DEMO_FIXTURES.events.length).toBeGreaterThanOrEqual(2_000)
  })

  it('keeps every member and session identity unique', () => {
    const memberIds = ADMIN_DEMO_FIXTURES.members.map((member) => member.id)
    const sessionIds = ADMIN_DEMO_FIXTURES.sessions.map((session) => session.id)
    const eventIds = ADMIN_DEMO_FIXTURES.events.map((event) => event.id)

    expect(new Set(memberIds).size).toBe(memberIds.length)
    expect(new Set(sessionIds).size).toBe(sessionIds.length)
    expect(new Set(eventIds).size).toBe(eventIds.length)
  })

  it('uses realistic names while keeping member identities separate', () => {
    const choices = ADMIN_DEMO_FIXTURES.members.filter((member) => member.id === 'm-001' || member.id === 'm-002')

    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'm-001', label: '김현우' }),
      expect.objectContaining({ id: 'm-002', label: '김지훈' }),
    ]))
    expect(choices[0]?.id).not.toBe(choices[1]?.id)
  })

  it('distributes the 2,000 members evenly across five 교구', () => {
    const cohortCounts = new Map<string, number>()
    for (const member of ADMIN_DEMO_FIXTURES.members) {
      cohortCounts.set(member.cohort, (cohortCounts.get(member.cohort) ?? 0) + 1)
    }

    expect([...cohortCounts.keys()].sort()).toEqual(['1교구', '2교구', '3교구', '4교구', '5교구'])
    expect([...cohortCounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, count]) => count))
      .toEqual([400, 400, 400, 400, 400])
  })

  it('covers all service parts, dates, sessions, and event statuses', () => {
    expect(new Set(ADMIN_DEMO_FIXTURES.sessions.map((session) => session.part))).toEqual(new Set([1, 2, 3]))
    expect(new Set(ADMIN_DEMO_FIXTURES.sessions.map((session) => session.date)).size).toBe(26)
    expect(ADMIN_DEMO_FIXTURES.sessions).toHaveLength(78)
    expect(new Set(ADMIN_DEMO_FIXTURES.events.map((event) => event.status))).toEqual(new Set(['attended', 'missed']))
    expect(ADMIN_DEMO_FIXTURES.events.every((event) => event.sessionId.startsWith('admin-demo-session-'))).toBe(true)
  })

  it('includes a member joined within 30 days of the fixed reference date', () => {
    const newMember = ADMIN_DEMO_FIXTURES.members.find((member) => member.id === ADMIN_DEMO_NEW_MEMBER_ID)

    expect(newMember).toEqual(expect.objectContaining({ joinedOn: '2026-08-05' }))
    expect(ADMIN_DEMO_FIXTURES.dashboard.newMemberCount).toBeGreaterThanOrEqual(1)
    expect(ADMIN_DEMO_REFERENCE_DATE).toBe('2026-08-16')
  })

  it('includes four consecutive missed weeks for the long-term absence fixture', () => {
    const missedWeeks = new Set(ADMIN_DEMO_FIXTURES.events
      .filter((event) => event.memberId === ADMIN_DEMO_LONG_ABSENCE_ID && event.status === 'missed')
      .map((event) => event.weekNumber))

    expect(missedWeeks).toEqual(new Set([23, 24, 25, 26]))
    expect(ADMIN_DEMO_FIXTURES.dashboard.longTermAbsenteeCount).toBeGreaterThanOrEqual(1)
  })

  it('exposes aggregate-friendly weekly and service summaries', () => {
    expect(ADMIN_DEMO_FIXTURES.dashboard.weeklySummaries).toHaveLength(4)
    expect(ADMIN_DEMO_FIXTURES.dashboard.serviceAverages).toHaveLength(3)
    expect(ADMIN_DEMO_FIXTURES.dashboard.weeklyAverage).toBeGreaterThan(0)
    expect(ADMIN_DEMO_FIXTURES.dashboard.serviceAverages.every((summary) => summary.eligibleCount > 0)).toBe(true)
  })

  it('contains only the documented synthetic key vocabulary and safe values', () => {
    const safeKeys = new Set([
      'referenceDate', 'dateRange', 'from', 'to', 'members', 'sessions', 'events', 'dashboard',
      'id', 'label', 'joinedOn', 'cohort', 'part', 'date', 'startsAt', 'weekNumber',
      'memberId', 'sessionId', 'status', 'memberCount', 'eventCount', 'newMemberCount',
      'longTermAbsenteeCount', 'weeklyAverage', 'serviceAverages', 'weeklySummaries',
      'attendedCount', 'eligibleCount', 'rate',
    ])

    function collectKeys(value: unknown): string[] {
      if (Array.isArray(value)) {
        return value.flatMap((item) => collectKeys(item))
      }
      if (value !== null && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, item]) => [key, ...collectKeys(item)])
      }
      return []
    }

    const serialized = JSON.stringify(ADMIN_DEMO_FIXTURES)
    const keys = collectKeys(ADMIN_DEMO_FIXTURES)

    expect(keys.every((key) => safeKeys.has(key))).toBe(true)
    expect(serialized).not.toContain('@')
    expect(serialized).not.toMatch(/01[016789][- ]?\d{3,4}[- ]?\d{4}/)
  })
})
