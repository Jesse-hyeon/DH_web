import { ADMIN_DEMO_FIXTURES } from './demoData'
import {
  selectDashboardAggregates,
  selectLongTermAbsentees,
  selectNewMembers,
} from './selectors'
import type { AdminDemoMemberProfile, AdminDemoServiceAverage, AdminDemoWeeklySummary } from './types'

const numberFormatter = new Intl.NumberFormat('ko-KR')

function formatCount(value: number): string {
  return numberFormatter.format(Math.round(value))
}

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatDate(value: string): string {
  return value.replace(/-/g, '.')
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="admin-metric-card">
      <p className="admin-card-label">{label}</p>
      <strong className="admin-metric-value">{value}</strong>
      <p className="admin-card-detail">{detail}</p>
    </article>
  )
}

function WeeklyTrend({ summaries }: { summaries: ReadonlyArray<AdminDemoWeeklySummary> }) {
  const maxAttendedCount = Math.max(...summaries.map((summary) => summary.attendedCount), 1)

  return (
    <section className="admin-dashboard-panel" aria-labelledby="weekly-trend-title">
      <div className="admin-panel-heading">
        <div>
          <p className="admin-panel-kicker">Attendance trend</p>
          <h2 id="weekly-trend-title">최근 4주 출석 추이</h2>
        </div>
        <span className="admin-panel-meta">주차별 참석 인원</span>
      </div>

      <div className="admin-trend-chart" role="img" aria-label="최근 4주 주차별 출석 인원 막대 그래프">
        {summaries.map((summary) => (
          <div className="admin-trend-column" key={summary.weekNumber}>
            <span className="admin-trend-value">{formatCount(summary.attendedCount)}</span>
            <div className="admin-trend-track" aria-hidden="true">
              <div
                className="admin-trend-bar"
                style={{ height: `${Math.max(8, Math.round((summary.attendedCount / maxAttendedCount) * 100))}%` }}
              />
            </div>
            <span className="admin-trend-label">{summary.weekNumber}주차</span>
            <span className="admin-trend-date">{formatDate(summary.dateRange.from)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function ServiceComparison({ averages }: { averages: ReadonlyArray<AdminDemoServiceAverage> }) {
  return (
    <section className="admin-dashboard-panel" aria-labelledby="service-comparison-title">
      <div className="admin-panel-heading">
        <div>
          <p className="admin-panel-kicker">Service comparison</p>
          <h2 id="service-comparison-title">예배별 출석 비교</h2>
        </div>
        <span className="admin-panel-meta">전체 기간</span>
      </div>

      <div className="admin-service-list">
        {averages.map((average) => (
          <div className="admin-service-row" data-service-part={average.part} key={average.part}>
            <div className="admin-service-row-heading">
              <strong>{average.part}부 예배</strong>
              <span>{formatRate(average.rate)}</span>
            </div>
            <div className="admin-service-track" aria-hidden="true">
              <div className="admin-service-bar" style={{ width: `${Math.round(average.rate * 100)}%` }} />
            </div>
            <p>{formatCount(average.attendedCount)}명 참석 · {formatCount(average.eligibleCount)}명 대상</p>
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
}: {
  headingId: string
  title: string
  description: string
  members: ReadonlyArray<AdminDemoMemberProfile>
  emptyMessage: string
}) {
  return (
    <section className="admin-dashboard-panel admin-member-panel" aria-labelledby={headingId}>
      <div className="admin-panel-heading">
        <div>
          <p className="admin-panel-kicker">Member summary</p>
          <h2 id={headingId}>{title}</h2>
        </div>
        <span className="admin-panel-meta">{members.length}명</span>
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
              <time dateTime={member.joinedOn}>{formatDate(member.joinedOn)} 가입</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function AdminDashboard() {
  const dashboard = selectDashboardAggregates(ADMIN_DEMO_FIXTURES)
  const newMembers = selectNewMembers(ADMIN_DEMO_FIXTURES)
  const longTermAbsentees = selectLongTermAbsentees(ADMIN_DEMO_FIXTURES)

  return (
    <section className="admin-dashboard" data-testid="admin-dashboard" aria-labelledby="admin-dashboard-title">
      <div className="admin-dashboard-intro">
        <div>
          <p className="admin-dashboard-kicker">Overview</p>
          <h2 id="admin-dashboard-title">이번 주 관리자 요약</h2>
        </div>
        <p className="admin-dashboard-reference">기준일 {formatDate(ADMIN_DEMO_FIXTURES.referenceDate)}</p>
      </div>

      <div className="admin-metric-grid" aria-label="대시보드 주요 지표">
        <MetricCard
          label="전체 회원"
          value={formatCount(dashboard.memberCount)}
          detail="등록된 회원 수"
        />
        <MetricCard
          label="주간 평균 출석"
          value={`${formatCount(dashboard.weeklyAverage)}명`}
          detail="최근 4주 참석 인원 평균"
        />
        <MetricCard
          label="신규 회원"
          value={`${formatCount(dashboard.newMemberCount)}명`}
          detail="최근 30일 가입"
        />
        <MetricCard
          label="장기 결석"
          value={`${formatCount(dashboard.longTermAbsenteeCount)}명`}
          detail="4주 연속 결석"
        />
        {dashboard.serviceAverages.map((average) => (
          <MetricCard
            key={average.part}
            label={`${average.part}부 평균 출석`}
            value={formatRate(average.rate)}
            detail={`${formatCount(average.attendedCount)}명 참석`}
          />
        ))}
      </div>

      <div className="admin-dashboard-two-column">
        <WeeklyTrend summaries={dashboard.weeklySummaries} />
        <ServiceComparison averages={dashboard.serviceAverages} />
      </div>

      <div className="admin-dashboard-two-column">
        <MemberSummary
          headingId="new-member-summary-title"
          title="신규 회원"
          description="최근 30일 안에 가입한 회원입니다."
          members={newMembers}
          emptyMessage="최근 가입한 회원이 없습니다."
        />
        <MemberSummary
          headingId="long-term-absence-summary-title"
          title="장기 결석 회원"
          description="최근 4주 모두 결석한 회원입니다."
          members={longTermAbsentees}
          emptyMessage="4주 연속 결석한 회원이 없습니다."
        />
      </div>
    </section>
  )
}
