import type {
  AdminDemoAttendanceEvent,
  AdminDemoAggregateInput,
  AdminDemoDashboardAggregates,
  AdminDemoDate,
  AdminDemoDateRange,
  AdminDemoEventStatus,
  AdminDemoFixtureBundle,
  AdminDemoMemberProfile,
  AdminDemoServiceAverage,
  AdminDemoServiceAggregateInput,
  AdminDemoServiceSession,
  AdminDemoWeeklyAggregateInput,
  AdminDemoWeeklySummary,
} from './types'

export const ADMIN_DEMO_MEMBER_COUNT = 2_000
export const ADMIN_DEMO_REFERENCE_DATE: AdminDemoDate = '2026-08-10'
export const ADMIN_DEMO_NEW_MEMBER_ID = 'admin-demo-member-0004'
export const ADMIN_DEMO_LONG_ABSENCE_ID = 'admin-demo-member-0003'

const WEEK_NUMBERS = [1, 2, 3, 4] as const
const SERVICE_PARTS = [1, 2, 3] as const
const DAY_MS = 24 * 60 * 60 * 1_000

function parseDate(date: AdminDemoDate): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

function formatDate(date: Date): AdminDemoDate {
  return date.toISOString().slice(0, 10)
}

function addDays(date: AdminDemoDate, days: number): AdminDemoDate {
  return formatDate(new Date(parseDate(date).getTime() + days * DAY_MS))
}

function rate(attendedCount: number, eligibleCount: number): number {
  return eligibleCount === 0 ? 0 : attendedCount / eligibleCount
}

function createMembers(referenceDate: AdminDemoDate): AdminDemoMemberProfile[] {
  return Array.from({ length: ADMIN_DEMO_MEMBER_COUNT }, (_, index) => {
    const number = index + 1
    const id = `admin-demo-member-${String(number).padStart(4, '0')}`

    if (id === 'admin-demo-member-0001') {
      return { id, label: '김현우 A', joinedOn: '2024-01-07', cohort: 'Founding group' }
    }

    if (id === 'admin-demo-member-0002') {
      return { id, label: '김현우 B', joinedOn: '2024-03-18', cohort: 'Founding group' }
    }

    if (id === ADMIN_DEMO_LONG_ABSENCE_ID) {
      return { id, label: 'Synthetic long-term absence', joinedOn: '2024-02-12', cohort: 'Care group' }
    }

    if (id === ADMIN_DEMO_NEW_MEMBER_ID) {
      return { id, label: 'Synthetic new member', joinedOn: '2026-08-05', cohort: 'New group' }
    }

    const ageInDays = 45 + (number * 17) % 700
    return {
      id,
      label: `Synthetic member ${String(number).padStart(4, '0')}`,
      joinedOn: addDays(referenceDate, -ageInDays),
      cohort: number % 3 === 0 ? 'Care group' : number % 2 === 0 ? 'New group' : 'General group',
    }
  })
}

function createSessions(referenceDate: AdminDemoDate): AdminDemoServiceSession[] {
  return WEEK_NUMBERS.flatMap((weekNumber) => {
    const date = addDays(referenceDate, (weekNumber - 4) * 7)

    return SERVICE_PARTS.map((part) => ({
      id: `admin-demo-session-w${weekNumber}-p${part}`,
      part,
      date,
      startsAt: part === 1 ? '09:00' : part === 2 ? '11:00' : '14:00',
      weekNumber,
      label: `Week ${weekNumber} service ${part}`,
    }))
  })
}

function eventStatus(memberNumber: number, memberId: string, weekNumber: 1 | 2 | 3 | 4): AdminDemoEventStatus {
  if (memberId === ADMIN_DEMO_LONG_ABSENCE_ID) {
    return 'missed'
  }

  return memberNumber % 4 === weekNumber ? 'missed' : 'attended'
}

function createEvents(
  members: ReadonlyArray<AdminDemoMemberProfile>,
  sessions: ReadonlyArray<AdminDemoServiceSession>,
): AdminDemoAttendanceEvent[] {
  let eventNumber = 0

  return members.flatMap((member, memberIndex) => {
    const memberNumber = memberIndex + 1

    return sessions.flatMap((session) => {
      if (session.date < member.joinedOn) {
        return []
      }

      eventNumber += 1
      return [{
        id: `admin-demo-event-${String(eventNumber).padStart(6, '0')}`,
        memberId: member.id,
        sessionId: session.id,
        date: session.date,
        part: session.part,
        weekNumber: session.weekNumber,
        status: eventStatus(memberNumber, member.id, session.weekNumber),
      }]
    })
  })
}

function createDateRange(sessions: ReadonlyArray<AdminDemoServiceSession>): AdminDemoDateRange {
  const dates = sessions.map((session) => session.date)
  return { from: dates[0] ?? ADMIN_DEMO_REFERENCE_DATE, to: dates.at(-1) ?? ADMIN_DEMO_REFERENCE_DATE }
}

function createServiceAverage(input: AdminDemoServiceAggregateInput): AdminDemoServiceAverage {
  const partEvents = input.events.filter((event) => event.part === input.part)
  const attendedCount = partEvents.filter((event) => event.status === 'attended').length

  return {
    part: input.part,
    attendedCount,
    eligibleCount: partEvents.length,
    rate: rate(attendedCount, partEvents.length),
  }
}

function createServiceAverages(
  events: ReadonlyArray<AdminDemoAttendanceEvent>,
): AdminDemoServiceAverage[] {
  return SERVICE_PARTS.map((part) => createServiceAverage({ part, events }))
}

function createWeeklySummary(input: AdminDemoWeeklyAggregateInput): AdminDemoWeeklySummary {
  const weekEvents = input.events.filter((event) => event.weekNumber === input.weekNumber)
  const weekSessions = input.sessions.filter((session) => session.weekNumber === input.weekNumber)
  const attendedCount = weekEvents.filter((event) => event.status === 'attended').length

  return {
    weekNumber: input.weekNumber,
    dateRange: {
      from: weekSessions[0]?.date ?? ADMIN_DEMO_REFERENCE_DATE,
      to: weekSessions.at(-1)?.date ?? ADMIN_DEMO_REFERENCE_DATE,
    },
    attendedCount,
    eligibleCount: weekEvents.length,
    rate: rate(attendedCount, weekEvents.length),
  }
}

function createWeeklySummaries(
  events: ReadonlyArray<AdminDemoAttendanceEvent>,
  sessions: ReadonlyArray<AdminDemoServiceSession>,
): AdminDemoWeeklySummary[] {
  return WEEK_NUMBERS.map((weekNumber) => createWeeklySummary({ weekNumber, events, sessions }))
}

function isNewMember(member: AdminDemoMemberProfile, referenceDate: AdminDemoDate): boolean {
  const joinedTime = parseDate(member.joinedOn).getTime()
  const referenceTime = parseDate(referenceDate).getTime()
  const ageInDays = (referenceTime - joinedTime) / DAY_MS
  return ageInDays >= 0 && ageInDays <= 30
}

function createDashboard(
  input: AdminDemoAggregateInput,
): AdminDemoDashboardAggregates {
  const weeklySummaries = createWeeklySummaries(input.events, input.sessions)
  const missedWeeksByMember = new Map<string, Set<number>>()

  for (const event of input.events) {
    if (event.status !== 'missed') {
      continue
    }

    const missedWeeks = missedWeeksByMember.get(event.memberId) ?? new Set<number>()
    missedWeeks.add(event.weekNumber)
    missedWeeksByMember.set(event.memberId, missedWeeks)
  }

  return {
    memberCount: input.members.length,
    eventCount: input.events.length,
    newMemberCount: input.members.filter((member) => isNewMember(member, input.referenceDate)).length,
    longTermAbsenteeCount: input.members.filter((member) => missedWeeksByMember.get(member.id)?.size === WEEK_NUMBERS.length).length,
    weeklyAverage: weeklySummaries.reduce((total, summary) => total + summary.attendedCount, 0) / weeklySummaries.length,
    serviceAverages: createServiceAverages(input.events),
    weeklySummaries,
  }
}

export function createAdminDemoFixtures(): AdminDemoFixtureBundle {
  const referenceDate = ADMIN_DEMO_REFERENCE_DATE
  const members = createMembers(referenceDate)
  const sessions = createSessions(referenceDate)
  const events = createEvents(members, sessions)

  return {
    referenceDate,
    dateRange: createDateRange(sessions),
    members,
    sessions,
    events,
    dashboard: createDashboard({ referenceDate, members, sessions, events }),
  }
}

export const ADMIN_DEMO_FIXTURES = createAdminDemoFixtures()

export default ADMIN_DEMO_FIXTURES
