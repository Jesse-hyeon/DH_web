/** A calendar date serialized as YYYY-MM-DD. */
export type ISODate = string

/** The MVP service bucket key, serialized as YYYY-MM-DD in Asia/Seoul. */
export type ServiceKey = ISODate

export type ServicePart = 1 | 2 | 3

export type MemberId = string

export interface Member {
  memberId: MemberId
  displayLabel: string
}

export interface AttendanceSubmission {
  memberId: MemberId
  displayNameSnapshot: string
  serviceKey: ServiceKey
  servicePart: ServicePart
  submittedAt: Date
  createdAtClient?: Date
}

export interface ServiceConfig {
  serviceKey: ServiceKey
}
