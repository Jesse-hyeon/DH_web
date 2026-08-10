import type { Member } from '../domain/types'
import memberNames from './memberNames.json'

export interface PublicMember extends Member {
  searchName?: string
  sortKey?: string
  cohort?: string
}

export const DEFAULT_MEMBER_COUNT = 2_000

const FAMILY_NAMES = memberNames.familyNames
const GIVEN_NAMES = memberNames.givenNames
const MAX_MEMBER_COUNT = FAMILY_NAMES.length * GIVEN_NAMES.length

function cohortForMember(index: number): string {
  return `${((index * 37 + 11) % 5) + 1}교구`
}

function createMember(index: number): PublicMember {
  const memberId = `m-${String(index).padStart(3, '0')}`
  const zeroBasedIndex = index - 1
  const familyName = FAMILY_NAMES[Math.floor(zeroBasedIndex / GIVEN_NAMES.length)] as string
  const givenName = GIVEN_NAMES[zeroBasedIndex % GIVEN_NAMES.length] as string
  const displayLabel = `${familyName}${givenName}`

  return {
    memberId,
    displayLabel,
    searchName: displayLabel,
    sortKey: displayLabel,
    cohort: cohortForMember(index),
  }
}

export function generateMembers(count = DEFAULT_MEMBER_COUNT): PublicMember[] {
  if (!Number.isInteger(count) || count < 2 || count > MAX_MEMBER_COUNT) {
    throw new RangeError(`Member count must be an integer from 2 to ${MAX_MEMBER_COUNT}.`)
  }

  return Array.from({ length: count }, (_, index) => createMember(index + 1))
}

export const members = generateMembers()
