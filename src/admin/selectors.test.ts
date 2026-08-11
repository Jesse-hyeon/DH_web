import { describe, expect, it } from 'vitest'

import { ADMIN_DEMO_FIXTURES, ADMIN_DEMO_LONG_ABSENCE_ID, ADMIN_DEMO_NEW_MEMBER_ID } from './demoData'
import {
  selectAttendanceRows,
  selectDashboardAggregates,
  selectFilteredEvents,
  selectLongTermAbsentees,
  selectMemberHistory,
  selectNewMembers,
  selectPeriodDateRange,
  selectServiceAverages,
  selectSessionParticipantCount,
  selectWeeklySummaries,
} from './selectors'

describe('admin demo selectors', () => {
  it('derives the dashboard metrics from the same pure fixture input', () => {
    const dashboard = selectDashboardAggregates(ADMIN_DEMO_FIXTURES)

    expect(dashboard.memberCount).toBe(ADMIN_DEMO_FIXTURES.members.length)
    expect(dashboard.eventCount).toBe(ADMIN_DEMO_FIXTURES.events.length)
    expect(selectNewMembers(ADMIN_DEMO_FIXTURES).map((member) => member.id)).toContain(ADMIN_DEMO_NEW_MEMBER_ID)
    expect(selectLongTermAbsentees(ADMIN_DEMO_FIXTURES).map((member) => member.id)).toContain(ADMIN_DEMO_LONG_ABSENCE_ID)
    expect(selectServiceAverages(ADMIN_DEMO_FIXTURES)).toHaveLength(3)
    expect(selectWeeklySummaries(ADMIN_DEMO_FIXTURES)).toHaveLength(4)
  })

  it('uses inclusive current-month and six-calendar-month boundaries', () => {
    const currentMonth = selectPeriodDateRange(ADMIN_DEMO_FIXTURES, 'current-month')
    const lastSixMonths = selectPeriodDateRange(ADMIN_DEMO_FIXTURES, 'last-6-months')

    expect(currentMonth).toEqual({ from: '2026-08-01', to: '2026-08-16' })
    expect(lastSixMonths).toEqual({ from: '2026-03-01', to: '2026-08-16' })
    expect(selectFilteredEvents(ADMIN_DEMO_FIXTURES, { dateRange: { from: '2026-08-09', to: '2026-08-09' } })
      .every((event) => event.date === '2026-08-09')).toBe(true)
  })

  it('applies service-part filters to event denominators and member rows', () => {
    const partTwoEvents = selectFilteredEvents(ADMIN_DEMO_FIXTURES, { period: 'all', servicePart: 2 })
    const partTwoRows = selectAttendanceRows(ADMIN_DEMO_FIXTURES, { period: 'all', servicePart: 2 })

    expect(partTwoEvents.length).toBeGreaterThan(0)
    expect(partTwoEvents.every((event) => event.part === 2)).toBe(true)
    expect(partTwoRows.every((row) => row.events.every((event) => event.part === 2))).toBe(true)
    expect(partTwoRows.every((row) => row.rate === row.attendedCount / row.eligibleCount)).toBe(true)
  })

  it('rejects removed filter aliases instead of silently changing the aggregation', () => {
    expect(() => selectPeriodDateRange(ADMIN_DEMO_FIXTURES, 'this-month' as never))
      .toThrow('Unsupported admin period')
    expect(() => selectFilteredEvents(ADMIN_DEMO_FIXTURES, {
      period: 'this-month',
      dateRange: { from: '2026-08-09', to: '2026-08-09' },
    } as never)).toThrow('Unsupported admin period')
    expect(() => selectFilteredEvents(ADMIN_DEMO_FIXTURES, { part: 2 } as never))
      .toThrow('Use servicePart instead of the removed part filter')
  })

  it('preserves distinct member history and session participant totals', () => {
    const memberAHistory = selectMemberHistory(ADMIN_DEMO_FIXTURES, 'm-001')
    const memberBHistory = selectMemberHistory(ADMIN_DEMO_FIXTURES, 'm-002')
    const firstSession = ADMIN_DEMO_FIXTURES.sessions[0]

    expect(memberAHistory.length).toBeGreaterThan(0)
    expect(memberBHistory.length).toBeGreaterThan(0)
    expect(memberAHistory.every((event) => event.memberId === 'm-001')).toBe(true)
    expect(memberBHistory.every((event) => event.memberId === 'm-002')).toBe(true)
    expect(selectSessionParticipantCount(ADMIN_DEMO_FIXTURES, firstSession?.id ?? '')).toBeGreaterThan(0)
  })
})
