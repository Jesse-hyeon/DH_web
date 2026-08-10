import type { PublicMember } from '../data/members'
import type { ServiceConfig, ServiceKey } from '../domain/types'

/** Maximum number of public member documents loaded for local bounded search. */
export const MAX_REGISTERED_MEMBER_ROWS = 2_000

/** Maximum number of current-service rows exposed by the admin repository. */
export const MAX_ADMIN_ROWS = 100

/** Maximum number of current-service history rows exposed for one member. */
export const MAX_MEMBER_HISTORY_ROWS = 25

export interface AttendanceDraft {
  memberId: string
  displayNameSnapshot: string
  serviceKey: ServiceKey
  createdAtClient?: Date
}

export interface AttendanceSubmissionResult {
  id: string
  memberId?: string
  displayNameSnapshot?: string
  serviceKey?: ServiceKey
  submittedAt?: Date
  createdAtClient?: Date
}

export interface AttendanceRecord extends AttendanceDraft {
  id: string
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
  listRegisteredMembers(): Promise<PublicMember[]>
  getCurrentServiceConfig(): Promise<ServiceConfig>
  submitAttendance(draft: AttendanceDraft): Promise<AttendanceSubmissionResult>

  /** Current-service admin data must be fetched through this bounded method. */
  getCurrentServiceAttendance(limit?: number): Promise<CurrentServiceAttendance>

  listMemberHistory(memberId: string, limit?: number): Promise<AttendanceRecord[]>
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
