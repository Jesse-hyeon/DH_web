import { members, type PublicMember } from '../data/members'
import type { ServiceConfig, ServiceKey } from '../domain/types'
import {
  boundedRepositoryLimit,
  MAX_ADMIN_ROWS,
  MAX_MEMBER_HISTORY_ROWS,
  type AttendanceDraft,
  type AttendanceRecord,
  type AttendanceRepository,
  type CurrentServiceAttendance,
} from './attendanceRepository'
import { toSeoulServiceKey } from './seoulDate'

export type DemoAttendanceDraft = AttendanceDraft

export interface DemoAttendanceRecord extends AttendanceRecord {
  submittedAt: Date
  countForMemberService: number
}

export interface DemoAttendanceRepository extends AttendanceRepository {
  listRegisteredMembers(): Promise<PublicMember[]>
  getCurrentServiceConfig(): Promise<ServiceConfig>
  submitAttendance(draft: DemoAttendanceDraft): Promise<DemoAttendanceRecord>
  listMemberHistory(memberId: string, limit?: number): Promise<DemoAttendanceRecord[]>
}

const SEARCH_RESULT_LIMIT = 8
const SERVICE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

let submissionSequence = 0
const submissionRecords: DemoAttendanceRecord[] = []

export function normalizeMemberQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
}

export function searchRegisteredMembers(
  query: string,
  registeredMembers: readonly PublicMember[] = members,
  limit = SEARCH_RESULT_LIMIT,
): PublicMember[] {
  const normalizedQuery = normalizeMemberQuery(query)

  if (normalizedQuery.length === 0) {
    return []
  }

  return registeredMembers
    .filter((member) => {
      const displayLabel = normalizeMemberQuery(member.displayLabel)
      const searchName = normalizeMemberQuery(member.searchName ?? '')

      return displayLabel.includes(normalizedQuery) || searchName.includes(normalizedQuery)
    })
    .slice(0, limit)
}

function assertServiceKey(value: ServiceKey): void {
  if (!SERVICE_KEY_PATTERN.test(value)) {
    throw new Error('Demo attendance serviceKey must be YYYY-MM-DD.')
  }
}

function cloneAttendanceRecord(record: DemoAttendanceRecord): DemoAttendanceRecord {
  return { ...record }
}

export function createDemoAttendanceRepository(
  registeredMembers: readonly PublicMember[] = members,
): DemoAttendanceRepository {
  const memberById = new Map(registeredMembers.map((member) => [member.memberId, member]))

  async function getCurrentServiceConfig(): Promise<ServiceConfig> {
    return { serviceKey: toSeoulServiceKey() }
  }

  return {
    async listRegisteredMembers(): Promise<PublicMember[]> {
      return [...registeredMembers]
    },

    getCurrentServiceConfig,

    async submitAttendance(draft: DemoAttendanceDraft): Promise<DemoAttendanceRecord> {
      assertServiceKey(draft.serviceKey)

      const member = memberById.get(draft.memberId)
      if (!member) {
        throw new Error('등록된 교인만 출석할 수 있습니다.')
      }

      if (draft.displayNameSnapshot !== member.displayLabel) {
        throw new Error('선택한 교인 정보가 일치하지 않습니다.')
      }

      const countForMemberService = submissionRecords.filter(
        (record) => record.memberId === draft.memberId && record.serviceKey === draft.serviceKey,
      ).length + 1

      const record: DemoAttendanceRecord = {
        id: `demo-attendance-${String(++submissionSequence).padStart(4, '0')}`,
        memberId: draft.memberId,
        displayNameSnapshot: draft.displayNameSnapshot,
        serviceKey: draft.serviceKey,
        submittedAt: new Date(),
        countForMemberService,
      }

      submissionRecords.push(record)
      return { ...record }
    },

    async getCurrentServiceAttendance(limit?: number): Promise<CurrentServiceAttendance> {
      const serviceConfig = await getCurrentServiceConfig()
      const currentServiceRecords = submissionRecords.filter(
        (record) => record.serviceKey === serviceConfig.serviceKey,
      )
      const boundedLimit = boundedRepositoryLimit(limit, MAX_ADMIN_ROWS, 'Admin rows')

      return {
        serviceKey: serviceConfig.serviceKey,
        totalCount: Math.min(currentServiceRecords.length, MAX_ADMIN_ROWS),
        rows: currentServiceRecords.slice(0, boundedLimit).map(cloneAttendanceRecord),
      }
    },

    async listMemberHistory(memberId: string, limit?: number): Promise<DemoAttendanceRecord[]> {
      const normalizedMemberId = memberId.trim()
      if (normalizedMemberId.length === 0) {
        throw new Error('조회할 교인을 선택해 주세요.')
      }

      if (!memberById.has(normalizedMemberId)) {
        throw new Error('등록된 교인만 조회할 수 있습니다.')
      }

      const { serviceKey } = await getCurrentServiceConfig()
      return submissionRecords
        .filter((record) => (
          record.memberId === normalizedMemberId
          && record.serviceKey === serviceKey
        ))
        .sort((left, right) => (
          right.submittedAt.getTime() - left.submittedAt.getTime()
          || right.id.localeCompare(left.id)
        ))
        .slice(0, boundedRepositoryLimit(limit, MAX_MEMBER_HISTORY_ROWS, 'Member history'))
        .map(cloneAttendanceRecord)
    },
  }
}

export function resetDemoAttendanceRecordsForTest(): void {
  submissionSequence = 0
  submissionRecords.length = 0
}

export const demoAttendanceRepository = createDemoAttendanceRepository()
