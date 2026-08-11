import { useEffect, useMemo, useRef, useState } from 'react'

import { ADMIN_DEMO_FIXTURES, ADMIN_DEMO_REFERENCE_DATE } from './demoData'
import {
  type AttendanceRepository,
  type ServiceAttendanceSummary,
} from '../lib/attendanceRepository'
import {
  selectLongTermAbsentees,
  selectNewMembers,
  selectPeriodDateRange,
  selectServiceAverages,
  selectWeeklySummariesInRange,
  type AdminDemoPeriod,
} from './selectors'
import type { AdminDemoMemberProfile, AdminDemoServiceAverage, AdminDemoWeeklySummary } from './types'
import { recentSundayServiceDates } from './serviceCalendar'

const numberFormatter = new Intl.NumberFormat('ko-KR')

function formatCount(value: number): string {
  return numberFormatter.format(Math.round(value))
}

function dashboardLoadError(error: unknown, fallback: string): string {
  const firebaseError = error as { code?: unknown; message?: unknown }
  if (firebaseError.code === 'resource-exhausted'
    || (typeof firebaseError.message === 'string' && firebaseError.message.includes('Quota exceeded'))) {
    return 'Firebase 무료 조회 한도가 소진되었습니다. 한도 초기화 후 자동으로 다시 표시됩니다.'
  }

  return fallback
}

function formatDate(value: string): string {
  return value.replace(/-/g, '.')
}

function formatTrendAxisDate(value: string, compact: boolean): string {
  if (!compact) {
    return formatDate(value)
  }

  const month = Number(value.slice(5, 7))
  return `${month}월`
}

function trendScaleFloor(counts: ReadonlyArray<number>): number {
  const sortedCounts = [...counts].sort((left, right) => left - right)
  const maxCount = Math.max(...sortedCounts, 1)
  const middleIndex = Math.floor(sortedCounts.length / 2)
  const medianCount = sortedCounts.length % 2 === 0
    ? ((sortedCounts[middleIndex - 1] ?? 0) + (sortedCounts[middleIndex] ?? 0)) / 2
    : (sortedCounts[middleIndex] ?? 0)
  const comparableCounts = sortedCounts.filter((count) => count >= medianCount * 0.5)
  const minComparableCount = Math.min(...comparableCounts, maxCount)
  const comparableRange = Math.max(maxCount - minComparableCount, 1)
  const padding = Math.max(comparableRange * 0.35, maxCount * 0.04, 1)
  const rawFloor = Math.max(0, minComparableCount - padding)
  const roundingUnit = Math.max(1, 10 ** Math.floor(Math.log10(maxCount / 10)))

  return Math.floor(rawFloor / roundingUnit) * roundingUnit
}

const TREND_PERIOD_OPTIONS: ReadonlyArray<{ value: AdminDemoPeriod; label: string; title: string }> = [
  { value: 'last-4-weeks', label: '최근 4주', title: '최근 4주' },
  { value: 'last-3-months', label: '최근 3개월', title: '최근 3개월' },
]

function actualWeeklySummaries(
  dates: ReadonlyArray<string>,
  attendance: ReadonlyArray<ServiceAttendanceSummary>,
): ReadonlyArray<AdminDemoWeeklySummary> {
  const attendanceByDate = new Map(attendance.map((entry) => [entry.serviceKey, entry]))

  return dates.map((date, index) => {
    const attendedCount = attendanceByDate.get(date)?.totalCount ?? 0
    return {
      weekNumber: index + 1,
      dateRange: { from: date, to: date },
      attendedCount,
      eligibleCount: ADMIN_DEMO_FIXTURES.members.length,
      rate: attendedCount / Math.max(ADMIN_DEMO_FIXTURES.members.length, 1),
    }
  })
}

function actualServiceAverages(
  attendance: ServiceAttendanceSummary | null,
): ReadonlyArray<AdminDemoServiceAverage> {
  return ([1, 2, 3] as const).map((part) => {
    const attendedCount = attendance?.partCounts[part] ?? 0
    return {
      part,
      attendedCount,
      eligibleCount: ADMIN_DEMO_FIXTURES.members.length,
      rate: attendedCount / Math.max(ADMIN_DEMO_FIXTURES.members.length, 1),
    }
  })
}

function WeeklyTrend({
  summaries,
  periodTitle,
  period,
  onPeriodChange,
}: {
  summaries: ReadonlyArray<AdminDemoWeeklySummary>
  periodTitle: string
  period: AdminDemoPeriod
  onPeriodChange: (period: AdminDemoPeriod) => void
}) {
  const [activeWeekNumber, setActiveWeekNumber] = useState<number | null>(null)
  const maxAttendedCount = Math.max(...summaries.map((summary) => summary.attendedCount), 1)
  const scaleFloor = trendScaleFloor(summaries.map((summary) => summary.attendedCount))
  const scaleRange = Math.max(maxAttendedCount - scaleFloor, 1)
  const compactChart = summaries.length > 8
  const chartWidth = 800
  const chartHeight = 228
  const plotLeft = 42
  const plotRight = chartWidth - 42
  const plotTop = 36
  const plotBottom = 172
  const xStep = (plotRight - plotLeft) / Math.max(summaries.length - 1, 1)
  const points = summaries.map((summary, index) => ({
    summary,
    index,
    x: summaries.length === 1 ? chartWidth / 2 : plotLeft + index * xStep,
    y: plotBottom - Math.min(
      Math.max((summary.attendedCount - scaleFloor) / scaleRange, 0),
      1,
    ) * (plotBottom - plotTop),
  }))
  const activePoint = points.find((point) => point.summary.weekNumber === activeWeekNumber)
  const tooltipX = activePoint ? Math.min(Math.max(activePoint.x, 76), chartWidth - 76) : 0
  const tooltipY = activePoint ? Math.max(6, activePoint.y - 58) : 0

  return (
    <section className="admin-dashboard-panel" aria-labelledby="weekly-trend-title">
      <div className="admin-panel-heading">
        <div>
          <h2 id="weekly-trend-title">출석 추이</h2>
        </div>
        <div className="admin-trend-controls">
          <label className="admin-trend-period">
            <span className="sr-only">출석 추이 기간</span>
            <select
              aria-label="출석 추이 기간"
              value={period}
              onChange={(event) => onPeriodChange(event.target.value as AdminDemoPeriod)}
            >
              {TREND_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div
        className="admin-trend-chart"
        role="img"
        aria-label={`${periodTitle} 날짜별 출석 인원 선 그래프`}
      >
        <svg
          className="admin-trend-line-chart"
          data-scale-floor={scaleFloor}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%' }}
        >
          <defs>
            <linearGradient id="admin-trend-area-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--admin-blue)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--admin-blue)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line
            className="admin-trend-grid-line"
            x1={plotLeft}
            x2={plotRight}
            y1={plotBottom}
            y2={plotBottom}
          />
          <polygon
            className="admin-trend-area"
            points={`${plotLeft},${plotBottom} ${points.map((point) => `${point.x},${point.y}`).join(' ')} ${plotRight},${plotBottom}`}
          />
          <polyline
            className="admin-trend-line"
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          />
          {points.map(({ summary, index, x, y }) => (
            <g
              className="admin-trend-point-group"
              key={summary.weekNumber}
              tabIndex={0}
              role="img"
              aria-label={`${formatDate(summary.dateRange.from)} ${formatCount(summary.attendedCount)}명 참석`}
              onBlur={() => setActiveWeekNumber(null)}
              onFocus={() => setActiveWeekNumber(summary.weekNumber)}
              onMouseEnter={() => setActiveWeekNumber(summary.weekNumber)}
              onMouseLeave={() => setActiveWeekNumber(null)}
            >
              {summaries.length <= 8 ? (
                <text className="admin-trend-value" textAnchor="middle" x={x} y={y - 12}>
                  {formatCount(summary.attendedCount)}
                </text>
              ) : null}
              <circle className="admin-trend-point" cx={x} cy={y} r="5" />
              {(!compactChart
                || index === 0
                || summary.dateRange.from.slice(0, 7) !== points[index - 1]?.summary.dateRange.from.slice(0, 7)) ? (
                <text className="admin-trend-date" textAnchor="middle" x={x} y={chartHeight - 7}>
                  {formatTrendAxisDate(summary.dateRange.from, compactChart)}
                </text>
              ) : null}
            </g>
          ))}
          {activePoint ? (
            <g className="admin-trend-tooltip" pointerEvents="none">
              <rect height="44" rx="8" width="140" x={tooltipX - 70} y={tooltipY} />
              <text className="admin-trend-tooltip-date" textAnchor="middle" x={tooltipX} y={tooltipY + 18}>
                {formatDate(activePoint.summary.dateRange.from)}
              </text>
              <text className="admin-trend-tooltip-value" textAnchor="middle" x={tooltipX} y={tooltipY + 35}>
                {formatCount(activePoint.summary.attendedCount)}명 참석
              </text>
            </g>
          ) : null}
        </svg>
      </div>
    </section>
  )
}

function ServiceComparison({
  averages,
  availableDates,
  selectedDate,
  onDateChange,
}: {
  averages: ReadonlyArray<AdminDemoServiceAverage>
  availableDates: ReadonlyArray<string>
  selectedDate: string
  onDateChange: (date: string) => void
}) {
  const maxAttendedCount = Math.max(...averages.map((average) => average.attendedCount), 1)
  const minAttendedCount = Math.min(...averages.map((average) => average.attendedCount), maxAttendedCount)
  const attendedRange = Math.max(maxAttendedCount - minAttendedCount, 1)

  return (
    <section className="admin-dashboard-panel" aria-labelledby="service-comparison-title">
      <div className="admin-panel-heading">
        <div>
          <h2 id="service-comparison-title">예배별 출석 비교</h2>
        </div>
        <label className="admin-service-date">
          <span className="sr-only">예배 출석 날짜</span>
          <select
            aria-label="예배 출석 날짜"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
          >
            {availableDates.map((date) => (
              <option key={date} value={date}>{formatDate(date)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="admin-service-chart" role="img" aria-label="선택한 날짜의 예배별 참석 인원 비교">
        {averages.map((average) => (
          <div className="admin-service-column" data-service-part={average.part} key={average.part}>
            <strong className="admin-service-column-value">{formatCount(average.attendedCount)}명</strong>
            <div className="admin-service-column-track" aria-hidden="true">
              <div
                className="admin-service-column-bar"
                style={{
                  height: `${Math.round((average.attendedCount / maxAttendedCount) * 100)}%`,
                  background: `linear-gradient(180deg, rgb(90 155 255 / ${0.55 + ((average.attendedCount - minAttendedCount) / attendedRange) * 0.45}) 0%, rgb(49 130 246 / ${0.55 + ((average.attendedCount - minAttendedCount) / attendedRange) * 0.45}) 100%)`,
                }}
              />
            </div>
            <strong className="admin-service-column-label">{average.part}부 예배</strong>
            <p>{formatCount(average.attendedCount)}명 참석</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function MemberSummary({
  headingId,
  title,
  description,
  members,
  emptyMessage,
  showJoinedDate = true,
}: {
  headingId: string
  title: string
  description: string
  members: ReadonlyArray<AdminDemoMemberProfile>
  emptyMessage: string
  showJoinedDate?: boolean
}) {
  return (
    <section className="admin-dashboard-panel admin-member-panel" aria-labelledby={headingId}>
      <div className="admin-panel-heading">
        <div>
          <h2 id={headingId}>{title}</h2>
        </div>
      </div>
      <p className="admin-member-description">{description}</p>

      {members.length === 0 ? (
        <p className="admin-member-empty" role="status">{emptyMessage}</p>
      ) : (
        <ul className="admin-member-list">
          {members.slice(0, 5).map((member) => (
            <li key={member.id}>
              <div>
                <strong>{member.label}</strong>
                <span>{member.cohort}</span>
              </div>
              {showJoinedDate ? <time dateTime={member.joinedOn}>{formatDate(member.joinedOn)} 가입</time> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export interface AdminDashboardProps {
  repository?: AttendanceRepository
}

export default function AdminDashboard({ repository }: AdminDashboardProps) {
  const [trendPeriod, setTrendPeriod] = useState<AdminDemoPeriod>('last-4-weeks')
  const [referenceDate, setReferenceDate] = useState<string | null>(
    repository ? null : ADMIN_DEMO_REFERENCE_DATE,
  )
  const [serviceDate, setServiceDate] = useState(repository ? '' : ADMIN_DEMO_REFERENCE_DATE)
  const [trendAttendance, setTrendAttendance] = useState<ReadonlyArray<ServiceAttendanceSummary>>([])
  const [serviceAttendance, setServiceAttendance] = useState<ServiceAttendanceSummary | null>(null)
  const [liveDashboardError, setLiveDashboardError] = useState('')
  const attendanceCache = useRef(new Map<string, ServiceAttendanceSummary>())
  const newMembers = selectNewMembers(ADMIN_DEMO_FIXTURES)
  const longTermAbsentees = selectLongTermAbsentees(ADMIN_DEMO_FIXTURES)
  const selectedTrendPeriod = TREND_PERIOD_OPTIONS.find((option) => option.value === trendPeriod)
    ?? TREND_PERIOD_OPTIONS[0]
  const trendDates = useMemo(() => (
    referenceDate
      ? recentSundayServiceDates(referenceDate, trendPeriod === 'last-3-months' ? 13 : 4)
      : []
  ), [referenceDate, trendPeriod])
  const serviceDates = useMemo(() => (
    referenceDate
      ? [...recentSundayServiceDates(referenceDate, 13)].reverse()
      : serviceDate ? [serviceDate] : []
  ), [referenceDate, serviceDate])
  const trendRange = selectPeriodDateRange(ADMIN_DEMO_FIXTURES, trendPeriod)
  const fixtureTrendSummaries = selectWeeklySummariesInRange(ADMIN_DEMO_FIXTURES, trendRange)
  const trendSummaries = repository
    ? actualWeeklySummaries(trendDates, trendAttendance)
    : fixtureTrendSummaries
  const fixtureServiceAverages = selectServiceAverages(ADMIN_DEMO_FIXTURES, {
    dateRange: { from: serviceDate, to: serviceDate },
  })
  const serviceAverages = repository
    ? actualServiceAverages(serviceAttendance)
    : fixtureServiceAverages

  useEffect(() => {
    if (!repository) {
      return undefined
    }

    let isActive = true
    void repository.getCurrentServiceConfig()
      .then((config) => {
        if (isActive) {
          setReferenceDate(config.serviceKey)
          setServiceDate(config.serviceKey)
          setLiveDashboardError('')
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setLiveDashboardError(dashboardLoadError(error, '실제 출석 기준일을 불러오지 못했습니다.'))
        }
      })

    return () => {
      isActive = false
    }
  }, [repository])

  useEffect(() => {
    if (!repository || trendDates.length === 0) {
      return undefined
    }

    let isActive = true
    void Promise.all(trendDates.map(async (date) => {
      const cached = attendanceCache.current.get(date)
      if (cached) {
        return cached
      }
      const attendance = await repository.getServiceAttendanceSummary(date)
      attendanceCache.current.set(date, attendance)
      return attendance
    }))
      .then((attendance) => {
        if (isActive) {
          setTrendAttendance(attendance)
          setLiveDashboardError('')
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setTrendAttendance([])
          setLiveDashboardError(dashboardLoadError(error, '실제 출석 추이를 불러오지 못했습니다.'))
        }
      })

    return () => {
      isActive = false
    }
  }, [repository, trendDates])

  useEffect(() => {
    if (!repository || !serviceDate) {
      return undefined
    }

    let isActive = true
    const cached = attendanceCache.current.get(serviceDate)
    const request = cached
      ? Promise.resolve(cached)
      : repository.getServiceAttendanceSummary(serviceDate).then((attendance) => {
        attendanceCache.current.set(serviceDate, attendance)
        return attendance
      })

    setServiceAttendance(null)
    void request
      .then((attendance) => {
        if (isActive) {
          setServiceAttendance(attendance)
          setLiveDashboardError('')
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setServiceAttendance(null)
          setLiveDashboardError(dashboardLoadError(error, '선택한 날짜의 실제 출석 정보를 불러오지 못했습니다.'))
        }
      })

    return () => {
      isActive = false
    }
  }, [repository, serviceDate])

  return (
    <section className="admin-dashboard" data-testid="admin-dashboard" aria-label="대시보드">
      {liveDashboardError ? <p className="admin-empty-state" role="alert">{liveDashboardError}</p> : null}
      <div className="admin-dashboard-two-column">
        <WeeklyTrend
          summaries={trendSummaries}
          periodTitle={selectedTrendPeriod.title}
          period={trendPeriod}
          onPeriodChange={setTrendPeriod}
        />
        <ServiceComparison
          averages={serviceAverages}
          availableDates={serviceDates}
          selectedDate={serviceDate}
          onDateChange={setServiceDate}
        />
      </div>

      <div className="admin-dashboard-two-column">
        <MemberSummary
          headingId="new-member-summary-title"
          title="신규 등록자"
          description="최근 30일 안에 새로 등록된 회원입니다."
          members={newMembers}
          emptyMessage="최근 가입한 회원이 없습니다."
        />
        <MemberSummary
          headingId="long-term-absence-summary-title"
          title="장기결석자"
          description="최근 4주 모두 결석한 회원입니다."
          members={longTermAbsentees}
          emptyMessage="4주 연속 결석한 회원이 없습니다."
          showJoinedDate={false}
        />
      </div>

    </section>
  )
}
