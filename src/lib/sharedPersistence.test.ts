import { describe, expect, it } from 'vitest'

import type { PublicMember } from '../data/members'
import {
  COLLECTIONS,
  CURRENT_SERVICE_KEY_DOCUMENT,
  createFirestoreRepository,
  type FirestoreDocumentSnapshot,
  type FirestoreLike,
} from './firestoreRepository'

type FakeReference = {
  kind: 'collection' | 'document' | 'query'
  path: readonly string[]
  constraints?: FakeConstraint[]
}

type FakeConstraint =
  | { kind: 'where'; fieldPath: string; op: '==' | 'in' | '>=' | '<='; value: unknown }
  | { kind: 'orderBy'; fieldPath: string; direction: 'asc' | 'desc' }
  | { kind: 'limit'; value: number }

type FakeDocument = {
  id: string
  data: Record<string, unknown>
}

type SharedBackend = {
  documents: Map<string, FakeDocument>
  firestore: FirestoreLike
}

function documentKey(path: readonly string[]): string {
  return path.join('/')
}

function createSharedBackend(): SharedBackend {
  const documents = new Map<string, FakeDocument>()
  const collectionReference = (path: readonly string[]): FakeReference => ({ kind: 'collection', path })
  const documentReference = (path: readonly string[]): FakeReference => ({ kind: 'document', path })

  const makeSnapshot = (document: FakeDocument | undefined): FirestoreDocumentSnapshot<unknown> => ({
    id: document?.id,
    exists: () => document !== undefined,
    data: () => document?.data,
  })

  function matchingDocuments(reference: FakeReference, applyLimit: boolean): FakeDocument[] {
    const collectionPath = reference.path
    const constraints = reference.constraints ?? []
    let matches = [...documents.entries()]
      .filter(([key]) => {
        const path = key.split('/')
        return path.length === collectionPath.length + 1
          && path.slice(0, collectionPath.length).every((part, index) => part === collectionPath[index])
      })
      .map(([, document]) => document)

    for (const constraint of constraints) {
      if (constraint.kind === 'where') {
        matches = matches.filter((document) => {
          const fieldValue = document.data[constraint.fieldPath]
          if (constraint.op === '==') {
            return fieldValue === constraint.value
          }
          if (constraint.op === 'in') {
            return Array.isArray(constraint.value) && constraint.value.includes(fieldValue)
          }
          if (constraint.op === '>=') {
            return String(fieldValue) >= String(constraint.value)
          }
          return String(fieldValue) <= String(constraint.value)
        })
      }
    }

    const orderConstraint = constraints.find((constraint) => constraint.kind === 'orderBy')
    if (orderConstraint?.kind === 'orderBy') {
      matches.sort((left, right) => {
        const leftValue = left.data[orderConstraint.fieldPath]
        const rightValue = right.data[orderConstraint.fieldPath]
        const leftTime = leftValue instanceof Date ? leftValue.getTime() : String(leftValue)
        const rightTime = rightValue instanceof Date ? rightValue.getTime() : String(rightValue)
        const comparison = leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0
        return orderConstraint.direction === 'desc' ? -comparison : comparison
      })
    }

    if (!orderConstraint) {
      matches.sort((left, right) => left.id.localeCompare(right.id))
    }

    const limitConstraint = constraints.find((constraint) => constraint.kind === 'limit')
    return applyLimit && limitConstraint?.kind === 'limit'
      ? matches.slice(0, limitConstraint.value)
      : matches
  }

  const firestore: FirestoreLike = {
    collection: collectionReference,
    doc: documentReference,
    async getDoc(reference) {
      const fakeReference = reference as FakeReference
      return makeSnapshot(documents.get(documentKey(fakeReference.path)))
    },
    async getDocs(reference) {
      const fakeReference = reference as FakeReference
      return {
        docs: matchingDocuments(fakeReference, true).map(makeSnapshot),
      }
    },
    async setDoc(reference, data) {
      const documentPath = (reference as FakeReference).path
      const id = documentPath.at(-1) as string
      const storedData = Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([key, value]) => [
        key,
        value && typeof value === 'object' && (value as { kind?: string }).kind === 'serverTimestamp'
          ? new Date('2026-08-10T01:00:00.000Z')
          : value,
      ]))
      documents.set(documentKey(documentPath), { id, data: storedData })
    },
    query(reference, ...constraints) {
      const fakeReference = reference as FakeReference
      return {
        kind: 'query',
        path: fakeReference.path,
        constraints: constraints as FakeConstraint[],
      } as FakeReference
    },
    where(fieldPath, op, value) {
      return { kind: 'where', fieldPath, op, value }
    },
    orderBy(fieldPath, direction = 'asc') {
      return { kind: 'orderBy', fieldPath, direction }
    },
    limit(value) {
      return { kind: 'limit', value }
    },
    serverTimestamp() {
      return { kind: 'serverTimestamp' }
    },
    async getCount(reference) {
      return matchingDocuments(reference as FakeReference, true).length
    },
  }

  return { documents, firestore }
}

function seedPublicData(backend: SharedBackend): void {
  const member: PublicMember = {
    memberId: 'm-001',
    displayLabel: '김현우 A',
    searchName: '김현우',
    sortKey: '김현우 a',
  }
  backend.documents.set(`${COLLECTIONS.members}/${member.memberId}`, {
    id: member.memberId,
    data: { ...member },
  })
  backend.documents.set(`${COLLECTIONS.serviceConfig}/${CURRENT_SERVICE_KEY_DOCUMENT}`, {
    id: CURRENT_SERVICE_KEY_DOCUMENT,
    data: { serviceKey: '2026-08-10' },
  })
  backend.documents.set(`${COLLECTIONS.serviceSessions}/2026-08-10`, {
    id: '2026-08-10',
    data: { serviceKey: '2026-08-10' },
  })
}

describe('Firestore repository shared persistence contract', () => {
  it('shares a submission across independent repository instances and fresh reads', async () => {
    const backend = createSharedBackend()
    seedPublicData(backend)
    const attendeeRepository = createFirestoreRepository(backend.firestore)
    const adminRepository = createFirestoreRepository(backend.firestore)

    await expect(attendeeRepository.searchRegisteredMembers('김현우')).resolves.toEqual([
      {
        memberId: 'm-001',
        displayLabel: '김현우 A',
        searchName: '김현우',
        sortKey: '김현우 a',
      },
    ])

    await attendeeRepository.submitAttendance({
      memberId: 'm-001',
      displayNameSnapshot: '김현우 A',
      serviceKey: '2026-08-10',
      servicePart: 1,
    })
    expect([...backend.documents.keys()]).toContain('attendanceServices/2026-08-10/submissions/m-001')

    const firstAdminRead = await adminRepository.getCurrentServiceAttendance()
    expect(firstAdminRead.totalCount).toBe(1)
    expect(firstAdminRead.rows).toEqual([
      expect.objectContaining({
        memberId: 'm-001',
        displayNameSnapshot: '김현우 A',
        serviceKey: '2026-08-10',
        submittedAt: new Date('2026-08-10T01:00:00.000Z'),
      }),
    ])

    const freshAdminRepository = createFirestoreRepository(backend.firestore)
    await expect(freshAdminRepository.getCurrentServiceAttendance()).resolves.toMatchObject({
      totalCount: 1,
      rows: [expect.objectContaining({ memberId: 'm-001', displayNameSnapshot: '김현우 A' })],
    })
  })
})
