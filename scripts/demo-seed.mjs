import process from 'node:process'
import memberNames from '../src/data/memberNames.json' with { type: 'json' }

const DEFAULT_MEMBER_COUNT = 2000
const DEFAULT_SERVICE_KEY = '2026-08-16'
const FAMILY_NAMES = memberNames.familyNames
const GIVEN_NAMES = memberNames.givenNames
const MAX_MEMBER_COUNT = FAMILY_NAMES.length * GIVEN_NAMES.length

function usage() {
  return [
    'Usage: npm run demo:seed -- [--service-key YYYY-MM-DD] [--count 2000]',
    'Prints deterministic dummy Firestore seed JSON to stdout.',
    'The output contains no attendance records and no private member fields.',
  ].join('\n')
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) {
    return fallback
  }

  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`)
  }

  return value
}

function createMember(index) {
  const memberId = `m-${String(index).padStart(3, '0')}`
  const zeroBasedIndex = index - 1
  const familyName = FAMILY_NAMES[Math.floor(zeroBasedIndex / GIVEN_NAMES.length)]
  const givenName = GIVEN_NAMES[zeroBasedIndex % GIVEN_NAMES.length]
  const displayLabel = `${familyName}${givenName}`
  return {
    memberId,
    displayLabel,
    searchName: displayLabel,
    sortKey: displayLabel,
    cohort: `${((index * 37 + 11) % 5) + 1}교구`,
  }
}

function serviceKeysForYear(year) {
  const keys = []
  const date = new Date(Date.UTC(year, 0, 1))
  date.setUTCDate(date.getUTCDate() + (7 - date.getUTCDay()) % 7)

  while (date.getUTCFullYear() === year) {
    keys.push(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() + 7)
  }

  return keys
}

try {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage())
    process.exit(0)
  }

  const serviceKey = readOption('--service-key', DEFAULT_SERVICE_KEY)
  const count = Number.parseInt(readOption('--count', String(DEFAULT_MEMBER_COUNT)), 10)
  const registeredServiceKeys = [2026, 2027].flatMap(serviceKeysForYear)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceKey)) {
    throw new Error('--service-key must use YYYY-MM-DD.')
  }

  if (!registeredServiceKeys.includes(serviceKey)) {
    throw new Error('--service-key must be a Sunday in 2026 or 2027.')
  }

  if (!Number.isInteger(count) || count < 2 || count > MAX_MEMBER_COUNT) {
    throw new Error(`--count must be an integer from 2 to ${MAX_MEMBER_COUNT}.`)
  }

  const members = Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const member = createMember(index + 1)
      return [member.memberId, member]
    }),
  )

  const seed = {
    serviceConfig: {
      currentServiceKey: {
        serviceKey,
      },
    },
    serviceSessions: Object.fromEntries(
      registeredServiceKeys.map((key) => [key, { serviceKey: key }]),
    ),
    members,
    attendanceServices: {
      [serviceKey]: {
        submissions: {},
      },
    },
  }

  console.error(`demo:seed generated ${count} dummy members for ${serviceKey}; attendanceServices/${serviceKey}/submissions is empty.`)
  console.log(JSON.stringify(seed, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.error(usage())
  process.exit(1)
}
