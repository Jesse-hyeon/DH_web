import type { Member } from '../domain/types'

export interface PublicMember extends Member {
  searchName?: string
  sortKey?: string
}

export const DEFAULT_MEMBER_COUNT = 2_000

const SYNTHETIC_MEMBER_PREFIX = '샘플회원'

function createMember(index: number): PublicMember {
  const memberId = `m-${String(index).padStart(3, '0')}`

  if (index === 1) {
    return {
      memberId,
      displayLabel: '김현우 A',
      searchName: '김현우',
      sortKey: '김현우 a',
    }
  }

  if (index === 2) {
    return {
      memberId,
      displayLabel: '김현우 B',
      searchName: '김현우',
      sortKey: '김현우 b',
    }
  }

  const suffix = String(index).padStart(4, '0')
  return {
    memberId,
    displayLabel: `${SYNTHETIC_MEMBER_PREFIX} ${suffix}`,
    searchName: SYNTHETIC_MEMBER_PREFIX,
    sortKey: `${SYNTHETIC_MEMBER_PREFIX} ${suffix}`,
  }
}

export function generateMembers(count = DEFAULT_MEMBER_COUNT): PublicMember[] {
  if (!Number.isInteger(count) || count < 2) {
    throw new RangeError('Member count must be an integer of at least 2.')
  }

  return Array.from({ length: count }, (_, index) => createMember(index + 1))
}

export const members = generateMembers()
