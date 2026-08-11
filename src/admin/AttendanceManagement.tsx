import { useEffect, useMemo, useRef, useState } from 'react'

import {
  MAX_ADMIN_ROWS,
  type AttendanceRepository,
  type CurrentServiceAttendance,
} from '../lib/attendanceRepository'
import type { ServiceKey } from '../domain/types'
import { ADMIN_DEMO_FIXTURES } from './demoData'
import {
  selectAttendanceRows,
  selectSessionTotals,
  type AdminDemoAttendanceRow,
  type AdminDemoPeriod,
} from './selectors'
import type {
  AdminDemoAggregateInput,
  AdminDemoAttendanceEvent,
  AdminDemoFixtureBundle,
  AdminDemoServicePart,
  AdminDemoServiceSession,
} from './types'
import { recentSundayServiceDates } from './serviceCalendar'

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
  currentAttendance: CurrentServiceAttendance | ReadonlyArray<CurrentServiceAttendance> | null,
): AdminDemoAggregateInput {
  let input = fixtureInput(fixtures)
  if (!currentAttendance) {
    return input
  }

  const attendanceEntries = Array.isArray(currentAttendance)
    ? currentAttendance
    : [currentAttendance]
  const membersById = new Set(fixtures.members.map((member) => member.id))
  for (const attendance of attendanceEntries) {
    const existingSessions = input.sessions.filter((session) => session.date === attendance.serviceKey)
    const weekNumber = existingSessions[0]?.weekNumber
      ?? Math.max(...input.sessions.map((session) => session.weekNumber), 0) + 1
    const currentSessions: ReadonlyArray<AdminDemoServiceSession> = existingSessions.length > 0
      ? existingSessions
      : ([1, 2, 3] as const).map((part) => ({
        id: `firebase-session-${attendance.serviceKey}-p${part}`,
        part,
        date: attendance.serviceKey,
        startsAt: part === 1 ? '07:30' : part === 2 ? '09:30' : '11:30',
        weekNumber,
        label: `${attendance.serviceKey} ${part}부`,
      }))
    const placeholders: AdminDemoAttendanceEvent[] = existingSessions.length > 0
      ? []
      : fixtures.members.flatMap((member) => currentSessions.map((session) => ({
        id: `firebase-placeholder-${member.id}-${session.date}-${session.part}`,
        memberId: member.id,
        sessionId: session.id,
        date: session.date,
        part: session.part,
        weekNumber: session.weekNumber,
        status: 'missed' as const,
      })))
    input = {
      ...input,
      referenceDate: attendance.serviceKey > input.referenceDate
        ? attendance.serviceKey
        : input.referenceDate,
      sessions: existingSessions.length > 0
        ? input.sessions
        : [...input.sessions, ...currentSessions],
      events: [...input.events, ...placeholders],
    }
    const sessionsByPart = new Map(currentSessions.map((session) => [session.part, session] as const))
    const firstAttendanceByMember = new Map<string, (typeof attendance.rows)[number]>()
    const sortedRows = [...attendance.rows].sort((left, right) => {
      const leftTime = left.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightTime = right.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      return leftTime - rightTime || left.id.localeCompare(right.id)
    })
    for (const row of sortedRows) {
      if (membersById.has(row.memberId) && !firstAttendanceByMember.has(row.memberId)) {
        firstAttendanceByMember.set(row.memberId, row)
      }
    }

    const events = input.events.map((event) => (
      event.date === attendance.serviceKey
        ? { ...event, status: 'missed' as const }
        : event
    ))

    for (const row of firstAttendanceByMember.values()) {
      const session = sessionsByPart.get(row.servicePart)
      if (!session) {
        continue
      }

      events.push({
        id: `firebase-${row.id}`,
        memberId: row.memberId,
        sessionId: session.id,
        date: session.date,
        part: row.servicePart,
        weekNumber: session.weekNumber,
        status: 'attended',
      })
    }

    input = { ...input, events }
  }

  return input
}

interface AttendanceDateColumn {
  date: string
  sessionIds: ReadonlyArray<string>
}

function escapeExcelXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function excelCell(value: string, styleId?: string): string {
  const style = styleId ? ` ss:StyleID="${styleId}"` : ''
  return `<Cell${style}><Data ss:Type="String">${escapeExcelXml(value)}</Data></Cell>`
}

export function buildAttendanceExcelXml(
  rows: ReadonlyArray<AdminDemoAttendanceRow>,
  dates: ReadonlyArray<string>,
): string {
  const header = ['교인', '교구', ...dates.map(formatDate), '출석률']
  const bodyRows = rows.map((row) => {
    const attendanceByDate = dates.map((date) => {
      const attended = row.events.find((event) => event.date === date && event.status === 'attended')
      return attended ? `${attended.part}부` : '미확인'
    })
    const values = [
      row.member.label,
      row.member.cohort,
      ...attendanceByDate,
      formatRate(row.rate),
    ]
    return `<Row>${values.map((value) => excelCell(value)).join('')}</Row>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EAF2FF" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="출석부">
  <Table>
   <Row>${header.map((value) => excelCell(value, 'Header')).join('')}</Row>
   ${bodyRows.join('\n   ')}
  </Table>
 </Worksheet>
</Workbook>`
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
  const [period, setPeriod] = useState<AdminDemoPeriod>('last-4-weeks')
  const [liveAttendances, setLiveAttendances] = useState<ReadonlyArray<CurrentServiceAttendance>>([])
  const attendanceCache = useRef(new Map<string, CurrentServiceAttendance>())
  const attendanceFixtures = useMemo<AdminDemoFixtureBundle>(() => (
    repository
      ? {
        ...fixtures,
        events: fixtures.events.map((event) => ({ ...event, status: 'missed' as const })),
      }
      : fixtures
  ), [fixtures, repository])
  const input = useMemo(
    () => mergeCurrentServiceAttendance(attendanceFixtures, liveAttendances),
    [attendanceFixtures, liveAttendances],
  )
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
  const selectedPeriodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? '출석'

  function downloadAttendanceExcel() {
    const workbook = buildAttendanceExcelXml(rows, dateColumns.map((column) => column.date))
    const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `대흥교회_출석부_${selectedPeriodLabel.replace(/\s/g, '')}_${input.referenceDate}.xls`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(downloadUrl)
  }

  useEffect(() => {
    if (!repository) {
      return undefined
    }

    let isActive = true
    setIsRefreshing(true)
    setLiveAttendanceError('')
    const referenceDateRequest = serviceDate
      ? Promise.resolve(serviceDate)
      : repository.getCurrentServiceConfig().then((config) => config.serviceKey)
    void referenceDateRequest
      .then(async (referenceDate) => {
        const dateCount = period === 'last-4-weeks' ? 4 : period === 'last-3-months' ? 13 : 26
        const dates = recentSundayServiceDates(referenceDate, dateCount)
        return Promise.all(dates.map(async (date) => {
          const cached = attendanceCache.current.get(date)
          if (cached) {
            return cached
          }
          const attendance = await repository.getServiceAttendance(date, MAX_ADMIN_ROWS)
          attendanceCache.current.set(date, attendance)
          return attendance
        }))
      })
      .then((attendance) => {
        if (isActive) {
          setLiveAttendances(attendance)
        }
      })
      .catch(() => {
        if (isActive) {
          setLiveAttendances([])
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
  }, [period, refreshKey, repository, serviceDate])

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
          <div className="attendance-table-title-group">
            <h2 id="attendance-table-title">교인별 출석 현황</h2>
            <p>전체 교인 <strong>{fixtures.members.length.toLocaleString('ko-KR')}명</strong></p>
          </div>
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
              <span className="sr-only">교인 검색</span>
              <input
                id="attendance-member-search"
                aria-label="교인 검색"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="이름 검색"
              />
            </label>
            <button
              className="attendance-refresh-button"
              type="button"
              disabled={isRefreshing}
              onClick={() => {
                attendanceCache.current.clear()
                setRefreshKey((value) => value + 1)
              }}
            >
              {isRefreshing ? '불러오는 중' : '출석 새로고침'}
            </button>
            <button
              className="attendance-export-button"
              type="button"
              aria-label={`${selectedPeriodLabel} 출석부 엑셀 다운로드`}
              disabled={rows.length === 0}
              onClick={downloadAttendanceExcel}
            >
              엑셀 다운로드
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
                  <th scope="col">교인</th>
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
