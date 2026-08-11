import { members, type PublicMember } from '../data/members'
import type { ServiceConfig, ServiceKey } from '../domain/types'
import {
  boundedRepositoryLimit,
  MAX_ADMIN_ROWS,
  MAX_MEMBER_SEARCH_ROWS,
  MAX_MEMBER_HISTORY_ROWS,
  normalizeMemberSearchQuery,
  type AttendanceDraft,
  type AttendanceRecord,
  type AttendanceRepository,
  type CurrentServiceAttendance,
  type ServiceAttendanceSummary,
} from './attendanceRepository'
import { toSeoulServiceKey } from './seoulDate'

export type DemoAttendanceDraft = AttendanceDraft

export interface DemoAttendanceRecord extends AttendanceRecord {
  submittedAt: Date
  countForMemberService: number
}

export interface DemoAttendanceRepository extends AttendanceRepository {
  getCurrentServiceConfig(): Promise<ServiceConfig>
  getServiceConfig(serviceKey: ServiceKey): Promise<ServiceConfig>
  submitAttendance(draft: DemoAttendanceDraft): Promise<DemoAttendanceRecord>
  listMemberHistory(memberId: string, limit?: number): Promise<DemoAttendanceRecord[]>
}

const SERVICE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

let submissionSequence = 0
const submissionRecords: DemoAttendanceRecord[] = []

export function normalizeMemberQuery(value: string): string {
  return normalizeMemberSearchQuery(value)
}

export function searchRegisteredMembers(
  query: string,
  registeredMembers: readonly PublicMember[] = members,
  limit = MAX_MEMBER_SEARCH_ROWS,
): PublicMember[] {
  const normalizedQuery = normalizeMemberQuery(query)

  if (normalizedQuery.length === 0) {
    return []
  }

  return registeredMembers
    .filter((member) => {
      const displayLabel = normalizeMemberQuery(member.displayLabel)
      const searchName = normalizeMemberQuery(member.searchName ?? '')

      return displayLabel.startsWith(normalizedQuery) || searchName.startsWith(normalizedQuery)
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

  async function getServiceConfig(serviceKey: ServiceKey): Promise<ServiceConfig> {
    assertServiceKey(serviceKey)
    return { serviceKey }
  }

  async function getServiceAttendance(
    serviceKey: ServiceKey,
    limit?: number,
  ): Promise<CurrentServiceAttendance> {
    assertServiceKey(serviceKey)
    const serviceRecords = submissionRecords.filter((record) => record.serviceKey === serviceKey)
    const boundedLimit = boundedRepositoryLimit(limit, MAX_ADMIN_ROWS, 'Admin rows')

    return {
      serviceKey,
      totalCount: Math.min(serviceRecords.length, MAX_ADMIN_ROWS),
      rows: serviceRecords.slice(0, boundedLimit).map(cloneAttendanceRecord),
    }
  }

  async function getServiceAttendanceSummary(
    serviceKey: ServiceKey,
  ): Promise<ServiceAttendanceSummary> {
    assertServiceKey(serviceKey)
    const serviceRecords = submissionRecords.filter((record) => record.serviceKey === serviceKey)

    return {
      serviceKey,
      totalCount: Math.min(serviceRecords.length, MAX_ADMIN_ROWS),
      partCounts: {
        1: serviceRecords.filter((record) => record.servicePart === 1).length,
        2: serviceRecords.filter((record) => record.servicePart === 2).length,
        3: serviceRecords.filter((record) => record.servicePart === 3).length,
      },
    }
  }

  return {
    async searchRegisteredMembers(query, limit): Promise<PublicMember[]> {
      return searchRegisteredMembers(
        query,
        registeredMembers,
        boundedRepositoryLimit(limit, MAX_MEMBER_SEARCH_ROWS, 'Member search'),
      )
    },

    getCurrentServiceConfig,
    getServiceConfig,

    async submitAttendance(draft: DemoAttendanceDraft): Promise<DemoAttendanceRecord> {
      assertServiceKey(draft.serviceKey)

      const member = memberById.get(draft.memberId)
      if (!member) {
        throw new Error('등록된 교인만 출석할 수 있습니다.')
      }

      if (draft.displayNameSnapshot !== member.displayLabel) {
        throw new Error('선택한 교인 정보가 일치하지 않습니다.')
      }

      const existingRecord = submissionRecords.find(
        (record) => record.memberId === draft.memberId && record.serviceKey === draft.serviceKey,
      )
      if (existingRecord) {
        return { ...existingRecord }
      }

      const countForMemberService = submissionRecords.filter(
        (record) => record.memberId === draft.memberId && record.serviceKey === draft.serviceKey,
      ).length + 1

      const record: DemoAttendanceRecord = {
        id: `demo-attendance-${String(++submissionSequence).padStart(4, '0')}`,
        memberId: draft.memberId,
        displayNameSnapshot: draft.displayNameSnapshot,
        serviceKey: draft.serviceKey,
        servicePart: draft.servicePart,
        submittedAt: new Date(),
        countForMemberService,
      }

      submissionRecords.push(record)
      return { ...record }
    },

    async getCurrentServiceAttendance(limit?: number): Promise<CurrentServiceAttendance> {
      const serviceConfig = await getCurrentServiceConfig()
      return getServiceAttendance(serviceConfig.serviceKey, limit)
    },

    getServiceAttendance,
    getServiceAttendanceSummary,

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
