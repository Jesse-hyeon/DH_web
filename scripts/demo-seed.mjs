import process from 'node:process'

const DEFAULT_MEMBER_COUNT = 2000
const DEFAULT_SERVICE_KEY = '2026-08-10'
const SYNTHETIC_MEMBER_PREFIX = '샘플회원'

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

try {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage())
    process.exit(0)
  }

  const serviceKey = readOption('--service-key', DEFAULT_SERVICE_KEY)
  const count = Number.parseInt(readOption('--count', String(DEFAULT_MEMBER_COUNT)), 10)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceKey)) {
    throw new Error('--service-key must use YYYY-MM-DD.')
  }

  if (!Number.isInteger(count) || count < 2 || count > 10000) {
    throw new Error('--count must be an integer from 2 to 10000.')
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
