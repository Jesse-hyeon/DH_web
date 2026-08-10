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
  MAX_MEMBER_HISTORY_ROWS,
  MAX_REGISTERED_MEMBER_ROWS,
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

export type FirestoreAddDocResult = {
  id: string
  ref?: FirestoreDocumentRef
}

export type FirestoreLike = {
  collection(path: FirestorePath): FirestoreCollectionRef
  doc(path: FirestorePath): FirestoreDocumentRef
  getDoc(ref: FirestoreDocumentRef): Promise<FirestoreDocumentSnapshot<unknown>>
  getDocs(ref: FirestoreQueryRef | FirestoreCollectionRef): Promise<FirestoreQuerySnapshot<unknown>>
  addDoc<TData>(
    ref: FirestoreCollectionRef,
    data: TData,
  ): Promise<FirestoreAddDocResult>
  query(ref: FirestoreCollectionRef, ...constraints: FirestoreConstraint[]): FirestoreQueryRef
  where(fieldPath: string, opStr: '==' | 'in', value: unknown): FirestoreConstraint
  orderBy(fieldPath: string, directionStr?: 'asc' | 'desc'): FirestoreConstraint
  limit(limit: number): FirestoreConstraint
  serverTimestamp(): FirestoreServerTimestamp
  getCount(ref: FirestoreQueryRef): Promise<number>
}

export type PublicMember = {
  id: string
  displayLabel: string
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
  attendanceServices: 'attendanceServices',
  attendanceSubmissions: 'submissions',
} as const

export const CURRENT_SERVICE_KEY_DOCUMENT = 'currentServiceKey'

const PUBLIC_MEMBER_FIELDS = ['memberId', 'displayLabel', 'searchName', 'sortKey'] as const

export const ATTENDANCE_SUBMISSION_REQUIRED_FIELDS = [
  'memberId',
  'displayNameSnapshot',
  'serviceKey',
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

function hasExactFields(keys: readonly string[], fields: readonly string[]): boolean {
  return keys.length === fields.length && fields.every((field) => keys.includes(field))
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
    || !hasExactFields(keys, PUBLIC_MEMBER_FIELDS)
    || value.memberId !== id
    || !isNonEmptyString(value.displayLabel)
    || !isNonEmptyString(value.searchName)
    || !isNonEmptyString(value.sortKey)) {
    return null
  }

  return {
    id,
    memberId: id,
    displayLabel: value.displayLabel,
    searchName: value.searchName,
    sortKey: value.sortKey,
  }
}

export function parsePublicMember(id: string, value: unknown): PublicMember | null {
  const member = parseRegisteredMember(id, value)
  return member ? { id: member.id, displayLabel: member.displayLabel } : null
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
    throw new Error('Attendance submission serviceKey must match the current service config.')
  }

  if (draft.createdAtClient !== undefined && !(draft.createdAtClient instanceof Date)) {
    throw new Error('Attendance submission createdAtClient must be a Date when provided.')
  }

  return {
    memberId: draft.memberId,
    displayNameSnapshot: draft.displayNameSnapshot,
    serviceKey: draft.serviceKey,
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
      || !isNonEmptyString(value.displayNameSnapshot) || !isNonEmptyString(value.serviceKey)) {
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

  const currentAttendanceConstraints = (): FirestoreConstraint[] => [
    firestore.orderBy('submittedAt', 'desc'),
  ]

  const listRegisteredMembers = async () => {
    const membersRef = firestore.collection([COLLECTIONS.members])
    const membersQuery = firestore.query(
      membersRef,
      firestore.orderBy('displayLabel', 'asc'),
      firestore.limit(MAX_REGISTERED_MEMBER_ROWS),
    )
    const snapshot = await firestore.getDocs(membersQuery)

    return snapshot.docs
      .map((doc) => parseRegisteredMember(doc.id, doc.data()))
      .filter((member): member is NonNullable<ReturnType<typeof parseRegisteredMember>> => member !== null)
      .map(({ memberId, displayLabel, searchName, sortKey }) => ({
        memberId,
        displayLabel,
        searchName,
        sortKey,
      }))
  }

  return {
    async listRegisteredMembers() {
      return listRegisteredMembers()
    },

    getCurrentServiceConfig,

    async submitAttendance(draft: AttendanceSubmissionDraft): Promise<AttendanceSubmissionResult> {
      const memberRef = firestore.doc([COLLECTIONS.members, draft.memberId])
      const configRef = firestore.doc([COLLECTIONS.serviceConfig, CURRENT_SERVICE_KEY_DOCUMENT])

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
        throw new Error('Current service config is missing or invalid.')
      }

      const validatedDraft = validateAttendanceSubmissionDraft(draft, member, config)
      const submission = toAttendanceSubmissionCreate(validatedDraft, firestore.serverTimestamp())
      const submissionsRef = firestore.collection(attendanceSubmissionsPath(config.serviceKey))
      const created = await firestore.addDoc(submissionsRef, submission)

      return { id: created.id }
    },

    async getCurrentServiceAttendance(max?: number): Promise<CurrentServiceAttendance> {
      const config = await getCurrentServiceConfig()
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
    },

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
