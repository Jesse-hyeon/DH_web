import type {
  AdminDemoAttendanceEvent,
  AdminDemoAggregateInput,
  AdminDemoDashboardAggregates,
  AdminDemoDate,
  AdminDemoDateRange,
  AdminDemoEventStatus,
  AdminDemoFixtureBundle,
  AdminDemoMemberProfile,
  AdminDemoServicePart,
  AdminDemoServiceAverage,
  AdminDemoServiceAggregateInput,
  AdminDemoServiceSession,
  AdminDemoWeeklyAggregateInput,
  AdminDemoWeeklySummary,
} from './types'
import { members as registeredMembers } from '../data/members'

export const ADMIN_DEMO_MEMBER_COUNT = 2_000
export const ADMIN_DEMO_REFERENCE_DATE: AdminDemoDate = '2026-08-16'
export const ADMIN_DEMO_NEW_MEMBER_ID = 'm-004'
export const ADMIN_DEMO_LONG_ABSENCE_ID = 'm-003'

const WEEK_NUMBERS = Array.from({ length: 26 }, (_, index) => index + 1)
const RECENT_WEEK_NUMBERS = WEEK_NUMBERS.slice(-4)
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
  return registeredMembers.slice(0, ADMIN_DEMO_MEMBER_COUNT).map((member, index) => {
    const number = index + 1
    const id = member.memberId
    const cohort = member.cohort ?? `${((number * 37 + 11) % 5) + 1}교구`
    const label = member.displayLabel

    if (id === 'm-001') return { id, label, joinedOn: '2024-01-07', cohort }
    if (id === 'm-002') return { id, label, joinedOn: '2024-03-18', cohort }
    if (id === ADMIN_DEMO_LONG_ABSENCE_ID) return { id, label, joinedOn: '2024-02-12', cohort }
    if (id === ADMIN_DEMO_NEW_MEMBER_ID) return { id, label, joinedOn: '2026-08-05', cohort }

    const ageInDays = 45 + (number * 17) % 700
    return {
      id,
      label,
      joinedOn: addDays(referenceDate, -ageInDays),
      cohort,
    }
  })
}

function createSessions(referenceDate: AdminDemoDate): AdminDemoServiceSession[] {
  return WEEK_NUMBERS.flatMap((weekNumber) => {
    const date = addDays(referenceDate, (weekNumber - WEEK_NUMBERS.length) * 7)

    return SERVICE_PARTS.map((part) => ({
      id: `admin-demo-session-w${weekNumber}-p${part}`,
      part,
      date,
      startsAt: part === 1 ? '07:30' : part === 2 ? '09:30' : '11:30',
      weekNumber,
      label: `Week ${weekNumber} service ${part}`,
    }))
  })
}

function eventStatus(
  memberNumber: number,
  memberId: string,
  weekNumber: number,
  part: AdminDemoServicePart,
): AdminDemoEventStatus {
  if (weekNumber === WEEK_NUMBERS.length) {
    return 'missed'
  }

  if (memberId === ADMIN_DEMO_LONG_ABSENCE_ID) {
    return weekNumber > WEEK_NUMBERS.length - 4 ? 'missed' : 'attended'
  }

  const regularAbsence = memberNumber % 4 === weekNumber
  const partSpecificAbsence = part === 1
    ? memberNumber % 10 === weekNumber % 10
    : part === 2
      ? memberNumber % 20 === weekNumber % 20
      : false

  return regularAbsence || partSpecificAbsence ? 'missed' : 'attended'
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
        status: eventStatus(memberNumber, member.id, session.weekNumber, session.part),
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
  return RECENT_WEEK_NUMBERS.map((weekNumber) => createWeeklySummary({ weekNumber, events, sessions }))
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
    longTermAbsenteeCount: input.members.filter((member) => missedWeeksByMember.get(member.id)?.size === RECENT_WEEK_NUMBERS.length).length,
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
