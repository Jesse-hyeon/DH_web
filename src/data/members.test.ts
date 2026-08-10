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

  it('keeps the duplicate display name choices searchable and distinct', () => {
    const matchingMembers = members.filter((member) => member.searchName === '김현우')

    expect(matchingMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberId: 'm-001', displayLabel: '김현우 A' }),
        expect.objectContaining({ memberId: 'm-002', displayLabel: '김현우 B' }),
      ]),
    )
    expect(matchingMembers[0]?.memberId).not.toBe(matchingMembers[1]?.memberId)
  })

  it('assigns a unique ID to every member', () => {
    const ids = members.map((member) => member.memberId)

    expect(new Set(ids).size).toBe(ids.length)
  })
})
