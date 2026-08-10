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

  it('matches displayLabel and searchName with a ten-result cap', () => {
    const registeredMembers = generateMembers()

    expect(searchRegisteredMembers('김현우', registeredMembers)).toEqual([
      expect.objectContaining({ memberId: 'm-001', displayLabel: '김현우' }),
    ])

    expect(searchRegisteredMembers('김', registeredMembers)).toHaveLength(10)
  })
})

describe('demo attendance repository', () => {
  beforeEach(() => {
    resetDemoAttendanceRecordsForTest()
  })

  it('searches a bounded subset instead of returning the full member list', async () => {
    const repository = createDemoAttendanceRepository(generateMembers())

    await expect(repository.searchRegisteredMembers('김현우')).resolves.toHaveLength(1)
    await expect(repository.searchRegisteredMembers('김', 3)).resolves.toHaveLength(3)
    await expect(repository.searchRegisteredMembers('김', 100)).resolves.toHaveLength(10)
  })

  it('accepts only registered member IDs with exact display snapshots', async () => {
    const repository = createDemoAttendanceRepository(generateMembers())
    const config = await repository.getCurrentServiceConfig()

    await expect(
      repository.submitAttendance({
        memberId: 'm-001',
        displayNameSnapshot: '김현우',
        serviceKey: config.serviceKey,
        servicePart: 1,
      }),
    ).resolves.toMatchObject({
      memberId: 'm-001',
      displayNameSnapshot: '김현우',
      serviceKey: config.serviceKey,
      countForMemberService: 1,
    })

    await expect(
      repository.submitAttendance({
        memberId: 'missing',
        displayNameSnapshot: '아무 이름',
        serviceKey: config.serviceKey,
        servicePart: 1,
      }),
    ).rejects.toThrow(/등록된 교인/)

    await expect(
      repository.submitAttendance({
        memberId: 'm-001',
        displayNameSnapshot: '김지훈',
        serviceKey: config.serviceKey,
        servicePart: 1,
      }),
    ).rejects.toThrow(/일치/)
  })

  it('returns one current-service record when a member submits repeatedly', async () => {
    const repository = createDemoAttendanceRepository(generateMembers())
    const config = await repository.getCurrentServiceConfig()

    await repository.submitAttendance({
      memberId: 'm-001',
      displayNameSnapshot: '김현우',
      serviceKey: '2026-08-09',
      servicePart: 1,
    })

    for (let index = 0; index < 30; index += 1) {
      await repository.submitAttendance({
        memberId: 'm-001',
        displayNameSnapshot: '김현우',
        serviceKey: config.serviceKey,
        servicePart: 1,
      })
    }

    await repository.submitAttendance({
      memberId: 'm-002',
      displayNameSnapshot: '김지훈',
      serviceKey: config.serviceKey,
      servicePart: 2,
    })

    await expect(repository.listMemberHistory('m-001', 2)).resolves.toEqual([
      expect.objectContaining({
        memberId: 'm-001',
        displayNameSnapshot: '김현우',
        serviceKey: config.serviceKey,
        servicePart: 1,
        countForMemberService: 1,
      }),
    ])

    const cappedHistory = await repository.listMemberHistory('m-001', 99)
    expect(cappedHistory).toHaveLength(1)
    expect(cappedHistory.every((record) => record.memberId === 'm-001')).toBe(true)
    expect(cappedHistory.every((record) => record.serviceKey === config.serviceKey)).toBe(true)
    expect(cappedHistory.map((record) => record.id)).toContain('demo-attendance-0002')
  })

  it('caps the demo dashboard count to the public current-service read limit', async () => {
    const repository = createDemoAttendanceRepository(generateMembers())
    const config = await repository.getCurrentServiceConfig()

    for (let index = 0; index < 101; index += 1) {
      await repository.submitAttendance({
        memberId: 'm-001',
        displayNameSnapshot: '김현우',
        serviceKey: config.serviceKey,
        servicePart: 1,
      })
    }

    await expect(repository.getCurrentServiceAttendance()).resolves.toMatchObject({
      totalCount: 1,
      rows: expect.any(Array),
    })
  })

  it('rejects member history lookup for unregistered or blank members', async () => {
    const repository = createDemoAttendanceRepository(generateMembers())

    await expect(repository.listMemberHistory('')).rejects.toThrow(/선택/)
    await expect(repository.listMemberHistory('missing')).rejects.toThrow(/등록된 교인/)
  })
})
