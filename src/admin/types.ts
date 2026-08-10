/** A calendar date serialized as YYYY-MM-DD for the admin demo. */
export type AdminDemoDate = string

export type AdminDemoServicePart = 1 | 2 | 3

export type AdminDemoEventStatus = 'attended' | 'missed'

export interface AdminDemoMemberProfile {
  id: string
  label: string
  joinedOn: AdminDemoDate
  cohort: string
}

export interface AdminDemoServiceSession {
  id: string
  part: AdminDemoServicePart
  date: AdminDemoDate
  startsAt: string
  weekNumber: 1 | 2 | 3 | 4
  label: string
}

export interface AdminDemoAttendanceEvent {
  id: string
  memberId: string
  sessionId: string
  date: AdminDemoDate
  part: AdminDemoServicePart
  weekNumber: 1 | 2 | 3 | 4
  status: AdminDemoEventStatus
}

/** Raw fixture data consumed by pure dashboard and attendance selectors. */
export interface AdminDemoAggregateInput {
  referenceDate: AdminDemoDate
  members: ReadonlyArray<AdminDemoMemberProfile>
  sessions: ReadonlyArray<AdminDemoServiceSession>
  events: ReadonlyArray<AdminDemoAttendanceEvent>
}

/** Narrow input for service-part aggregates used by later selectors. */
export interface AdminDemoServiceAggregateInput {
  part: AdminDemoServicePart
  events: ReadonlyArray<AdminDemoAttendanceEvent>
}

/** Narrow input for weekly aggregates used by later selectors. */
export interface AdminDemoWeeklyAggregateInput {
  weekNumber: 1 | 2 | 3 | 4
  events: ReadonlyArray<AdminDemoAttendanceEvent>
  sessions: ReadonlyArray<AdminDemoServiceSession>
}

export interface AdminDemoDateRange {
  from: AdminDemoDate
  to: AdminDemoDate
}

export interface AdminDemoServiceAverage {
  part: AdminDemoServicePart
  attendedCount: number
  eligibleCount: number
  rate: number
}

export interface AdminDemoWeeklySummary {
  weekNumber: 1 | 2 | 3 | 4
  dateRange: AdminDemoDateRange
  attendedCount: number
  eligibleCount: number
  rate: number
}

export interface AdminDemoDashboardAggregates {
  memberCount: number
  eventCount: number
  newMemberCount: number
  longTermAbsenteeCount: number
  weeklyAverage: number
  serviceAverages: ReadonlyArray<AdminDemoServiceAverage>
  weeklySummaries: ReadonlyArray<AdminDemoWeeklySummary>
}

export interface AdminDemoFixtureBundle {
  referenceDate: AdminDemoDate
  dateRange: AdminDemoDateRange
  members: ReadonlyArray<AdminDemoMemberProfile>
  sessions: ReadonlyArray<AdminDemoServiceSession>
  events: ReadonlyArray<AdminDemoAttendanceEvent>
  dashboard: AdminDemoDashboardAggregates
}
