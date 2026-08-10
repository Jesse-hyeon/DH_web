import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'

import AdminShell from './admin/AdminShell'
import { members, type PublicMember } from './data/members'
import {
  parseDemoSessionId,
  resolveDemoSessionState,
  submitDemoAttendance,
  type DemoSessionResolution,
} from './admin/demoSessionStore'
import type { AdminDemoSession, DemoSessionAttendance } from './admin/demoSessionStore'
import type { ServiceKey } from './domain/types'
import {
  type AttendanceRepository,
  type AttendanceSubmissionResult,
} from './lib/attendanceRepository'
import { getConfiguredAttendanceTargetUrl } from './lib/attendanceUrl'
import {
  searchRegisteredMembers,
} from './lib/demoAttendanceStore'
import { createRuntimeAttendanceRepository } from './lib/runtimeRepository'

type AttendeeStep = 'search' | 'confirm' | 'success'

interface AttendeeAppProps {
  repository?: AttendanceRepository
}

interface LoadedContext {
  members: PublicMember[]
  serviceKey: ServiceKey
}

function getInitialOnlineState(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function AttendeeApp({ repository }: AttendeeAppProps & { repository: AttendanceRepository }) {
  const [context, setContext] = useState<LoadedContext | null>(null)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState<PublicMember | null>(null)
  const [step, setStep] = useState<AttendeeStep>('search')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [successRecord, setSuccessRecord] = useState<AttendanceSubmissionResult | null>(null)
  const [isOnline, setIsOnline] = useState(getInitialOnlineState)

  useEffect(() => {
    let isActive = true

    async function loadContext() {
      setLoadError('')

      try {
        const [registeredMembers, serviceConfig] = await Promise.all([
          repository.listRegisteredMembers(),
          repository.getCurrentServiceConfig(),
        ])

        if (isActive) {
          setContext({
            members: registeredMembers,
            serviceKey: serviceConfig.serviceKey,
          })
        }
      } catch (error) {
        if (isActive) {
          setLoadError(error instanceof Error ? error.message : '출석 준비 중 문제가 발생했습니다.')
        }
      }
    }

    void loadContext()

    return () => {
      isActive = false
    }
  }, [repository])

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(getInitialOnlineState())

    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)

    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  const candidates = useMemo(
    () => (context ? searchRegisteredMembers(query, context.members) : []),
    [context, query],
  )

  const trimmedQuery = query.trim()
  const canSubmit = Boolean(selectedMember && context && isOnline && !isSubmitting)

  function resetToSearch() {
    setQuery('')
    setSelectedMember(null)
    setStep('search')
    setSubmitError('')
    setSuccessRecord(null)
  }

  function changeSelection() {
    setSelectedMember(null)
    setStep('search')
    setSubmitError('')
  }

  function selectMember(member: PublicMember) {
    setSelectedMember(member)
    setStep('confirm')
    setSubmitError('')
  }

  async function submitSelectedMember() {
    if (!selectedMember || !context || isSubmitting) {
      return
    }

    if (!isOnline) {
      setSubmitError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }

    setIsSubmitting(true)
    setSubmitError('')

    try {
      const draft = {
        memberId: selectedMember.memberId,
        displayNameSnapshot: selectedMember.displayLabel,
        serviceKey: context.serviceKey,
      }
      const record = await repository.submitAttendance(draft)

      setSuccessRecord({ ...draft, ...record })
      setStep('success')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '출석 제출에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  if (loadError) {
    return (
      <main className="app-shell">
        <section className="attend-panel" aria-labelledby="attend-title">
          <p className="eyebrow">출석 체크</p>
          <h1 id="attend-title">준비가 필요합니다</h1>
          <div className="notice notice-error" role="alert">
            {loadError}
          </div>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            다시 불러오기
          </button>
        </section>
      </main>
    )
  }

  if (!context) {
    return (
      <main className="app-shell">
        <section className="attend-panel" aria-labelledby="loading-title" aria-busy="true">
          <p className="eyebrow">출석 체크</p>
          <h1 id="loading-title">명단을 불러오고 있어요</h1>
          <p className="support-copy">잠시만 기다려 주세요.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="attend-panel" aria-labelledby="attend-title">
        <div className="top-row">
          <div>
            <p className="eyebrow">교회 출석 데모</p>
            <h1 id="attend-title">오늘 예배 출석</h1>
          </div>
          <span className="service-pill" aria-label={`예배일 ${context.serviceKey}`}>
            {context.serviceKey}
          </span>
        </div>

        {!isOnline && (
          <div className="notice notice-warning" role="status">
            오프라인 상태입니다. 연결 후 출석을 제출할 수 있어요.
          </div>
        )}

        {step === 'search' && (
          <form className="search-section" onSubmit={handleSearchSubmit}>
            <label className="field-label" htmlFor="member-search">
              이름 검색
            </label>
            <input
              id="member-search"
              className="search-input"
              autoComplete="off"
              inputMode="search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="예: 김현우"
            />

            {trimmedQuery.length === 0 ? (
              <div className="empty-state" role="status">
                등록된 이름을 검색한 뒤 본인을 선택해 주세요.
              </div>
            ) : candidates.length === 0 ? (
              <div className="empty-state" role="status">
                검색 결과가 없습니다. 이름을 다시 확인해 주세요.
              </div>
            ) : (
              <ul className="candidate-list" aria-label="검색 결과">
                {candidates.map((member) => (
                  <li key={member.memberId}>
                    <button
                      className="candidate-row"
                      type="button"
                      onClick={() => selectMember(member)}
                    >
                      <span>{member.displayLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        )}

        {step === 'confirm' && selectedMember && (
          <div className="confirm-section">
            <p className="section-label">선택한 이름</p>
            <div className="selected-card">
              <strong>{selectedMember.displayLabel}</strong>
            </div>

            {submitError && (
              <div className="notice notice-error" role="alert">
                {submitError}
              </div>
            )}

            <div className="button-stack">
              <button
                className="primary-button"
                type="button"
                onClick={submitSelectedMember}
                disabled={!canSubmit}
              >
                {isSubmitting ? '제출 중...' : '출석 제출하기'}
              </button>
              <button className="secondary-button" type="button" onClick={changeSelection} disabled={isSubmitting}>
                다시 검색하기
              </button>
            </div>
          </div>
        )}

        {step === 'success' && successRecord && (
          <div className="success-section">
            <div className="success-mark" aria-hidden="true">
              ✓
            </div>
            <p className="section-label">출석 완료</p>
            <h2>{successRecord.displayNameSnapshot}</h2>
            <p className="support-copy">{successRecord.serviceKey} 예배 출석이 기록되었습니다.</p>
            <button className="primary-button" type="button" onClick={resetToSearch}>
              다른 이름 검색하기
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

function DemoSessionState({ status }: { status: 'invalid' | 'inactive' }) {
  const isInactive = status === 'inactive'

  return (
    <main className="app-shell">
      <section
        className="attend-panel"
        data-testid={isInactive ? 'demo-session-closed' : 'demo-session-invalid'}
        aria-labelledby="demo-session-state-title"
      >
        <p className="eyebrow">QR 데모</p>
        <h1 id="demo-session-state-title">
          {isInactive ? '종료된 데모 세션입니다' : '유효하지 않은 데모 세션입니다'}
        </h1>
        <div className={`notice ${isInactive ? 'notice-warning' : 'notice-error'}`} role="status">
          {isInactive
            ? '이 세션은 더 이상 출석을 받을 수 없습니다.'
            : '이 QR 세션을 찾을 수 없습니다. 관리자 화면에서 새 QR을 생성해 주세요.'}
        </div>
      </section>
    </main>
  )
}

function DemoAttendeeApp({ session }: { session: AdminDemoSession }) {
  const [query, setQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState<PublicMember | null>(null)
  const [step, setStep] = useState<AttendeeStep>('search')
  const [submitError, setSubmitError] = useState('')
  const [successRecord, setSuccessRecord] = useState<DemoSessionAttendance | null>(null)

  const candidates = useMemo(() => searchRegisteredMembers(query, members), [query])
  const trimmedQuery = query.trim()
  const submittedMember = successRecord
    ? members.find((member) => member.memberId === successRecord.memberId)
    : undefined

  function selectMember(member: PublicMember) {
    setSelectedMember(member)
    setStep('confirm')
    setSubmitError('')
  }

  function changeSelection() {
    setSelectedMember(null)
    setStep('search')
    setSubmitError('')
  }

  async function submitSelectedMember() {
    if (!selectedMember) {
      return
    }

    setSubmitError('')
    const result = submitDemoAttendance({ sessionId: session.id, memberId: selectedMember.memberId })

    if (!result.accepted) {
      setSubmitError(result.reason === 'inactive-session'
        ? '이 데모 세션은 종료되어 출석을 받을 수 없습니다.'
        : '데모 세션을 확인한 뒤 다시 시도해 주세요.')
      return
    }

    setSuccessRecord(result.submission)
    setStep('success')
  }

  function resetToSearch() {
    setQuery('')
    setSelectedMember(null)
    setSubmitError('')
    setSuccessRecord(null)
    setStep('search')
  }

  return (
    <main className="app-shell">
      <section className="attend-panel" aria-labelledby="demo-attend-title">
        <div className="top-row">
          <div>
            <p className="eyebrow">교회 출석 데모</p>
            <h1 id="demo-attend-title">데모 출석 체크</h1>
          </div>
          <span className="service-pill" aria-label={`데모 세션 ${session.tag}`}>
            {session.part}부 · {session.date}
          </span>
        </div>
        <p className="support-copy">{session.label}</p>

        {step === 'search' && (
          <form className="search-section" onSubmit={(event) => event.preventDefault()}>
            <label className="field-label" htmlFor="demo-member-search">이름 검색</label>
            <input
              id="demo-member-search"
              className="search-input"
              autoComplete="off"
              inputMode="search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="예: 김현우"
            />

            {trimmedQuery.length === 0 ? (
              <div className="empty-state" role="status">등록된 이름을 검색한 뒤 본인을 선택해 주세요.</div>
            ) : candidates.length === 0 ? (
              <div className="empty-state" role="status">검색 결과가 없습니다. 이름을 다시 확인해 주세요.</div>
            ) : (
              <ul className="candidate-list" aria-label="검색 결과">
                {candidates.map((member) => (
                  <li key={member.memberId}>
                    <button className="candidate-row" type="button" onClick={() => selectMember(member)}>
                      <span>{member.displayLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        )}

        {step === 'confirm' && selectedMember && (
          <div className="confirm-section">
            <p className="section-label">선택한 이름</p>
            <div className="selected-card"><strong>{selectedMember.displayLabel}</strong></div>
            {submitError && <div className="notice notice-error" role="alert">{submitError}</div>}
            <div className="button-stack">
              <button className="primary-button" type="button" onClick={submitSelectedMember}>출석 제출하기</button>
              <button className="secondary-button" type="button" onClick={changeSelection}>다시 검색하기</button>
            </div>
          </div>
        )}

        {step === 'success' && successRecord && (
          <div className="success-section">
            <div className="success-mark" aria-hidden="true">✓</div>
            <p className="section-label">데모 출석 완료</p>
            <h2>{submittedMember?.displayLabel ?? '출석자'}</h2>
            <p className="support-copy">{session.label} 출석이 데모 세션에 기록되었습니다.</p>
            <button className="primary-button" type="button" onClick={resetToSearch}>다른 이름 검색하기</button>
          </div>
        )}
      </section>
    </main>
  )
}

function DemoAttendeeRoute({ resolution }: { resolution: DemoSessionResolution }) {
  if (resolution.status !== 'active' || !resolution.session) {
    return <DemoSessionState status={resolution.status} />
  }

  return <DemoAttendeeApp session={resolution.session} />
}

function UnsupportedRoute() {
  return (
    <main className="app-shell">
      <section className="attend-panel" aria-labelledby="route-title">
        <p className="eyebrow">출석 체크</p>
        <h1 id="route-title">사용할 수 없는 경로입니다</h1>
        <p className="support-copy">출석은 / 또는 /attend, 데모 관리는 /admin, QR 모니터는 /qr 경로에서 진행해 주세요.</p>
      </section>
    </main>
  )
}

function QrMonitorApp() {
  const target = getConfiguredAttendanceTargetUrl()

  if (!target.ok) {
    return (
      <main className="qr-shell">
        <section className="qr-panel qr-error-panel" aria-labelledby="qr-title">
          <p className="eyebrow">QR 모니터</p>
          <h1 id="qr-title">출석 QR 설정 필요</h1>
          <div className="notice notice-error" role="alert">
            {target.error}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="qr-shell">
      <section className="qr-panel" aria-labelledby="qr-title">
        <div className="qr-heading">
          <p className="eyebrow">QR 모니터</p>
          <h1 id="qr-title">출석 체크</h1>
        </div>
        <div className="qr-code-frame" aria-label="출석 체크 QR 코드">
          <QRCodeSVG
            data-testid="attendance-qr-code"
            value={target.url}
            size={328}
            level="M"
            marginSize={4}
            title="출석 체크 QR"
          />
        </div>
        <div className="qr-target">
          <p className="section-label">스캔 대상</p>
          <p className="qr-target-url">{target.url}</p>
        </div>
      </section>
    </main>
  )
}

function RuntimeConfigurationError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Firebase 출석 저장소 설정을 확인해 주세요.'

  return (
    <main className="app-shell">
      <section className="attend-panel" aria-labelledby="runtime-config-title">
        <p className="eyebrow">출석 저장소 설정</p>
        <h1 id="runtime-config-title">Firebase 연결이 필요합니다</h1>
        <div className="notice notice-error" role="alert">
          {message}
        </div>
        <p className="support-copy">
          로컬 테스트만 하려면 VITE_ATTENDANCE_MODE=demo를 명시적으로 설정해 주세요.
        </p>
      </section>
    </main>
  )
}

export default function App(props: AttendeeAppProps) {
  const path = window.location.pathname

  if (path === '/admin') {
    return <AdminShell />
  }

  if (path === '/qr') {
    return <QrMonitorApp />
  }

  if (path !== '/' && path !== '/attend') {
    return <UnsupportedRoute />
  }

  const demoSessionId = path === '/attend' ? parseDemoSessionId(window.location.search) : undefined

  if (demoSessionId) {
    return <DemoAttendeeRoute resolution={resolveDemoSessionState(demoSessionId)} />
  }

  if (props.repository) {
    return <AttendeeApp repository={props.repository} />
  }

  try {
    const repository = createRuntimeAttendanceRepository()
    return <AttendeeApp repository={repository} />
  } catch (error) {
    return <RuntimeConfigurationError error={error} />
  }
}
