import { spawnSync } from 'node:child_process'
import process from 'node:process'

import { getApps, initializeApp } from 'firebase/app'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'

const FIREBASE_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

function skip(reason) {
  console.log(`test:emulator skipped: ${reason}`)
}

function commandAvailable(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' })
  return result.status === 0
}

function parseEmulatorHost(value) {
  const separator = value.lastIndexOf(':')
  const host = separator === -1 ? value : value.slice(0, separator)
  const port = Number.parseInt(separator === -1 ? '8080' : value.slice(separator + 1), 10)
  return host && Number.isInteger(port) && port > 0 && port <= 65_535 ? { host, port } : null
}

const emulatorHost = process.env.VITE_FIRESTORE_EMULATOR_HOST?.trim()
if (!emulatorHost) {
  skip('VITE_FIRESTORE_EMULATOR_HOST is not set.')
  process.exit(0)
}

if (!commandAvailable('firebase')) {
  skip('Firebase CLI is not installed; no emulator tooling is available.')
  process.exit(0)
}

if (!commandAvailable('java')) {
  skip('Java is not installed; the Firestore emulator cannot run.')
  process.exit(0)
}

const parsedHost = parseEmulatorHost(emulatorHost)
if (!parsedHost) {
  skip('VITE_FIRESTORE_EMULATOR_HOST must be host or host:port.')
  process.exit(0)
}

const missingKeys = FIREBASE_KEYS.filter((key) => !process.env[key]?.trim())
if (missingKeys.length > 0) {
  skip(`Firebase Web SDK configuration is incomplete: ${missingKeys.join(', ')}.`)
  process.exit(0)
}

const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}
const app = getApps().length > 0 ? getApps()[0] : initializeApp(config)
const firestore = getFirestore(app)
connectFirestoreEmulator(firestore, parsedHost.host, parsedHost.port)

try {
  const membersSnapshot = await getDocs(query(collection(firestore, 'members'), limit(10)))
  const configSnapshot = await getDoc(doc(firestore, 'serviceConfig', 'currentServiceKey'))

  if (!configSnapshot.exists() || membersSnapshot.empty) {
    skip('emulator is reachable but dummy members/currentServiceKey seed data is absent.')
    process.exit(0)
  }

  const serviceKey = configSnapshot.data().serviceKey
  const member = membersSnapshot.docs[0].data()
  if (typeof serviceKey !== 'string' || typeof member.memberId !== 'string' || typeof member.displayLabel !== 'string') {
    skip('emulator seed data is present but does not match the public dummy data shape.')
    process.exit(0)
  }

  const submissions = collection(
    firestore,
    'attendanceServices',
    serviceKey,
    'submissions',
  )
  const created = doc(submissions, member.memberId)
  const existingSubmission = await getDoc(created)
  if (!existingSubmission.exists()) {
    await setDoc(created, {
      memberId: member.memberId,
      displayNameSnapshot: member.displayLabel,
      serviceKey,
      servicePart: 1,
      submittedAt: serverTimestamp(),
    })
  }
  const rowsSnapshot = await getDocs(query(submissions, orderBy('submittedAt', 'desc'), limit(2000)))
  const countSnapshot = await getCountFromServer(query(submissions, limit(2000)))
  const historySnapshot = await getDocs(query(
    submissions,
    where('memberId', '==', member.memberId),
    orderBy('submittedAt', 'desc'),
    limit(25),
  ))

  if (!rowsSnapshot.docs.some((entry) => entry.id === created.id)
    || countSnapshot.data().count < 1
    || !historySnapshot.docs.some((entry) => entry.id === created.id)) {
    throw new Error('created submission was not visible through the bounded current-service queries.')
  }

  console.log('test:emulator passed: Web SDK create, current-service list/count, and member history queries.')
} catch (error) {
  console.error(`test:emulator failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
