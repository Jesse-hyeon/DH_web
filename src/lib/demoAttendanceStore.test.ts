import { beforeEach, describe, expect, it } from 'vitest'

import { generateMembers } from '../data/members'
import {
  createDemoAttendanceRepository,
  normalizeMemberQuery,
  resetDemoAttendanceRecordsForTest,
  searchRegisteredMembers,
} from './demoAttendanceStore'

describe('demo attendance search', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeMemberQuery('  KIM   HYUNWOO  ')).toBe('kim hyunwoo')
  })

  it('does not return the full member list for an empty search', () => {
    expect(searchRegisteredMembers('', generateMembers())).toEqual([])
  })

  it('matches displayLabel and searchName with an eight-result cap', () => {
    const registeredMembers = generateMembers()

    expect(searchRegisteredMembers('김현우', registeredMembers)).toEqual([
      expect.objectContaining({ memberId: 'm-001', displayLabel: '김현우 A' }),
      expect.objectContaining({ memberId: 'm-002', displayLabel: '김현우 B' }),
    ])

    expect(searchRegisteredMembers('샘플회원', registeredMembers)).toHaveLength(8)
  })
})

describe('demo attendance repository', () => {
  beforeEach(() => {
    resetDemoAttendanceRecordsForTest()
  })

  it('accepts only registered member IDs with exact display snapshots', async () => {
    const repository = createDemoAttendanceRepository(generateMembers())
    const config = await repository.getCurrentServiceConfig()

    await expect(
      repository.submitAttendance({
        memberId: 'm-001',
        displayNameSnapshot: '김현우 A',
        serviceKey: config.serviceKey,
      }),
    ).resolves.toMatchObject({
      memberId: 'm-001',
      displayNameSnapshot: '김현우 A',
      serviceKey: config.serviceKey,
      countForMemberService: 1,
    })

    await expect(
      repository.submitAttendance({
        memberId: 'missing',
        displayNameSnapshot: '아무 이름',
        serviceKey: config.serviceKey,
      }),
    ).rejects.toThrow(/등록된 교인/)

    await expect(
      repository.submitAttendance({
        memberId: 'm-001',
        displayNameSnapshot: '김현우 B',
        serviceKey: config.serviceKey,
      }),
    ).rejects.toThrow(/일치/)
  })

  it('returns bounded current-service member history without merging duplicate submissions', async () => {
    const repository = createDemoAttendanceRepository(generateMembers())
    const config = await repository.getCurrentServiceConfig()

    await repository.submitAttendance({
      memberId: 'm-001',
      displayNameSnapshot: '김현우 A',
      serviceKey: '2026-08-09',
    })

    for (let index = 0; index < 30; index += 1) {
      await repository.submitAttendance({
        memberId: 'm-001',
        displayNameSnapshot: '김현우 A',
        serviceKey: config.serviceKey,
      })
    }

    await repository.submitAttendance({
      memberId: 'm-002',
      displayNameSnapshot: '김현우 B',
      serviceKey: config.serviceKey,
    })

    await expect(repository.listMemberHistory('m-001', 2)).resolves.toEqual([
      expect.objectContaining({
        memberId: 'm-001',
        displayNameSnapshot: '김현우 A',
        serviceKey: config.serviceKey,
        countForMemberService: 30,
      }),
      expect.objectContaining({
        memberId: 'm-001',
        displayNameSnapshot: '김현우 A',
        serviceKey: config.serviceKey,
        countForMemberService: 29,
      }),
    ])

    const cappedHistory = await repository.listMemberHistory('m-001', 99)
    expect(cappedHistory).toHaveLength(25)
    expect(cappedHistory.every((record) => record.memberId === 'm-001')).toBe(true)
    expect(cappedHistory.every((record) => record.serviceKey === config.serviceKey)).toBe(true)
    expect(cappedHistory.map((record) => record.id)).not.toContain('demo-attendance-0001')
  })

  it('caps the demo dashboard count to the public current-service read limit', async () => {
    const repository = createDemoAttendanceRepository(generateMembers())
    const config = await repository.getCurrentServiceConfig()

    for (let index = 0; index < 101; index += 1) {
      await repository.submitAttendance({
        memberId: 'm-001',
        displayNameSnapshot: '김현우 A',
        serviceKey: config.serviceKey,
      })
    }

    await expect(repository.getCurrentServiceAttendance()).resolves.toMatchObject({
      totalCount: 100,
      rows: expect.any(Array),
    })
  })

  it('rejects member history lookup for unregistered or blank members', async () => {
    const repository = createDemoAttendanceRepository(generateMembers())

    await expect(repository.listMemberHistory('')).rejects.toThrow(/선택/)
    await expect(repository.listMemberHistory('missing')).rejects.toThrow(/등록된 교인/)
  })
})
