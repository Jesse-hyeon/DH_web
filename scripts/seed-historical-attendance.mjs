import process from 'node:process'
import memberNames from '../src/data/memberNames.json' with { type: 'json' }
import { deleteApp, initializeApp } from 'firebase/app'
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

const MEMBER_COUNT = 2_000
const HISTORY_DATES = [
  '2026-05-24',
  '2026-05-31',
  '2026-06-07',
  '2026-06-14',
  '2026-06-21',
  '2026-06-28',
  '2026-07-05',
  '2026-07-12',
  '2026-07-19',
  '2026-07-26',
  '2026-08-02',
  '2026-08-09',
]
const MAX_FREE_TIER_WRITES = 15_000
const APPLY_CHUNK_CONCURRENCY = 20
const FAMILY_NAMES = memberNames.familyNames
const GIVEN_NAMES = memberNames.givenNames

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required.`)
  }
  return value
}

function memberAt(index) {
  const zeroBasedIndex = index - 1
  const familyName = FAMILY_NAMES[Math.floor(zeroBasedIndex / GIVEN_NAMES.length)]
  const givenName = GIVEN_NAMES[zeroBasedIndex % GIVEN_NAMES.length]
  return {
    memberId: `m-${String(index).padStart(3, '0')}`,
    displayLabel: `${familyName}${givenName}`,
  }
}

function stableHash(value) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function attendancePattern(memberIndex) {
  const bucket = (memberIndex - 1) % 100
  if (bucket < 40) return 'regular'
  if (bucket < 70) return 'steady'
  if (bucket < 82) return 'occasional'
  if (bucket < 89) return 'stopped'
  if (bucket < 95) return 'returning'
  if (bucket < 98) return 'long-absent'
  return 'rare'
}

function shouldAttend(memberIndex, weekIndex) {
  if (memberIndex <= 100) {
    return true
  }

  const score = stableHash(`${memberIndex}:${weekIndex}:attendance`) % 100
  switch (attendancePattern(memberIndex)) {
    case 'regular':
      return score < 84
    case 'steady':
      return score < 59
    case 'occasional':
      return score < 32
    case 'stopped':
      return weekIndex <= 5 && score < 82
    case 'returning':
      return weekIndex >= 7 && score < 78
    case 'long-absent':
      return weekIndex <= 2 && score < 35
    case 'rare':
      return score < 8
    default:
      return false
  }
}

function servicePartFor(memberIndex, weekIndex) {
  const preferredScore = stableHash(`${memberIndex}:preferred-service`) % 100
  const preferredPart = preferredScore < 20 ? 1 : preferredScore < 55 ? 2 : 3
  const changesService = stableHash(`${memberIndex}:${weekIndex}:service-change`) % 10 === 0
  return changesService ? ((preferredPart + weekIndex) % 3) + 1 : preferredPart
}

function historicalClientTime(serviceKey, servicePart, memberIndex) {
  const hour = servicePart === 1 ? 7 : servicePart === 2 ? 9 : 11
  const minute = 30 + (stableHash(`${memberIndex}:${serviceKey}:minute`) % 18)
  return Timestamp.fromDate(new Date(`${serviceKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`))
}

function plannedAttendance() {
  return HISTORY_DATES.flatMap((serviceKey, weekIndex) => (
    Array.from({ length: MEMBER_COUNT }, (_, offset) => offset + 1)
      .filter((memberIndex) => shouldAttend(memberIndex, weekIndex))
      .map((memberIndex) => {
        const member = memberAt(memberIndex)
        const servicePart = servicePartFor(memberIndex, weekIndex)
        return {
          ...member,
          serviceKey,
          servicePart,
          createdAtClient: historicalClientTime(serviceKey, servicePart, memberIndex),
          pattern: attendancePattern(memberIndex),
        }
      })
  ))
}

async function existingSubmissionIds(firestore, serviceKey) {
  const submissions = collection(firestore, 'attendanceServices', serviceKey, 'submissions')
  const snapshot = await getDocs(query(submissions, limit(MEMBER_COUNT)))
  return new Set(snapshot.docs.map((entry) => entry.id))
}

async function applyWithConcurrency(items, worker) {
  let nextIndex = 0
  async function runWorker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      await worker(item)
    }
  }
  await Promise.all(Array.from({ length: APPLY_CHUNK_CONCURRENCY }, runWorker))
}

function printSummary(planned, missing) {
  console.log(`Historical attendance window: ${HISTORY_DATES[0]} through ${HISTORY_DATES.at(-1)}`)
  for (const serviceKey of HISTORY_DATES) {
    const targetCount = planned.filter((entry) => entry.serviceKey === serviceKey).length
    const missingCount = missing.filter((entry) => entry.serviceKey === serviceKey).length
    const existingCount = targetCount - missingCount
    console.log(
      `${serviceKey}: ${targetCount.toLocaleString('en-US')} target, `
      + `${existingCount.toLocaleString('en-US')} existing, `
      + `${missingCount.toLocaleString('en-US')} missing`,
    )
  }

  const patternCounts = planned.reduce((counts, entry) => {
    counts.set(entry.pattern, (counts.get(entry.pattern) ?? 0) + 1)
    return counts
  }, new Map())
  console.log('Pattern check-ins:')
  for (const [pattern, count] of patternCounts) {
    console.log(`- ${pattern}: ${count.toLocaleString('en-US')}`)
  }
  console.log(`Existing documents skipped: ${(planned.length - missing.length).toLocaleString('en-US')}`)
  console.log(`New writes required: ${missing.length.toLocaleString('en-US')}`)
}

async function main() {
  const apply = process.argv.includes('--apply')
  const config = {
    apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
    authDomain: requiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: requiredEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: requiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requiredEnv('VITE_FIREBASE_APP_ID'),
  }
  const app = initializeApp(config, `historical-seed-${Date.now()}`)
  try {
    const firestore = getFirestore(app)
    const planned = plannedAttendance()
    const existingByDate = new Map()
    for (const serviceKey of HISTORY_DATES) {
      existingByDate.set(serviceKey, await existingSubmissionIds(firestore, serviceKey))
    }
    const missing = planned.filter((entry) => !existingByDate.get(entry.serviceKey)?.has(entry.memberId))
    printSummary(planned, missing)

    if (missing.length > MAX_FREE_TIER_WRITES) {
      throw new Error(`Refusing ${missing.length} writes because the safety cap is ${MAX_FREE_TIER_WRITES}.`)
    }

    if (!apply) {
      console.log('Dry run only. Re-run with --apply to write the missing records.')
      return
    }

    let completed = 0
    await applyWithConcurrency(missing, async (entry) => {
      await setDoc(doc(
        firestore,
        'attendanceServices',
        entry.serviceKey,
        'submissions',
        entry.memberId,
      ), {
        memberId: entry.memberId,
        displayNameSnapshot: entry.displayLabel,
        serviceKey: entry.serviceKey,
        servicePart: entry.servicePart,
        submittedAt: serverTimestamp(),
        createdAtClient: entry.createdAtClient,
      })
      completed += 1
      if (completed % 1_000 === 0 || completed === missing.length) {
        console.log(`Applied ${completed.toLocaleString('en-US')} / ${missing.length.toLocaleString('en-US')}`)
      }
    })
    console.log('Historical attendance seed complete.')
  } finally {
    await deleteApp(app)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
