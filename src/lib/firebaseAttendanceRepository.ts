import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  addDoc,
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
  where,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore'

import type { AttendanceRepository } from './attendanceRepository'
import {
  createFirestoreRepository,
  type FirestoreLike,
} from './firestoreRepository'

export type FirebaseWebConfig = Pick<
  FirebaseOptions,
  'apiKey' | 'authDomain' | 'projectId' | 'storageBucket' | 'messagingSenderId' | 'appId'
> & {
  emulatorHost?: string
}

const emulatorConnections = new WeakSet<Firestore>()

function joinPath(path: readonly string[]): string {
  return path.join('/')
}

function createFirestoreLike(firestore: Firestore): FirestoreLike {
  return {
    collection(path) {
      return collection(firestore, joinPath(path))
    },
    doc(path) {
      return doc(firestore, joinPath(path))
    },
    getDoc(reference) {
      return getDoc(reference as DocumentReference)
    },
    getDocs(reference) {
      return getDocs(reference as Query | CollectionReference)
    },
    addDoc(reference, data) {
      return addDoc(reference as CollectionReference, data as Record<string, unknown>).then((created) => ({
        id: created.id,
        ref: created,
      }))
    },
    query(reference, ...constraints) {
      return query(reference as CollectionReference, ...(constraints as QueryConstraint[]))
    },
    where(fieldPath, opStr, value) {
      return where(fieldPath, opStr, value)
    },
    orderBy(fieldPath, directionStr) {
      return orderBy(fieldPath, directionStr)
    },
    limit(value) {
      return limit(value)
    },
    serverTimestamp() {
      return serverTimestamp()
    },
    getCount(reference) {
      return getCountFromServer(reference as Query).then((snapshot) => snapshot.data().count)
    },
  }
}

export function createFirebaseAttendanceRepository(config: FirebaseWebConfig): AttendanceRepository {
  const app = getApps().length > 0 ? getApp() : initializeApp(config)
  const firestore = getFirestore(app)
  if (config.emulatorHost && !emulatorConnections.has(firestore)) {
    const [host, portText] = config.emulatorHost.split(':')
    const port = Number.parseInt(portText ?? '8080', 10)
    if (!host || !Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('VITE_FIRESTORE_EMULATOR_HOST must be host or host:port.')
    }
    connectFirestoreEmulator(firestore, host, port)
    emulatorConnections.add(firestore)
  }
  return createFirestoreRepository(createFirestoreLike(firestore))
}
