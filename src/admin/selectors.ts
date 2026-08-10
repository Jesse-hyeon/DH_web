import type {
  AdminDemoAggregateInput,
  AdminDemoAttendanceEvent,
  AdminDemoDashboardAggregates,
  AdminDemoDate,
  AdminDemoDateRange,
  AdminDemoEventStatus,
  AdminDemoMemberProfile,
  AdminDemoServiceAverage,
  AdminDemoServicePart,
  AdminDemoServiceSession,
  AdminDemoWeeklySummary,
} from './types'

const SERVICE_PARTS = [1, 2, 3] as const
const RECENT_WEEK_COUNT = 4
const DAY_MS = 24 * 60 * 60 * 1_000
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type AdminDemoPeriod =
  | 'last-4-weeks'
  | 'last-3-months'
  | 'current-month'
  | 'last-6-months'
  | 'all'
  // Friendly aliases accepted by callers that use the labels from the UI.
  | 'this-month'
  | 'last-6-month'

export type AdminDemoServicePartFilter = AdminDemoServicePart | 'all'

export interface AdminDemoFilterOptions {
  period?: AdminDemoPeriod
  servicePart?: AdminDemoServicePartFilter
  part?: AdminDemoServicePartFilter
  dateRange?: AdminDemoDateRange
}

function recentWeekNumbers(input: AdminDemoAggregateInput): number[] {
  return [...new Set(input.sessions.map((session) => session.weekNumber))]
    .sort((a, b) => a - b)
    .slice(-RECENT_WEEK_COUNT)
}

export interface AdminDemoAttendanceRow {
  member: AdminDemoMemberProfile
  events: ReadonlyArray<AdminDemoAttendanceEvent>
  attendedCount: number
  eligibleCount: number
  rate: number
  /** Alias useful to table consumers that call the metric an attendance rate. */
  attendanceRate: number
}

export interface AdminDemoMemberHistory {
  member: AdminDemoMemberProfile | undefined
  events: ReadonlyArray<AdminDemoAttendanceEvent>
  attendedCount: number
  eligibleCount: number
  rate: number
}

export interface AdminDemoSessionTotal {
  session: AdminDemoServiceSession
  /** Number of members marked attended for this session. */
  participantCount: number
  attendedCount: number
  missedCount: number
  /** Number of eligible event records, including missed records. */
  eligibleCount: number
  rate: number
}

function parseDate(date: AdminDemoDate): Date {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new RangeError(`Invalid admin demo date: ${date}`)
  }

  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid admin demo date: ${date}`)
  }

  return parsed
}

function formatDate(date: Date): AdminDemoDate {
  return date.toISOString().slice(0, 10)
}

function addDays(date: AdminDemoDate, days: number): AdminDemoDate {
  return formatDate(new Date(parseDate(date).getTime() + days * DAY_MS))
}

function addMonths(date: AdminDemoDate, months: number): AdminDemoDate {
  const parsed = parseDate(date)
  parsed.setUTCDate(1)
  parsed.setUTCMonth(parsed.getUTCMonth() + months)
  return formatDate(parsed)
}

function monthStart(date: AdminDemoDate): AdminDemoDate {
  return addMonths(date, 0)
}

function canonicalPeriod(period: AdminDemoPeriod): Exclude<AdminDemoPeriod, 'this-month' | 'last-6-month'> {
  if (period === 'this-month') {
    return 'current-month'
  }
  if (period === 'last-6-month') {
    return 'last-6-months'
  }
  return period
}

function isServicePart(value: AdminDemoServicePartFilter | undefined): value is AdminDemoServicePart {
  return value === 1 || value === 2 || value === 3
}

function selectedPart(options: AdminDemoFilterOptions): AdminDemoServicePart | undefined {
  const value = options.servicePart ?? options.part
  return isServicePart(value) ? value : undefined
}

function minDate(dates: ReadonlyArray<AdminDemoDate>, fallback: AdminDemoDate): AdminDemoDate {
  return dates.length === 0 ? fallback : dates.reduce((minimum, date) => (date < minimum ? date : minimum), dates[0] ?? fallback)
}

function maxDate(dates: ReadonlyArray<AdminDemoDate>, fallback: AdminDemoDate): AdminDemoDate {
  return dates.length === 0 ? fallback : dates.reduce((maximum, date) => (date > maximum ? date : maximum), dates[0] ?? fallback)
}

function allDataDateRange(input: AdminDemoAggregateInput): AdminDemoDateRange {
  const dates = [
    ...input.sessions.map((session) => session.date),
    ...input.events.map((event) => event.date),
  ]

  return {
    from: minDate(dates, input.referenceDate),
    to: maxDate(dates, input.referenceDate),
  }
}

/** Returns the date window used by a dashboard or attendance-management period. */
export function selectPeriodDateRange(
  input: AdminDemoAggregateInput,
  period: AdminDemoPeriod = 'all',
): AdminDemoDateRange {
  const canonical = canonicalPeriod(period)

  if (canonical === 'all') {
    return allDataDateRange(input)
  }

  if (canonical === 'current-month') {
    return { from: monthStart(input.referenceDate), to: input.referenceDate }
  }

  if (canonical === 'last-4-weeks') {
    return { from: addDays(input.referenceDate, -27), to: input.referenceDate }
  }

  if (canonical === 'last-3-months') {
    return { from: addMonths(input.referenceDate, -2), to: input.referenceDate }
  }

  // Six calendar months means the current month plus the five preceding months.
  return { from: addMonths(input.referenceDate, -5), to: input.referenceDate }
}

export const getPeriodDateRange = selectPeriodDateRange

function weekNumbersInRange(input: AdminDemoAggregateInput, range: AdminDemoDateRange): number[] {
  return [...new Set([
    ...input.sessions.filter((session) => isDateInRange(session.date, range)).map((session) => session.weekNumber),
    ...input.events.filter((event) => isDateInRange(event.date, range)).map((event) => event.weekNumber),
  ])].sort((a, b) => a - b)
}

/** Date comparisons are string-safe because all admin dates are normalized ISO dates. */
export function isDateInRange(date: AdminDemoDate, range: AdminDemoDateRange): boolean {
  return date >= range.from && date <= range.to
}

export function attendanceRate(attendedCount: number, eligibleCount: number): number {
  return eligibleCount === 0 ? 0 : attendedCount / eligibleCount
}

export const calculateAttendanceRate = attendanceRate

function eventsForOptions(
  input: AdminDemoAggregateInput,
  options: AdminDemoFilterOptions = {},
): AdminDemoAttendanceEvent[] {
  const range = options.dateRange ?? selectPeriodDateRange(input, options.period ?? 'all')
  const part = selectedPart(options)

  return input.events.filter((event) => (
    isDateInRange(event.date, range)
    && (part === undefined || event.part === part)
  ))
}

/** Applies the selected period and service-part filters without mutating fixture data. */
export function selectFilteredEvents(
  input: AdminDemoAggregateInput,
  options: AdminDemoFilterOptions = {},
): ReadonlyArray<AdminDemoAttendanceEvent> {
  return eventsForOptions(input, options)
}

export const filterAttendanceEvents = selectFilteredEvents

function countStatus(events: ReadonlyArray<AdminDemoAttendanceEvent>, status: AdminDemoEventStatus): number {
  return events.filter((event) => event.status === status).length
}

function preferEarlierAttendance(
  current: AdminDemoAttendanceEvent | undefined,
  candidate: AdminDemoAttendanceEvent,
): AdminDemoAttendanceEvent {
  if (!current) {
    return candidate
  }
  if (candidate.status === 'attended' && current.status !== 'attended') {
    return candidate
  }
  if (candidate.status === current.status && candidate.part < current.part) {
    return candidate
  }
  return current
}

/** Keeps one result per member/date; the first attended service is the one that counts. */
function uniqueMemberDateEvents(events: ReadonlyArray<AdminDemoAttendanceEvent>): AdminDemoAttendanceEvent[] {
  const eventsByMemberDate = new Map<string, AdminDemoAttendanceEvent>()
  for (const event of events) {
    const key = `${event.memberId}:${event.date}`
    eventsByMemberDate.set(key, preferEarlierAttendance(eventsByMemberDate.get(key), event))
  }
  return [...eventsByMemberDate.values()]
}

export function selectNewMembers(input: AdminDemoAggregateInput): ReadonlyArray<AdminDemoMemberProfile> {
  const referenceTime = parseDate(input.referenceDate).getTime()

  return input.members.filter((member) => {
    const ageInDays = (referenceTime - parseDate(member.joinedOn).getTime()) / DAY_MS
    return ageInDays >= 0 && ageInDays <= 30
  })
}

export function selectLongTermAbsentees(input: AdminDemoAggregateInput): ReadonlyArray<AdminDemoMemberProfile> {
  const missedWeeksByMember = new Map<string, Set<number>>()

  for (const event of input.events) {
    if (event.status !== 'missed') {
      continue
    }

    const weeks = missedWeeksByMember.get(event.memberId) ?? new Set<number>()
    weeks.add(event.weekNumber)
    missedWeeksByMember.set(event.memberId, weeks)
  }

  return input.members.filter((member) => (
    recentWeekNumbers(input).every((weekNumber) => missedWeeksByMember.get(member.id)?.has(weekNumber) === true)
  ))
}

export function selectServiceAverages(
  input: AdminDemoAggregateInput,
  options: AdminDemoFilterOptions = {},
): ReadonlyArray<AdminDemoServiceAverage> {
  const events = eventsForOptions(input, options)

  return SERVICE_PARTS.map((part) => {
    const partEvents = events.filter((event) => event.part === part)
    const attendedCount = countStatus(partEvents, 'attended')

    return {
      part,
      attendedCount,
      eligibleCount: partEvents.length,
      rate: attendanceRate(attendedCount, partEvents.length),
    }
  })
}

export function selectWeeklySummaries(
  input: AdminDemoAggregateInput,
  options: AdminDemoFilterOptions = {},
): ReadonlyArray<AdminDemoWeeklySummary> {
  const events = eventsForOptions(input, options)
  const range = options.dateRange ?? selectPeriodDateRange(input, options.period ?? 'all')
  const part = selectedPart(options)

  return recentWeekNumbers(input).map((weekNumber) => {
    const weekEvents = events.filter((event) => event.weekNumber === weekNumber)
    const weekSessions = input.sessions.filter((session) => (
      session.weekNumber === weekNumber
      && isDateInRange(session.date, range)
      && (part === undefined || session.part === part)
    ))
    const dates = [
      ...weekSessions.map((session) => session.date),
      ...weekEvents.map((event) => event.date),
    ]
    const attendedCount = countStatus(weekEvents, 'attended')

    return {
      weekNumber,
      dateRange: {
        from: minDate(dates, input.referenceDate),
        to: maxDate(dates, input.referenceDate),
      },
      attendedCount,
      eligibleCount: weekEvents.length,
      rate: attendanceRate(attendedCount, weekEvents.length),
    }
  })
}

/** Returns one weekly summary for each week represented in the requested date range. */
export function selectWeeklySummariesInRange(
  input: AdminDemoAggregateInput,
  range: AdminDemoDateRange,
): ReadonlyArray<AdminDemoWeeklySummary> {
  const events = eventsForOptions(input, { dateRange: range })

  return weekNumbersInRange(input, range).map((weekNumber) => {
    const weekEvents = events.filter((event) => event.weekNumber === weekNumber)
    const weekSessions = input.sessions.filter((session) => (
      session.weekNumber === weekNumber && isDateInRange(session.date, range)
    ))
    const dates = [
      ...weekSessions.map((session) => session.date),
      ...weekEvents.map((event) => event.date),
    ]
    const attendedCount = countStatus(weekEvents, 'attended')

    return {
      weekNumber,
      dateRange: {
        from: minDate(dates, input.referenceDate),
        to: maxDate(dates, input.referenceDate),
      },
      attendedCount,
      eligibleCount: weekEvents.length,
      rate: attendanceRate(attendedCount, weekEvents.length),
    }
  })
}

export function selectDashboardAggregates(input: AdminDemoAggregateInput): AdminDemoDashboardAggregates {
  const weeklySummaries = selectWeeklySummaries(input)

  return {
    memberCount: input.members.length,
    eventCount: input.events.length,
    newMemberCount: selectNewMembers(input).length,
    longTermAbsenteeCount: selectLongTermAbsentees(input).length,
    weeklyAverage: weeklySummaries.length === 0
      ? 0
      : weeklySummaries.reduce((total, summary) => total + summary.attendedCount, 0) / weeklySummaries.length,
    serviceAverages: selectServiceAverages(input),
    weeklySummaries,
  }
}

export const selectDashboardMetrics = selectDashboardAggregates

/** Returns one row per member with at least one eligible event in the selected window. */
export function selectAttendanceRows(
  input: AdminDemoAggregateInput,
  options: AdminDemoFilterOptions = {},
): ReadonlyArray<AdminDemoAttendanceRow> {
  const events = uniqueMemberDateEvents(eventsForOptions(input, options))
  const eventsByMember = new Map<string, AdminDemoAttendanceEvent[]>()

  for (const event of events) {
    const memberEvents = eventsByMember.get(event.memberId) ?? []
    memberEvents.push(event)
    eventsByMember.set(event.memberId, memberEvents)
  }

  return input.members.flatMap((member) => {
    const memberEvents = eventsByMember.get(member.id) ?? []
    if (memberEvents.length === 0) {
      return []
    }

    const attendedCount = countStatus(memberEvents, 'attended')
    return [{
      member,
      events: memberEvents,
      attendedCount,
      eligibleCount: memberEvents.length,
      rate: attendanceRate(attendedCount, memberEvents.length),
      attendanceRate: attendanceRate(attendedCount, memberEvents.length),
    }]
  })
}

export const selectAttendanceTableRows = selectAttendanceRows

export function selectMemberHistory(
  input: AdminDemoAggregateInput,
  memberId: string,
  options: AdminDemoFilterOptions = {},
): ReadonlyArray<AdminDemoAttendanceEvent> {
  return eventsForOptions(input, options)
    .filter((event) => event.memberId === memberId)
    .slice()
    .sort((left, right) => (
      right.date.localeCompare(left.date)
      || right.sessionId.localeCompare(left.sessionId)
      || right.id.localeCompare(left.id)
    ))
}

export function selectMemberHistorySummary(
  input: AdminDemoAggregateInput,
  memberId: string,
  options: AdminDemoFilterOptions = {},
): AdminDemoMemberHistory {
  const events = selectMemberHistory(input, memberId, options)
  const attendedCount = countStatus(events, 'attended')

  return {
    member: input.members.find((member) => member.id === memberId),
    events,
    attendedCount,
    eligibleCount: events.length,
    rate: attendanceRate(attendedCount, events.length),
  }
}

export function selectSessionTotals(
  input: AdminDemoAggregateInput,
  options: AdminDemoFilterOptions = {},
): ReadonlyArray<AdminDemoSessionTotal> {
  const events = eventsForOptions(input, options)
  const part = selectedPart(options)
  const eventsBySession = new Map<string, AdminDemoAttendanceEvent[]>()

  for (const event of events) {
    const sessionEvents = eventsBySession.get(event.sessionId) ?? []
    sessionEvents.push(event)
    eventsBySession.set(event.sessionId, sessionEvents)
  }

  return input.sessions
    .filter((session) => (
      isDateInRange(session.date, options.dateRange ?? selectPeriodDateRange(input, options.period ?? 'all'))
      && (part === undefined || session.part === part)
    ))
    .map((session) => {
      const sessionEvents = eventsBySession.get(session.id) ?? []
      const attendedCount = countStatus(sessionEvents, 'attended')
      const missedCount = countStatus(sessionEvents, 'missed')

      return {
        session,
        participantCount: attendedCount,
        attendedCount,
        missedCount,
        eligibleCount: sessionEvents.length,
        rate: attendanceRate(attendedCount, sessionEvents.length),
      }
    })
}

export function selectSessionTotal(
  input: AdminDemoAggregateInput,
  sessionId: string,
  options: AdminDemoFilterOptions = {},
): AdminDemoSessionTotal | undefined {
  return selectSessionTotals(input, options).find((total) => total.session.id === sessionId)
}

export function selectSessionParticipantCount(
  input: AdminDemoAggregateInput,
  sessionId: string,
  options: AdminDemoFilterOptions = {},
): number {
  return selectSessionTotal(input, sessionId, options)?.participantCount ?? 0
}

export const getSessionTotal = selectSessionTotal

/** Returns a copy of a date range clamped to the supplied inclusive bounds. */
export function clampDateRange(range: AdminDemoDateRange, bounds: AdminDemoDateRange): AdminDemoDateRange {
  const from = range.from > bounds.from ? range.from : bounds.from
  const to = range.to < bounds.to ? range.to : bounds.to
  return from <= to ? { from, to } : { from: addDays(to, 1), to }
}
