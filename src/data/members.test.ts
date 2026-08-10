import { describe, expect, it } from 'vitest'
import { DEFAULT_MEMBER_COUNT, generateMembers, members } from './members'

describe('synthetic registered members', () => {
  it('produces the same fixture for every generation', () => {
    expect(generateMembers()).toEqual(generateMembers())
  })

  it('contains at least 2,000 members by default', () => {
    expect(DEFAULT_MEMBER_COUNT).toBeGreaterThanOrEqual(2_000)
    expect(members).toHaveLength(DEFAULT_MEMBER_COUNT)
  })

  it('uses realistic unique Korean names and an evenly distributed cohort', () => {
    expect(members.slice(0, 2)).toEqual([
      expect.objectContaining({ memberId: 'm-001', displayLabel: '김현우', cohort: '4교구' }),
      expect.objectContaining({ memberId: 'm-002', displayLabel: '김지훈', cohort: '1교구' }),
    ])
    expect(new Set(members.map((member) => member.displayLabel)).size).toBe(DEFAULT_MEMBER_COUNT)
    expect(members.filter((member) => member.cohort === '1교구')).toHaveLength(400)
  })

  it('assigns a unique ID to every member', () => {
    const ids = members.map((member) => member.memberId)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('rejects counts outside the shared unique-name capacity', () => {
    expect(() => generateMembers(1)).toThrow(/from 2 to 2000/)
    expect(() => generateMembers(2_001)).toThrow(/from 2 to 2000/)
  })
})
