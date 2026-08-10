import { useEffect, useMemo, useState } from 'react'

import { ADMIN_DEMO_FIXTURES } from './demoData'
import {
  attendanceRate,
  selectAttendanceRows,
  selectMemberHistorySummary,
  selectPeriodDateRange,
  selectServiceAverages,
  selectSessionTotals,
  selectWeeklySummaries,
  type AdminDemoPeriod,
  type AdminDemoServicePartFilter,
} from './selectors'
import type {
  AdminDemoAggregateInput,
  AdminDemoAttendanceEvent,
  AdminDemoFixtureBundle,
} from './types'

const PERIOD_OPTIONS: ReadonlyArray<{ value: AdminDemoPeriod; label: string }> = [
  { value: 'current-month', label: '이번 달' },
  { value: 'last-6-months', label: '최근 6개월' },
  { value: 'all', label: '전체 기간' },
]

const SERVICE_OPTIONS: ReadonlyArray<{ value: AdminDemoServicePartFilter; label: string }> = [
  { value: 'all', label: '전체 예배' },
  { value: 1, label: '1부' },
  { value: 2, label: '2부' },
  { value: 3, label: '3부' },
]

const MAX_VISIBLE_ATTENDANCE_ROWS = 100

const numberFormatter = new Intl.NumberFormat('ko-KR')

function formatCount(value: number): string {
  return numberFormatter.format(value)
}

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatDate(value: string): string {
  return value.replace(/-/g, '.')
}

function eventForSession(
  events: ReadonlyArray<AdminDemoAttendanceEvent>,
  sessionId: string,
): AdminDemoAttendanceEvent | undefined {
  return events.find((event) => event.sessionId === sessionId)
}

function AttendanceStatus({ event }: { event: AdminDemoAttendanceEvent | undefined }) {
  const status = event?.status
  const label = status === 'attended' ? '출석' : status === 'missed' ? '결석' : '기록 없음'

  return (
    <span
      className={`attendance-status is-${status ?? 'unrecorded'}`}
      aria-label={label}
      title={label}
    >
      {status === 'attended' ? '✓' : status === 'missed' ? '—' : '·'}
    </span>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="attendance-summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  )
}

function SessionDetail({
  selectedSession,
  totals,
}: {
  selectedSession: ReturnType<typeof selectSessionTotals>[number] | undefined
  totals: ReturnType<typeof selectSessionTotals>
}) {
  if (!selectedSession) {
    return (
      <section className="admin-dashboard-panel attendance-session-detail" aria-labelledby="session-detail-title" data-testid="selected-session-detail">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-panel-kicker">Session detail</p>
            <h2 id="session-detail-title">세션 상세</h2>
          </div>
        </div>
        <p className="admin-empty-state" role="status">선택한 기간에 예배 세션이 없습니다.</p>
      </section>
    )
  }

  return (
    <section className="admin-dashboard-panel attendance-session-detail" aria-labelledby="session-detail-title" data-testid="selected-session-detail">
      <div className="admin-panel-heading">
        <div>
          <p className="admin-panel-kicker">Session detail</p>
          <h2 id="session-detail-title">{selectedSession.session.part}부 세션 상세</h2>
        </div>
        <span className="admin-panel-meta">{formatDate(selectedSession.session.date)}</span>
      </div>

      <dl className="attendance-detail-list">
        <div><dt>참석 인원</dt><dd>{formatCount(selectedSession.attendedCount)}명</dd></div>
        <div><dt>결석 인원</dt><dd>{formatCount(selectedSession.missedCount)}명</dd></div>
        <div><dt>출석률</dt><dd>{formatRate(selectedSession.rate)}</dd></div>
      </dl>

      <div className="attendance-session-breakdown" aria-label="세션별 출석률 비교">
        {totals.map((total) => (
          <div className="attendance-session-breakdown-row" key={total.session.id}>
            <span>{total.session.part}부</span>
            <div className="attendance-session-track" aria-hidden="true">
              <div style={{ width: `${Math.round(total.rate * 100)}%` }} />
            </div>
            <strong>{formatRate(total.rate)}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

export interface AttendanceManagementProps {
  fixtures?: AdminDemoFixtureBundle
}

function fixtureInput(fixtures: AdminDemoFixtureBundle): AdminDemoAggregateInput {
  return {
    referenceDate: fixtures.referenceDate,
    members: fixtures.members,
    sessions: fixtures.sessions,
    events: fixtures.events,
  }
}

function MemberHistory({
  fixtures,
  memberId,
  options,
}: {
  fixtures: AdminDemoFixtureBundle
  memberId: string | null
  options: { period: AdminDemoPeriod; servicePart: AdminDemoServicePartFilter }
}) {
  const input = fixtureInput(fixtures)
  const summary = memberId ? selectMemberHistorySummary(input, memberId, options) : undefined
  const events = summary?.events ?? []

  if (!summary?.member) {
    return (
      <aside className="admin-dashboard-panel attendance-history-panel" aria-labelledby="member-history-title" data-testid="member-history-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-panel-kicker">Member history</p>
            <h2 id="member-history-title">회원 출석 이력</h2>
          </div>
        </div>
        <p className="admin-empty-state" role="status">회원 행을 선택하면 출석 이력을 확인할 수 있습니다.</p>
      </aside>
    )
  }

  return (
    <aside className="admin-dashboard-panel attendance-history-panel" aria-labelledby="member-history-title" data-testid="member-history-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="admin-panel-kicker">Member history</p>
          <h2 id="member-history-title">{summary.member.label} 출석 이력</h2>
        </div>
        <span className="admin-panel-meta">{formatRate(summary.rate)}</span>
      </div>

      <p className="attendance-history-summary">
        총 {formatCount(summary.eligibleCount)}회 중 {formatCount(summary.attendedCount)}회 참석
      </p>
      {events.length === 0 ? (
        <p className="admin-empty-state" role="status">선택한 조건에 해당하는 회원 이력이 없습니다.</p>
      ) : (
        <ul className="attendance-history-list">
          {events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{formatDate(event.date)} · {event.part}부</strong>
                <span>{event.status === 'attended' ? '출석' : '결석'}</span>
              </div>
              <AttendanceStatus event={event} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

export default function AttendanceManagement({ fixtures = ADMIN_DEMO_FIXTURES }: AttendanceManagementProps) {
  const input = useMemo(() => fixtureInput(fixtures), [fixtures])
  const [period, setPeriod] = useState<AdminDemoPeriod>('current-month')
  const [servicePart, setServicePart] = useState<AdminDemoServicePartFilter>('all')
  const [memberQuery, setMemberQuery] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const filterOptions = useMemo(() => ({ period, servicePart }), [period, servicePart])
  const range = useMemo(() => selectPeriodDateRange(input, period), [input, period])
  const rows = useMemo(() => selectAttendanceRows(input, filterOptions), [filterOptions, input])
  const sessionTotals = useMemo(() => selectSessionTotals(input, filterOptions), [filterOptions, input])
  const serviceAverages = useMemo(() => selectServiceAverages(input, filterOptions), [filterOptions, input])
  const weeklySummaries = useMemo(() => selectWeeklySummaries(input, filterOptions), [filterOptions, input])

  const matchingRows = useMemo(() => {
    const normalizedQuery = memberQuery.trim().toLocaleLowerCase()
    if (!normalizedQuery) {
      return rows
    }
    return rows.filter((row) => row.member.label.toLocaleLowerCase().includes(normalizedQuery))
  }, [memberQuery, rows])
  const visibleRows = matchingRows.slice(0, MAX_VISIBLE_ATTENDANCE_ROWS)

  const selectedSession = sessionTotals.find((total) => total.session.id === selectedSessionId)
  const selectedVisibleMember = visibleRows.some((row) => row.member.id === selectedMemberId)

  useEffect(() => {
    if (!selectedSessionId || !selectedSession) {
      setSelectedSessionId(sessionTotals[0]?.session.id ?? null)
    }
  }, [selectedSession, selectedSessionId, sessionTotals])

  useEffect(() => {
    if (selectedMemberId && !selectedVisibleMember) {
      setSelectedMemberId(null)
    }
  }, [selectedMemberId, selectedVisibleMember])

  const maxWeeklyAttendance = Math.max(...weeklySummaries.map((summary) => summary.attendedCount), 1)
  const filteredAttendedCount = rows.reduce((total, row) => total + row.attendedCount, 0)
  const filteredEligibleCount = rows.reduce((total, row) => total + row.eligibleCount, 0)
  const filteredRate = attendanceRate(filteredAttendedCount, filteredEligibleCount)

  return (
    <section className="attendance-management" data-testid="attendance-management" aria-labelledby="attendance-management-title">
      <div className="attendance-management-intro">
        <div>
          <p className="admin-dashboard-kicker">Attendance records</p>
          <h2 id="attendance-management-title">출석 관리</h2>
        </div>
        <p className="admin-dashboard-reference">{formatDate(range.from)} - {formatDate(range.to)}</p>
      </div>

      <form className="admin-dashboard-panel attendance-filter-panel" aria-label="출석 관리 필터" onSubmit={(event) => event.preventDefault()}>
        <div className="attendance-filter-group">
          <label htmlFor="attendance-period">조회 기간</label>
          <select
            id="attendance-period"
            name="period"
            value={period}
            aria-describedby="attendance-filter-range"
            onChange={(event) => {
              setPeriod(event.target.value as AdminDemoPeriod)
              setSelectedSessionId(null)
              setSelectedMemberId(null)
            }}
          >
            {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="attendance-filter-group">
          <label htmlFor="attendance-service-part">예배 구분</label>
          <select
            id="attendance-service-part"
            name="service"
            value={servicePart}
            aria-describedby="attendance-filter-range"
            onChange={(event) => {
            const value = event.target.value
            setServicePart(value === 'all' ? 'all' : Number(value) as 1 | 2 | 3)
            setSelectedSessionId(null)
            setSelectedMemberId(null)
          }}
          >
            {SERVICE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="attendance-filter-group attendance-member-search">
          <label htmlFor="attendance-member-search">회원 검색</label>
          <input
            id="attendance-member-search"
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder="이름으로 검색"
          />
        </div>
        <p className="attendance-filter-range" id="attendance-filter-range">
          조회 범위: {formatDate(range.from)} - {formatDate(range.to)}
        </p>
      </form>

      <div className="attendance-summary-grid" aria-label="필터 기준 출석 요약">
        <SummaryCard label="대상 회원" value={formatCount(matchingRows.length)} detail="선택한 기간에 기록이 있는 회원" />
        <SummaryCard label="출석 기록" value={formatCount(filteredEligibleCount)} detail="선택한 필터의 전체 기록" />
        <SummaryCard label="출석률" value={formatRate(filteredRate)} detail={`${formatCount(filteredAttendedCount)}회 참석`} />
        <SummaryCard label="예배 세션" value={formatCount(sessionTotals.length)} detail="선택한 기간의 세션" />
      </div>

      <div className="attendance-support-grid">
        <section className="admin-dashboard-panel attendance-chart-panel" aria-labelledby="attendance-weekly-title">
          <div className="admin-panel-heading">
            <div><p className="admin-panel-kicker">Weekly overview</p><h2 id="attendance-weekly-title">주차별 출석</h2></div>
            <span className="admin-panel-meta">참석 인원</span>
          </div>
          <div className="attendance-weekly-chart" role="img" aria-label="필터 기준 주차별 출석 인원 막대 그래프">
            {weeklySummaries.map((summary) => (
              <div className="attendance-weekly-column" key={summary.weekNumber}>
                <strong>{formatCount(summary.attendedCount)}</strong>
                <div className="attendance-weekly-track" aria-hidden="true">
                  <div style={{ height: `${Math.max(8, Math.round((summary.attendedCount / maxWeeklyAttendance) * 100))}%` }} />
                </div>
                <span>{summary.weekNumber}주차</span>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-dashboard-panel attendance-chart-panel" aria-labelledby="attendance-service-title">
          <div className="admin-panel-heading">
            <div><p className="admin-panel-kicker">Service overview</p><h2 id="attendance-service-title">예배별 출석률</h2></div>
            <span className="admin-panel-meta">필터 적용</span>
          </div>
          <div className="attendance-service-list">
            {serviceAverages.map((average) => (
              <div className="attendance-service-row" key={average.part}>
                <div><strong>{average.part}부</strong><span>{formatRate(average.rate)}</span></div>
                <div className="attendance-service-track" aria-hidden="true"><div style={{ width: `${Math.round(average.rate * 100)}%` }} /></div>
                <small>{formatCount(average.attendedCount)}명 참석 · {formatCount(average.eligibleCount)}명 대상</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="attendance-main-grid">
        <section className="admin-dashboard-panel attendance-table-panel" aria-labelledby="attendance-table-title">
          <div className="admin-panel-heading">
            <div><p className="admin-panel-kicker">Member attendance</p><h2 id="attendance-table-title">회원별 출석 현황</h2></div>
            <span className="admin-panel-meta">{formatCount(matchingRows.length)}명</span>
          </div>

          {matchingRows.length === 0 ? (
            <p className="admin-empty-state" role="status">조건에 맞는 출석 기록이 없습니다. 기간, 예배 구분 또는 검색어를 바꿔 보세요.</p>
          ) : (
            <div className="attendance-table-scroll">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th scope="col">회원</th>
                    {sessionTotals.map((total) => <th scope="col" key={total.session.id}>{formatDate(total.session.date)}<span>{total.session.part}부</span></th>)}
                    <th scope="col">출석률</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.member.id} className={row.member.id === selectedMemberId ? 'is-selected' : undefined}>
                      <th scope="row">
                        <button
                          type="button"
                          className="attendance-member-button"
                          aria-pressed={row.member.id === selectedMemberId}
                          onClick={() => setSelectedMemberId(row.member.id)}
                        >
                          <strong>{row.member.label}</strong>
                          <span>{row.member.cohort}</span>
                        </button>
                      </th>
                      {sessionTotals.map((total) => <td key={total.session.id}><AttendanceStatus event={eventForSession(row.events, total.session.id)} /></td>)}
                      <td className="attendance-rate-cell">{formatRate(row.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {matchingRows.length > MAX_VISIBLE_ATTENDANCE_ROWS && (
            <p className="attendance-table-note">처음 {formatCount(MAX_VISIBLE_ATTENDANCE_ROWS)}명만 표시하고 있습니다. 검색으로 회원을 좁혀 볼 수 있습니다.</p>
          )}
        </section>

        <div className="attendance-side-column">
          <section className="admin-dashboard-panel attendance-session-list" aria-labelledby="attendance-session-title">
            <div className="admin-panel-heading">
              <div><p className="admin-panel-kicker">Sessions</p><h2 id="attendance-session-title">세션별 출석</h2></div>
              <span className="admin-panel-meta">{formatCount(sessionTotals.length)}개</span>
            </div>
            {sessionTotals.length === 0 ? <p className="admin-empty-state" role="status">선택한 기간에 세션이 없습니다.</p> : (
              <ul>
                {sessionTotals.map((total) => (
                  <li key={total.session.id}>
                    <button
                      type="button"
                      className={total.session.id === selectedSessionId ? 'is-selected' : undefined}
                      aria-pressed={total.session.id === selectedSessionId}
                      aria-controls="session-detail-title"
                      onClick={() => setSelectedSessionId(total.session.id)}
                    >
                      <span><strong>{total.session.part}부 예배</strong><small>{formatDate(total.session.date)} · {total.session.startsAt}</small></span>
                      <b>{formatRate(total.rate)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <SessionDetail selectedSession={selectedSession} totals={sessionTotals} />
        </div>
      </div>

      <MemberHistory fixtures={fixtures} memberId={selectedMemberId} options={filterOptions} />
    </section>
  )
}
