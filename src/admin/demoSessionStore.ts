import type { AdminDemoDate, AdminDemoServicePart } from './types'

const DEMO_SESSION_PATH = '/attend?demoSessionId='
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export type DemoSessionStatus = 'active' | 'inactive'

export interface AdminDemoSession {
  id: string
  part: AdminDemoServicePart
  date: AdminDemoDate
  startsAt: string
  tag: string
  label: string
  status: DemoSessionStatus
  url: string
}

export interface CreateDemoSessionInput {
  part: AdminDemoServicePart
  date: AdminDemoDate
  startsAt: string
  tag?: string
  label?: string
}

export interface DemoSessionAttendance {
  id: string
  sessionId: string
  memberId: string
  date: AdminDemoDate
  part: AdminDemoServicePart
  status: 'attended'
  sequence: number
}

export type DemoSessionResolution =
  | { status: 'active'; session: AdminDemoSession }
  | { status: 'inactive'; session: AdminDemoSession }
  | { status: 'invalid'; session: undefined }

export type DemoAttendanceResult =
  | { accepted: true; submission: DemoSessionAttendance }
  | {
    accepted: false
    reason: 'invalid-session' | 'inactive-session' | 'invalid-member'
    submission: undefined
  }

let sessionSequence = 0
let submissionSequence = 0
const sessions: AdminDemoSession[] = []
const submissions: DemoSessionAttendance[] = []

function cloneSession(session: AdminDemoSession): AdminDemoSession {
  return { ...session }
}

function cloneSubmission(submission: DemoSessionAttendance): DemoSessionAttendance {
  return { ...submission }
}

function assertPart(part: number): asserts part is AdminDemoServicePart {
  if (part !== 1 && part !== 2 && part !== 3) {
    throw new RangeError('Demo session service part must be 1, 2, or 3.')
  }
}

function assertDate(date: AdminDemoDate): void {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new RangeError('Demo session date must be YYYY-MM-DD.')
  }

  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new RangeError('Demo session date must be a valid calendar date.')
  }
}

function assertStartsAt(startsAt: string): void {
  if (!TIME_PATTERN.test(startsAt)) {
    throw new RangeError('Demo session start time must be HH:MM.')
  }
}

function assertSessionInput(input: CreateDemoSessionInput): void {
  assertPart(input.part)
  assertDate(input.date)
  assertStartsAt(input.startsAt)
}

function sessionUrl(sessionId: string): string {
  return `${DEMO_SESSION_PATH}${sessionId}`
}

export function createDemoSessionUrl(sessionId: string): string {
  return sessionUrl(sessionId)
}

export const getDemoSessionUrl = createDemoSessionUrl

export function parseDemoSessionId(search: string): string | undefined {
  const query = search.startsWith('?') ? search.slice(1) : search
  const value = new URLSearchParams(query).get('demoSessionId')?.trim()
  return value && value.length > 0 ? value : undefined
}

export function hasDemoSessionId(search: string): boolean {
  return parseDemoSessionId(search) !== undefined
}

export function createDemoSession(input: CreateDemoSessionInput): AdminDemoSession {
  assertSessionInput(input)

  const id = `admin-demo-session-${String(++sessionSequence).padStart(4, '0')}`
  const tag = input.tag?.trim() || `service-${input.part}-${input.date}`
  const label = input.label?.trim() || `${tag} ${input.startsAt}`
  const session: AdminDemoSession = {
    id,
    part: input.part,
    date: input.date,
    startsAt: input.startsAt,
    tag,
    label,
    status: 'active',
    url: sessionUrl(id),
  }

  sessions.push(session)
  return cloneSession(session)
}

export const createSession = createDemoSession

/** Resolves only a known session; callers can inspect status to gate submissions. */
export function resolveDemoSession(sessionId: string | undefined): AdminDemoSession | undefined {
  if (!sessionId) {
    return undefined
  }

  const session = sessions.find((candidate) => candidate.id === sessionId)
  return session ? cloneSession(session) : undefined
}

export function resolveDemoSessionState(sessionId: string | undefined): DemoSessionResolution {
  const session = resolveDemoSession(sessionId)
  if (!session) {
    return { status: 'invalid', session: undefined }
  }

  return { status: session.status, session }
}

export const resolveSession = resolveDemoSession

export function deactivateDemoSession(sessionId: string): boolean {
  const session = sessions.find((candidate) => candidate.id === sessionId)
  if (!session) {
    return false
  }

  session.status = 'inactive'
  return true
}

export const deactivateSession = deactivateDemoSession

export function submitDemoAttendance(
  input: { sessionId: string; memberId: string } | string,
  memberId?: string,
): DemoAttendanceResult {
  const sessionId = typeof input === 'string' ? input : input.sessionId
  const submittedMemberId = typeof input === 'string' ? memberId : input.memberId
  const session = resolveDemoSession(sessionId)

  if (!session) {
    return { accepted: false, reason: 'invalid-session', submission: undefined }
  }

  if (session.status !== 'active') {
    return { accepted: false, reason: 'inactive-session', submission: undefined }
  }

  if (!submittedMemberId || submittedMemberId.trim().length === 0) {
    return { accepted: false, reason: 'invalid-member', submission: undefined }
  }

  const sequence = ++submissionSequence
  const submission: DemoSessionAttendance = {
    id: `admin-demo-attendance-${String(sequence).padStart(6, '0')}`,
    sessionId: session.id,
    memberId: submittedMemberId.trim(),
    date: session.date,
    part: session.part,
    status: 'attended',
    sequence,
  }

  submissions.push(submission)
  return { accepted: true, submission: cloneSubmission(submission) }
}

export const submitAttendance = submitDemoAttendance

export function listDemoSessions(options: { activeOnly?: boolean } = {}): ReadonlyArray<AdminDemoSession> {
  return sessions
    .filter((session) => !options.activeOnly || session.status === 'active')
    .map(cloneSession)
}

export const listSessions = listDemoSessions

export function listDemoSubmissions(sessionId?: string): ReadonlyArray<DemoSessionAttendance> {
  return submissions
    .filter((submission) => sessionId === undefined || submission.sessionId === sessionId)
    .map(cloneSubmission)
}

export const listDemoAttendance = listDemoSubmissions

/** Clears mutable generated session state, restoring the fixture-only baseline. */
export function resetDemoSessionStore(): void {
  sessionSequence = 0
  submissionSequence = 0
  sessions.length = 0
  submissions.length = 0
}

export const resetDemoSessionStoreForTest = resetDemoSessionStore

/** Clears generated submissions while preserving the generated session lifecycle. */
export function resetDemoSubmissions(): void {
  submissionSequence = 0
  submissions.length = 0
}
