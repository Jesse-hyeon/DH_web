import type {
  AttendanceDraft,
  AttendanceRecord as RepositoryAttendanceRecord,
  AttendanceRepository,
  AttendanceSubmissionResult as RepositorySubmissionResult,
  CurrentServiceAttendance,
} from './attendanceRepository'
import {
  boundedRepositoryLimit,
  MAX_ADMIN_ROWS,
  MAX_MEMBER_SEARCH_ROWS,
  MAX_MEMBER_HISTORY_ROWS,
  MIN_MEMBER_SEARCH_LENGTH,
  normalizeMemberSearchQuery,
} from './attendanceRepository'

export type FirestorePath = readonly string[]

export type FirestoreDocumentSnapshot<TData = unknown> = {
  exists(): boolean
  data(): TData | undefined
  id?: string
}

export type FirestoreQuerySnapshot<TData = unknown> = {
  docs: ReadonlyArray<FirestoreDocumentSnapshot<TData>>
}

export type FirestoreCollectionRef = unknown
export type FirestoreDocumentRef = unknown
export type FirestoreQueryRef = unknown
export type FirestoreConstraint = unknown
export type FirestoreServerTimestamp = unknown

export type FirestoreLike = {
  collection(path: FirestorePath): FirestoreCollectionRef
  doc(path: FirestorePath): FirestoreDocumentRef
  getDoc(ref: FirestoreDocumentRef): Promise<FirestoreDocumentSnapshot<unknown>>
  getDocs(ref: FirestoreQueryRef | FirestoreCollectionRef): Promise<FirestoreQuerySnapshot<unknown>>
  setDoc<TData>(
    ref: FirestoreDocumentRef,
    data: TData,
  ): Promise<void>
  query(ref: FirestoreCollectionRef, ...constraints: FirestoreConstraint[]): FirestoreQueryRef
  where(fieldPath: string, opStr: '==' | 'in' | '>=' | '<=', value: unknown): FirestoreConstraint
  orderBy(fieldPath: string, directionStr?: 'asc' | 'desc'): FirestoreConstraint
  limit(limit: number): FirestoreConstraint
  serverTimestamp(): FirestoreServerTimestamp
  getCount(ref: FirestoreQueryRef): Promise<number>
}

export type PublicMember = {
  id: string
  displayLabel: string
  cohort?: string
}

export type ServiceConfig = {
  serviceKey: string
}

export type AttendanceSubmissionDraft = AttendanceDraft
export type AttendanceSubmissionCreate = AttendanceSubmissionDraft & {
  submittedAt: FirestoreServerTimestamp
}
export type AttendanceSubmissionResult = RepositorySubmissionResult
export type AttendanceRecord = RepositoryAttendanceRecord

export const COLLECTIONS = {
  members: 'members',
  serviceConfig: 'serviceConfig',
  serviceSessions: 'serviceSessions',
  attendanceServices: 'attendanceServices',
  attendanceSubmissions: 'submissions',
} as const

export const CURRENT_SERVICE_KEY_DOCUMENT = 'currentServiceKey'

const PUBLIC_MEMBER_REQUIRED_FIELDS = ['memberId', 'displayLabel', 'searchName', 'sortKey'] as const
const PUBLIC_MEMBER_ALLOWED_FIELDS = [...PUBLIC_MEMBER_REQUIRED_FIELDS, 'cohort'] as const

export const ATTENDANCE_SUBMISSION_REQUIRED_FIELDS = [
  'memberId',
  'displayNameSnapshot',
  'serviceKey',
  'servicePart',
  'submittedAt',
] as const

export const ATTENDANCE_SUBMISSION_OPTIONAL_FIELDS = ['createdAtClient'] as const

export const ATTENDANCE_SUBMISSION_ALLOWED_FIELDS = [
  ...ATTENDANCE_SUBMISSION_REQUIRED_FIELDS,
  ...ATTENDANCE_SUBMISSION_OPTIONAL_FIELDS,
] as const

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isServicePart(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3
}

export function isAllowedAttendanceSubmissionField(field: string): boolean {
  return (ATTENDANCE_SUBMISSION_ALLOWED_FIELDS as readonly string[]).includes(field)
}

export function hasExactAttendanceSubmissionFields(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  const keys = Object.keys(value)
  return ATTENDANCE_SUBMISSION_REQUIRED_FIELDS.every((field) => keys.includes(field))
    && keys.every(isAllowedAttendanceSubmissionField)
}

function parseRegisteredMember(id: unknown, value: unknown): (PublicMember & { memberId: string; searchName?: string; sortKey?: string }) | null {
  if (!isRecord(value)) {
    return null
  }

  const keys = Object.keys(value)
  if (!isNonEmptyString(id)
    || !PUBLIC_MEMBER_REQUIRED_FIELDS.every((field) => keys.includes(field))
    || !keys.every((field) => (PUBLIC_MEMBER_ALLOWED_FIELDS as readonly string[]).includes(field))
    || value.memberId !== id
    || !isNonEmptyString(value.displayLabel)
    || !isNonEmptyString(value.searchName)
    || !isNonEmptyString(value.sortKey)
    || (value.cohort !== undefined && !isNonEmptyString(value.cohort))) {
    return null
  }

  return {
    id,
    memberId: id,
    displayLabel: value.displayLabel,
    searchName: value.searchName,
    sortKey: value.sortKey,
    ...(isNonEmptyString(value.cohort) ? { cohort: value.cohort } : {}),
  }
}

export function parsePublicMember(id: string, value: unknown): PublicMember | null {
  const member = parseRegisteredMember(id, value)
  return member ? {
    id: member.id,
    displayLabel: member.displayLabel,
    ...(member.cohort ? { cohort: member.cohort } : {}),
  } : null
}

export function parseServiceConfig(value: unknown): ServiceConfig | null {
  if (!isRecord(value) || !isNonEmptyString(value.serviceKey)) {
    return null
  }

  return {
    serviceKey: value.serviceKey,
  }
}

export function validateAttendanceSubmissionDraft(
  draft: AttendanceSubmissionDraft,
  member: PublicMember,
  config: ServiceConfig,
): AttendanceSubmissionDraft {
  if (!isNonEmptyString(draft.memberId)) {
    throw new Error('Attendance submission requires a memberId.')
  }

  if (!isNonEmptyString(draft.displayNameSnapshot)) {
    throw new Error('Attendance submission requires a displayNameSnapshot.')
  }

  if (!isNonEmptyString(draft.serviceKey)) {
    throw new Error('Attendance submission requires a serviceKey.')
  }

  if (draft.memberId !== member.id) {
    throw new Error('Attendance submission member does not match the selected member.')
  }

  if (draft.displayNameSnapshot !== member.displayLabel) {
    throw new Error('Attendance submission displayNameSnapshot must match the member displayLabel.')
  }

  if (draft.serviceKey !== config.serviceKey) {
    throw new Error('Attendance submission serviceKey must match the selected service session.')
  }

  if (!isServicePart(draft.servicePart)) {
    throw new Error('Attendance submission servicePart must be 1, 2, or 3.')
  }

  if (draft.createdAtClient !== undefined && !(draft.createdAtClient instanceof Date)) {
    throw new Error('Attendance submission createdAtClient must be a Date when provided.')
  }

  return {
    memberId: draft.memberId,
    displayNameSnapshot: draft.displayNameSnapshot,
    serviceKey: draft.serviceKey,
    servicePart: draft.servicePart,
    ...(draft.createdAtClient ? { createdAtClient: draft.createdAtClient } : {}),
  }
}

export function toAttendanceSubmissionCreate(
  draft: AttendanceSubmissionDraft,
  submittedAt: FirestoreServerTimestamp,
): AttendanceSubmissionCreate {
  return {
    memberId: draft.memberId,
    displayNameSnapshot: draft.displayNameSnapshot,
    serviceKey: draft.serviceKey,
    servicePart: draft.servicePart,
    submittedAt,
    ...(draft.createdAtClient ? { createdAtClient: draft.createdAtClient } : {}),
  }
}

/** Convert Firebase Timestamp-like values into the Date shape used by the UI. */
export function toUiDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : new Date(value.getTime())
  }

  if (isRecord(value) && typeof value.toDate === 'function') {
    const converted = value.toDate()
    return converted instanceof Date && !Number.isNaN(converted.getTime())
      ? new Date(converted.getTime())
      : undefined
  }

  if (isRecord(value) && typeof value.seconds === 'number') {
    const milliseconds = value.seconds * 1_000 + (
      typeof value.nanoseconds === 'number' ? value.nanoseconds / 1_000_000 : 0
    )
    const converted = new Date(milliseconds)
    return Number.isNaN(converted.getTime()) ? undefined : converted
  }

  return undefined
}

export function attendanceSubmissionsPath(serviceKey: string): FirestorePath {
  return [COLLECTIONS.attendanceServices, serviceKey, COLLECTIONS.attendanceSubmissions]
}

export function createFirestoreRepository(firestore: FirestoreLike): AttendanceRepository {
  const parseAttendance = (doc: FirestoreDocumentSnapshot<unknown>): AttendanceRecord | null => {
    const value = doc.data()
    const id = doc.id
    if (!isNonEmptyString(id) || !isRecord(value) || !isNonEmptyString(value.memberId)
      || !isNonEmptyString(value.displayNameSnapshot) || !isNonEmptyString(value.serviceKey)
      || !isServicePart(value.servicePart)) {
      return null
    }

    const submittedAt = toUiDate(value.submittedAt)
    if (!submittedAt) {
      return null
    }

    const createdAtClient = toUiDate(value.createdAtClient)
    return {
      id,
      memberId: value.memberId,
      displayNameSnapshot: value.displayNameSnapshot,
      serviceKey: value.serviceKey,
      servicePart: value.servicePart,
      submittedAt,
      ...(createdAtClient ? { createdAtClient } : {}),
    }
  }

  const listAttendance = async (
    serviceKey: string,
    constraints: FirestoreConstraint[],
    max: number,
  ): Promise<AttendanceRecord[]> => {
    const ref = firestore.collection(attendanceSubmissionsPath(serviceKey))
    const snapshot = await firestore.getDocs(firestore.query(ref, ...constraints, firestore.limit(max)))
    return snapshot.docs.map(parseAttendance).filter((record): record is AttendanceRecord => record !== null)
  }

  const getCurrentServiceConfig = async (): Promise<ServiceConfig> => {
    const configRef = firestore.doc([COLLECTIONS.serviceConfig, CURRENT_SERVICE_KEY_DOCUMENT])
    const snapshot = await firestore.getDoc(configRef)
    const config = snapshot.exists() ? parseServiceConfig(snapshot.data()) : null

    if (!config) {
      throw new Error('Current service config is missing or invalid.')
    }

    return config
  }

  const getServiceConfig = async (serviceKey: string): Promise<ServiceConfig> => {
    const sessionRef = firestore.doc([COLLECTIONS.serviceSessions, serviceKey])
    const snapshot = await firestore.getDoc(sessionRef)
    const config = snapshot.exists() ? parseServiceConfig(snapshot.data()) : null

    if (!config || config.serviceKey !== serviceKey) {
      throw new Error('Selected service session is missing or invalid.')
    }

    return config
  }

  const currentAttendanceConstraints = (): FirestoreConstraint[] => [
    firestore.orderBy('submittedAt', 'desc'),
  ]

  const getServiceAttendance = async (
    serviceKey: string,
    max?: number,
  ): Promise<CurrentServiceAttendance> => {
    const config = await getServiceConfig(serviceKey)
    const boundedLimit = boundedRepositoryLimit(max, MAX_ADMIN_ROWS, 'Admin rows')
    const constraints = currentAttendanceConstraints()
    const submissionsRef = firestore.collection(attendanceSubmissionsPath(config.serviceKey))
    const rowsQuery = firestore.query(submissionsRef, ...constraints, firestore.limit(boundedLimit))
    const countQuery = firestore.query(submissionsRef, firestore.limit(MAX_ADMIN_ROWS))
    const [snapshot, totalCount] = await Promise.all([
      firestore.getDocs(rowsQuery),
      firestore.getCount(countQuery),
    ])
    const rows = snapshot.docs
      .map(parseAttendance)
      .filter((record): record is AttendanceRecord => record !== null)

    return {
      serviceKey: config.serviceKey,
      totalCount,
      rows,
    }
  }

  const searchRegisteredMembers = async (queryValue: string, limitValue?: number) => {
    const normalizedQuery = normalizeMemberSearchQuery(queryValue)
    if (normalizedQuery.length < MIN_MEMBER_SEARCH_LENGTH) {
      return []
    }

    const resultLimit = boundedRepositoryLimit(limitValue, MAX_MEMBER_SEARCH_ROWS, 'Member search')
    const membersRef = firestore.collection([COLLECTIONS.members])
    const membersQuery = firestore.query(
      membersRef,
      firestore.where('searchName', '>=', normalizedQuery),
      firestore.where('searchName', '<=', `${normalizedQuery}\uf8ff`),
      firestore.orderBy('searchName', 'asc'),
      firestore.limit(resultLimit),
    )
    const snapshot = await firestore.getDocs(membersQuery)

    return snapshot.docs
      .map((doc) => parseRegisteredMember(doc.id, doc.data()))
      .filter((member): member is NonNullable<ReturnType<typeof parseRegisteredMember>> => member !== null)
      .map(({ memberId, displayLabel, searchName, sortKey, cohort }) => ({
        memberId,
        displayLabel,
        searchName,
        sortKey,
        ...(cohort ? { cohort } : {}),
      }))
  }

  return {
    async searchRegisteredMembers(query, limit) {
      return searchRegisteredMembers(query, limit)
    },

    getCurrentServiceConfig,
    getServiceConfig,

    async submitAttendance(draft: AttendanceSubmissionDraft): Promise<AttendanceSubmissionResult> {
      const memberRef = firestore.doc([COLLECTIONS.members, draft.memberId])
      const configRef = firestore.doc([COLLECTIONS.serviceSessions, draft.serviceKey])

      const [memberSnapshot, configSnapshot] = await Promise.all([
        firestore.getDoc(memberRef),
        firestore.getDoc(configRef),
      ])

      const memberSnapshotId = memberSnapshot.id
      const member = memberSnapshot.exists() && isNonEmptyString(memberSnapshotId)
        ? parsePublicMember(memberSnapshotId, memberSnapshot.data())
        : null
      const config = configSnapshot.exists() ? parseServiceConfig(configSnapshot.data()) : null

      if (!member) {
        throw new Error('Selected member is missing or invalid.')
      }

      if (!config) {
        throw new Error('Selected service session is missing or invalid.')
      }

      const validatedDraft = validateAttendanceSubmissionDraft(draft, member, config)
      const existing = await listAttendance(config.serviceKey, [
        firestore.where('memberId', '==', validatedDraft.memberId),
      ], 1)
      if (existing[0]) {
        return existing[0]
      }

      const submission = toAttendanceSubmissionCreate(validatedDraft, firestore.serverTimestamp())
      const submissionRef = firestore.doc([
        ...attendanceSubmissionsPath(config.serviceKey),
        validatedDraft.memberId,
      ])

      try {
        await firestore.setDoc(submissionRef, submission)
      } catch (error) {
        const concurrentlyCreated = await listAttendance(config.serviceKey, [
          firestore.where('memberId', '==', validatedDraft.memberId),
        ], 1)
        if (concurrentlyCreated[0]) {
          return concurrentlyCreated[0]
        }
        throw error
      }

      return { id: validatedDraft.memberId }
    },

    async getCurrentServiceAttendance(max?: number): Promise<CurrentServiceAttendance> {
      const config = await getCurrentServiceConfig()
      return getServiceAttendance(config.serviceKey, max)
    },

    getServiceAttendance,

    async listMemberHistory(memberId: string, max?: number): Promise<AttendanceRecord[]> {
      if (!isNonEmptyString(memberId)) {
        throw new Error('Member history requires a memberId.')
      }

      const config = await getCurrentServiceConfig()
      return listAttendance(config.serviceKey, [
        firestore.where('memberId', '==', memberId),
        firestore.orderBy('submittedAt', 'desc'),
      ], boundedRepositoryLimit(max, MAX_MEMBER_HISTORY_ROWS, 'Member history'))
    },
  }
}
