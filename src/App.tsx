import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'

import type { PublicMember } from './data/members'
import type { ServiceKey, ServicePart } from './domain/types'
import {
  MAX_MEMBER_SEARCH_ROWS,
  MIN_MEMBER_SEARCH_LENGTH,
  normalizeMemberSearchQuery,
  type AttendanceRepository,
  type AttendanceSubmissionResult,
} from './lib/attendanceRepository'
import {
  parseAttendanceServiceDate,
  parseAttendanceServicePart,
} from './lib/attendanceUrl'
import { createRuntimeAttendanceRepository } from './lib/runtimeRepository'

type AttendeeStep = 'search' | 'confirm' | 'success'

interface AttendeeAppProps {
  repository?: AttendanceRepository
}

interface LoadedContext {
  serviceKey: ServiceKey
}

const MEMBER_SEARCH_DEBOUNCE_MS = 300
const AdminShell = lazy(() => import('./admin/AdminShell'))

function getInitialOnlineState(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function AttendeeApp({ repository, serviceDate, servicePart }: AttendeeAppProps & {
  repository: AttendanceRepository
  serviceDate: ServiceKey
  servicePart: ServicePart
}) {
  const [context, setContext] = useState<LoadedContext | null>(null)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<PublicMember[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
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
        const serviceConfig = await repository.getServiceConfig(serviceDate)

        if (isActive) {
          setContext({
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
  }, [repository, serviceDate])

  useEffect(() => {
    const normalizedQuery = normalizeMemberSearchQuery(query)
    if (step !== 'search' || normalizedQuery.length < MIN_MEMBER_SEARCH_LENGTH) {
      setCandidates([])
      setIsSearching(false)
      setSearchError('')
      return
    }

    setCandidates([])
    setIsSearching(true)
    setSearchError('')
    let isActive = true
    const timeoutId = window.setTimeout(() => {
      void repository.searchRegisteredMembers(normalizedQuery, MAX_MEMBER_SEARCH_ROWS)
        .then((members) => {
          if (isActive) {
            setCandidates(members)
          }
        })
        .catch((error) => {
          if (isActive) {
            setCandidates([])
            setSearchError(error instanceof Error ? error.message : '이름 검색에 실패했습니다.')
          }
        })
        .finally(() => {
          if (isActive) {
            setIsSearching(false)
          }
        })
    }, MEMBER_SEARCH_DEBOUNCE_MS)

    return () => {
      isActive = false
      window.clearTimeout(timeoutId)
    }
  }, [query, repository, step])

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(getInitialOnlineState())

    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)

    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  const normalizedQuery = normalizeMemberSearchQuery(query)
  const canSubmit = Boolean(selectedMember && context && isOnline && !isSubmitting)

  function resetToSearch() {
    setQuery('')
    setCandidates([])
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
        servicePart,
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
          <h1 id="attend-title">대흥교회 출석</h1>
          <span className="service-pill" aria-label={`예배일 ${context.serviceKey} ${servicePart}부`}>
            {context.serviceKey} · {servicePart}부
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
              placeholder="이름을 검색해 주세요."
            />

            {normalizedQuery.length < MIN_MEMBER_SEARCH_LENGTH ? (
              <div className="empty-state" role="status">
                이름을 두 글자 이상 입력해 주세요.
              </div>
            ) : isSearching ? (
              <div className="empty-state" role="status">검색 중...</div>
            ) : searchError ? (
              <div className="notice notice-error" role="alert">{searchError}</div>
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
                      {member.cohort ? <small>{member.cohort}</small> : null}
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
            <p className="support-copy">
              {successRecord.serviceKey} · {successRecord.servicePart}부 예배 출석이 기록되었습니다.
            </p>
            <button className="primary-button" type="button" onClick={resetToSearch}>
              확인
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

function UnsupportedRoute() {
  return (
    <main className="app-shell">
      <section className="attend-panel" aria-labelledby="route-title">
        <p className="eyebrow">출석 체크</p>
        <h1 id="route-title">사용할 수 없는 경로입니다</h1>
        <p className="support-copy">출석은 안내된 QR을 스캔하고, 관리는 /admin 경로에서 진행해 주세요.</p>
      </section>
    </main>
  )
}

function InvalidAttendanceQr() {
  return (
    <main className="app-shell">
      <section className="attend-panel" aria-labelledby="invalid-qr-title">
        <p className="eyebrow">출석 체크</p>
        <h1 id="invalid-qr-title">유효한 출석 QR이 필요합니다</h1>
        <p className="support-copy">예배일과 예배 부서가 포함된 QR을 다시 스캔해 주세요.</p>
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
    let repository: AttendanceRepository
    if (props.repository) {
      repository = props.repository
    } else {
      try {
        repository = createRuntimeAttendanceRepository()
      } catch (error) {
        return <RuntimeConfigurationError error={error} />
      }
    }

    return (
      <Suspense fallback={<main className="app-shell" aria-busy="true" />}>
        <AdminShell repository={repository} />
      </Suspense>
    )
  }

  if (path !== '/attend') {
    return <UnsupportedRoute />
  }

  const serviceDate = parseAttendanceServiceDate(window.location.search)
  const servicePart = parseAttendanceServicePart(window.location.search)

  if (!serviceDate || !servicePart) {
    return <InvalidAttendanceQr />
  }

  if (props.repository) {
    return <AttendeeApp repository={props.repository} serviceDate={serviceDate} servicePart={servicePart} />
  }

  try {
    const repository = createRuntimeAttendanceRepository()
    return <AttendeeApp repository={repository} serviceDate={serviceDate} servicePart={servicePart} />
  } catch (error) {
    return <RuntimeConfigurationError error={error} />
  }
}
