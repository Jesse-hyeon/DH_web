import { useEffect, useMemo, useState } from 'react'

import {
  MAX_ADMIN_ROWS,
  type AttendanceRepository,
  type CurrentServiceAttendance,
} from '../lib/attendanceRepository'
import type { ServiceKey } from '../domain/types'
import { ADMIN_DEMO_FIXTURES } from './demoData'
import { selectAttendanceRows, selectSessionTotals, type AdminDemoPeriod } from './selectors'
import type {
  AdminDemoAggregateInput,
  AdminDemoAttendanceEvent,
  AdminDemoFixtureBundle,
  AdminDemoServicePart,
  AdminDemoServiceSession,
} from './types'

const MAX_VISIBLE_ATTENDANCE_ROWS = 100
const PERIOD_OPTIONS: ReadonlyArray<{ value: AdminDemoPeriod; label: string }> = [
  { value: 'last-4-weeks', label: '최근 4주' },
  { value: 'last-3-months', label: '최근 3개월' },
  { value: 'all', label: '전체 기간' },
]

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatDate(value: string): string {
  return value.replace(/-/g, '.')
}

function primaryAttendedPart(events: ReadonlyArray<AdminDemoAttendanceEvent>): AdminDemoServicePart | undefined {
  const counts = new Map<AdminDemoServicePart, number>()
  for (const event of events) {
    if (event.status === 'attended') {
      counts.set(event.part, (counts.get(event.part) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort(([partA, countA], [partB, countB]) => countB - countA || partA - partB)[0]?.[0]
}

function fixtureInput(fixtures: AdminDemoFixtureBundle): AdminDemoAggregateInput {
  return {
    referenceDate: fixtures.referenceDate,
    members: fixtures.members,
    sessions: fixtures.sessions,
    events: fixtures.events,
  }
}

export function mergeCurrentServiceAttendance(
  fixtures: AdminDemoFixtureBundle,
  currentAttendance: CurrentServiceAttendance | null,
): AdminDemoAggregateInput {
  const baseInput = fixtureInput(fixtures)
  if (!currentAttendance) {
    return baseInput
  }

  const membersById = new Set(fixtures.members.map((member) => member.id))
  const existingCurrentSessions = fixtures.sessions.filter(
    (session) => session.date === currentAttendance.serviceKey,
  )
  const currentWeekNumber = existingCurrentSessions[0]?.weekNumber
    ?? Math.max(...fixtures.sessions.map((session) => session.weekNumber), 0) + 1
  const currentSessions: ReadonlyArray<AdminDemoServiceSession> = existingCurrentSessions.length > 0
    ? existingCurrentSessions
    : ([1, 2, 3] as const).map((part) => ({
      id: `firebase-session-${currentAttendance.serviceKey}-p${part}`,
      part,
      date: currentAttendance.serviceKey,
      startsAt: part === 1 ? '07:30' : part === 2 ? '09:30' : '11:30',
      weekNumber: currentWeekNumber,
      label: `${currentAttendance.serviceKey} ${part}부`,
    }))
  const sessions = existingCurrentSessions.length > 0
    ? [...fixtures.sessions]
    : [...fixtures.sessions, ...currentSessions]
  const currentDatePlaceholders: AdminDemoAttendanceEvent[] = existingCurrentSessions.length > 0
    ? []
    : fixtures.members.flatMap((member) => currentSessions.map((session) => ({
      id: `firebase-placeholder-${member.id}-${session.part}`,
      memberId: member.id,
      sessionId: session.id,
      date: session.date,
      part: session.part,
      weekNumber: session.weekNumber,
      status: 'missed' as const,
    })))
  const input: AdminDemoAggregateInput = {
    ...baseInput,
    referenceDate: currentAttendance.serviceKey > baseInput.referenceDate
      ? currentAttendance.serviceKey
      : baseInput.referenceDate,
    sessions,
    events: [...fixtures.events, ...currentDatePlaceholders],
  }
  const sessionsByPart = new Map(currentSessions.map((session) => [session.part, session] as const))

  if (currentAttendance.rows.length === 0) {
    return input
  }

  const firstAttendanceByMember = new Map<string, (typeof currentAttendance.rows)[number]>()
  const sortedRows = [...currentAttendance.rows].sort((left, right) => {
    const leftTime = left.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    const rightTime = right.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    return leftTime - rightTime || left.id.localeCompare(right.id)
  })
  for (const row of sortedRows) {
    if (membersById.has(row.memberId) && !firstAttendanceByMember.has(row.memberId)) {
      firstAttendanceByMember.set(row.memberId, row)
    }
  }

  const liveMemberIds = new Set(firstAttendanceByMember.keys())
  const events = input.events.map((event) => (
    event.date === currentAttendance.serviceKey && liveMemberIds.has(event.memberId)
      ? { ...event, status: 'missed' as const }
      : event
  ))

  for (const row of firstAttendanceByMember.values()) {
    const part = row.servicePart
    const session = sessionsByPart.get(part)
    if (!session) {
      continue
    }

    events.push({
      id: `firebase-${row.id}`,
      memberId: row.memberId,
      sessionId: session.id,
      date: session.date,
      part,
      weekNumber: session.weekNumber,
      status: 'attended',
    })
  }

  return { ...input, events }
}

interface AttendanceDateColumn {
  date: string
  sessionIds: ReadonlyArray<string>
}

function AttendanceStatus({
  events,
  sessionIds,
}: {
  events: ReadonlyArray<AdminDemoAttendanceEvent>
  sessionIds: ReadonlyArray<string>
}) {
  const attendedParts = events
    .filter((event) => sessionIds.includes(event.sessionId) && event.status === 'attended')
    .map((event) => event.part)
    .sort((left, right) => left - right)
  const isAttended = attendedParts.length > 0
  const label = isAttended ? `${attendedParts.join('부, ')}부 출석` : '미확인'

  return (
    <span
      className={`attendance-status ${isAttended ? 'is-attended' : 'is-unrecorded'}`}
      aria-label={label}
      title={label}
    >
      {isAttended ? (
        <>
          <span aria-hidden="true">✓</span>
          <span className="attendance-status-parts">{attendedParts.map((part) => `${part}부`).join(' · ')}</span>
        </>
      ) : '·'}
    </span>
  )
}

export interface AttendanceManagementProps {
  fixtures?: AdminDemoFixtureBundle
  repository?: AttendanceRepository
  serviceDate?: ServiceKey
}

export default function AttendanceManagement({
  fixtures = ADMIN_DEMO_FIXTURES,
  repository,
  serviceDate,
}: AttendanceManagementProps) {
  const [currentAttendance, setCurrentAttendance] = useState<CurrentServiceAttendance | null>(null)
  const input = useMemo(
    () => mergeCurrentServiceAttendance(fixtures, currentAttendance),
    [currentAttendance, fixtures],
  )
  const [period, setPeriod] = useState<AdminDemoPeriod>('last-4-weeks')
  const [memberQuery, setMemberQuery] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [liveAttendanceError, setLiveAttendanceError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const filterOptions = useMemo(() => ({ period, servicePart: 'all' as const }), [period])
  const rows = useMemo(() => selectAttendanceRows(input, filterOptions), [filterOptions, input])
  const sessionTotals = useMemo(() => selectSessionTotals(input, filterOptions), [filterOptions, input])
  const allRows = useMemo(
    () => selectAttendanceRows(input, { period: 'all', servicePart: 'all' }),
    [input],
  )
  const dateColumns = useMemo<ReadonlyArray<AttendanceDateColumn>>(() => {
    const columns = new Map<string, string[]>()
    for (const total of sessionTotals) {
      const sessionIds = columns.get(total.session.date) ?? []
      sessionIds.push(total.session.id)
      columns.set(total.session.date, sessionIds)
    }
    return [...columns].map(([date, sessionIds]) => ({ date, sessionIds }))
  }, [sessionTotals])
  const matchingRows = useMemo(() => {
    const normalizedQuery = memberQuery.trim().toLocaleLowerCase()
    if (!normalizedQuery) {
      return rows
    }

    return rows.filter((row) => row.member.label.toLocaleLowerCase().includes(normalizedQuery))
  }, [memberQuery, rows])
  const visibleRows = matchingRows.slice(0, MAX_VISIBLE_ATTENDANCE_ROWS)
  const selectedDetailRow = useMemo(
    () => allRows.find((row) => row.member.id === selectedMemberId),
    [allRows, selectedMemberId],
  )
  const selectedPrimaryPart = selectedDetailRow ? primaryAttendedPart(selectedDetailRow.events) : undefined

  useEffect(() => {
    if (!repository) {
      return undefined
    }

    let isActive = true
    setIsRefreshing(true)
    setLiveAttendanceError('')
    const attendanceRequest = serviceDate
      ? repository.getServiceAttendance(serviceDate, MAX_ADMIN_ROWS)
      : repository.getCurrentServiceAttendance(MAX_ADMIN_ROWS)
    void attendanceRequest
      .then((attendance) => {
        if (isActive) {
          setCurrentAttendance(attendance)
        }
      })
      .catch(() => {
        if (isActive) {
          setCurrentAttendance(null)
          setLiveAttendanceError('실시간 출석 정보를 불러오지 못했습니다. 화면을 새로고침해 주세요.')
        }
      })
      .finally(() => {
        if (isActive) {
          setIsRefreshing(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [refreshKey, repository, serviceDate])

  useEffect(() => {
    if (!selectedDetailRow) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedMemberId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedDetailRow])

  return (
    <section className="attendance-management" data-testid="attendance-management" aria-label="출석 관리">
      <section className="admin-dashboard-panel attendance-table-panel" aria-labelledby="attendance-table-title">
        <div className="admin-panel-heading">
          <h2 id="attendance-table-title">교인별 출석 현황</h2>
          <div className="attendance-table-controls">
            <fieldset className="attendance-period-control">
              <legend>기간</legend>
              <div className="attendance-period-options" role="group" aria-label="조회 기간">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    className={period === option.value ? 'is-selected' : undefined}
                    data-period={option.value}
                    key={option.value}
                    type="button"
                    aria-pressed={period === option.value}
                    onClick={() => setPeriod(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="attendance-member-search">
              <span className="sr-only">회원 검색</span>
              <input
                id="attendance-member-search"
                aria-label="회원 검색"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="이름 검색"
              />
            </label>
            <button
              className="attendance-refresh-button"
              type="button"
              disabled={isRefreshing}
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              {isRefreshing ? '불러오는 중' : '출석 새로고침'}
            </button>
          </div>
        </div>

        {liveAttendanceError ? (
          <p className="admin-empty-state" role="alert">{liveAttendanceError}</p>
        ) : null}

        {matchingRows.length === 0 ? (
          <p className="admin-empty-state" role="status">검색 결과가 없습니다.</p>
        ) : (
          <div className="attendance-table-scroll">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th scope="col">회원</th>
                  {dateColumns.map((column) => (
                    <th scope="col" key={column.date}>
                      {formatDate(column.date)}
                    </th>
                  ))}
                  <th scope="col">출석률</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.member.id}>
                    <th scope="row">
                      <button
                        className="attendance-member-button"
                        type="button"
                        aria-label={`${row.member.label} 상세 정보`}
                        onClick={() => setSelectedMemberId(row.member.id)}
                      >
                        <strong>{row.member.label}</strong>
                        <span>{row.member.cohort}</span>
                      </button>
                    </th>
                    {dateColumns.map((column) => (
                      <td key={column.date}>
                        <AttendanceStatus events={row.events} sessionIds={column.sessionIds} />
                      </td>
                    ))}
                    <td className="attendance-rate-cell">
                      <div className="attendance-rate-display">
                        <div className="attendance-rate-track" aria-hidden="true">
                          <div style={{ width: `${Math.round(row.rate * 100)}%` }} />
                        </div>
                        <span>{formatRate(row.rate)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedDetailRow ? (
        <div
          className="attendance-detail-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedMemberId(null)
            }
          }}
        >
          <section
            className="attendance-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-detail-title"
          >
            <div className="attendance-detail-heading">
              <div>
                <p className="admin-panel-kicker">교인 상세</p>
                <h2 id="attendance-detail-title">{selectedDetailRow.member.label}</h2>
                <p>{selectedDetailRow.member.cohort}</p>
              </div>
              <button
                className="attendance-detail-close"
                type="button"
                aria-label="상세 정보 닫기"
                onClick={() => setSelectedMemberId(null)}
              >
                ×
              </button>
            </div>

            <div className="attendance-detail-summary">
              <div>
                <span>등록 시점</span>
                <strong>{formatDate(selectedDetailRow.member.joinedOn)}</strong>
              </div>
              <div>
                <span>출석률</span>
                <strong>{formatRate(selectedDetailRow.rate)}</strong>
              </div>
              <div>
                <span>주로 참석하는 예배</span>
                <strong>{selectedPrimaryPart ? `${selectedPrimaryPart}부 예배` : '기록 없음'}</strong>
              </div>
              <div>
                <span>출석 일수</span>
                <strong>{selectedDetailRow.attendedCount}일</strong>
              </div>
            </div>

            <section className="attendance-detail-trend" aria-labelledby="attendance-detail-trend-title">
              <div className="attendance-detail-section-heading">
                <h3 id="attendance-detail-trend-title">출석 추이</h3>
                <span>전체 기간</span>
              </div>
              <div className="attendance-detail-timeline">
                {selectedDetailRow.events.map((event) => {
                  const isAttended = event.status === 'attended'
                  return (
                    <div className="attendance-detail-date" key={event.id}>
                      <small>{event.date.slice(5).replace('-', '.')}</small>
                      <div className={`attendance-detail-status ${isAttended ? 'is-attended' : 'is-unrecorded'}`}>
                        <span>{isAttended ? '✓' : '·'}</span>
                      </div>
                      <strong>{isAttended ? `${event.part}부` : '미확인'}</strong>
                    </div>
                  )
                })}
              </div>
            </section>
          </section>
        </div>
      ) : null}
    </section>
  )
}
