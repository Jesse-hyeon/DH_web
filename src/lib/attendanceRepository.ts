import type { PublicMember } from '../data/members'
import type { ServiceConfig, ServiceKey, ServicePart } from '../domain/types'

/** Maximum number of member documents returned for one name search. */
export const MAX_MEMBER_SEARCH_ROWS = 10

/** Avoid broad one-character searches that waste reads and expose large result sets. */
export const MIN_MEMBER_SEARCH_LENGTH = 2

/** Maximum number of current-service rows exposed by the admin repository. */
export const MAX_ADMIN_ROWS = 2_000

/** Maximum number of current-service history rows exposed for one member. */
export const MAX_MEMBER_HISTORY_ROWS = 25

export interface AttendanceDraft {
  memberId: string
  displayNameSnapshot: string
  serviceKey: ServiceKey
  servicePart: ServicePart
  createdAtClient?: Date
}

export interface AttendanceSubmissionResult {
  id: string
  memberId?: string
  displayNameSnapshot?: string
  serviceKey?: ServiceKey
  servicePart?: ServicePart
  submittedAt?: Date
  createdAtClient?: Date
}

export interface AttendanceRecord {
  id: string
  memberId: string
  displayNameSnapshot: string
  serviceKey: ServiceKey
  servicePart: ServicePart
  createdAtClient?: Date
  submittedAt?: Date
  countForMemberService?: number
}

export interface CurrentServiceAttendance {
  serviceKey: ServiceKey
  /** Public no-auth MVP count, capped at MAX_ADMIN_ROWS to match list-rule limits. */
  totalCount: number
  rows: AttendanceRecord[]
}

/** The app-facing contract implemented by both demo and Firebase repositories. */
export interface AttendanceRepository {
  searchRegisteredMembers(query: string, limit?: number): Promise<PublicMember[]>
  getCurrentServiceConfig(): Promise<ServiceConfig>
  getServiceConfig(serviceKey: ServiceKey): Promise<ServiceConfig>
  submitAttendance(draft: AttendanceDraft): Promise<AttendanceSubmissionResult>

  /** Current-service admin data must be fetched through this bounded method. */
  getCurrentServiceAttendance(limit?: number): Promise<CurrentServiceAttendance>

  /** Fetch one explicitly selected service date for QR-to-admin reconciliation. */
  getServiceAttendance(serviceKey: ServiceKey, limit?: number): Promise<CurrentServiceAttendance>

  listMemberHistory(memberId: string, limit?: number): Promise<AttendanceRecord[]>
}

export function normalizeMemberSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
}

export function boundedRepositoryLimit(
  value: number | undefined,
  maximum: number,
  label: string,
): number {
  if (value === undefined) {
    return maximum
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} limit must be a positive integer.`)
  }

  return Math.min(value, maximum)
}
