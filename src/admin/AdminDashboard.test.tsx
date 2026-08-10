import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import AdminDashboard from './AdminDashboard'
import { ADMIN_DEMO_FIXTURES } from './demoData'
import { selectDashboardAggregates, selectLongTermAbsentees, selectNewMembers } from './selectors'

interface RenderedDashboard {
  container: HTMLDivElement
  root: Root
}

async function renderDashboard(): Promise<RenderedDashboard> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<AdminDashboard />)
  })

  return { container, root }
}

function metricValue(container: HTMLElement, label: string): string {
  const card = Array.from(container.querySelectorAll<HTMLElement>('.admin-metric-card'))
    .find((candidate) => candidate.querySelector('.admin-card-label')?.textContent === label)

  if (!card) {
    throw new Error(`Unable to find metric card: ${label}`)
  }

  return card.querySelector('.admin-metric-value')?.textContent ?? ''
}

describe('AdminDashboard', () => {
  let rendered: RenderedDashboard | null = null

  afterEach(() => {
    if (rendered) {
      act(() => rendered?.root.unmount())
      rendered.container.remove()
      rendered = null
    }
    document.body.innerHTML = ''
  })

  it('renders metric cards and charts from the deterministic selectors', async () => {
    rendered = await renderDashboard()
    const container = rendered.container
    const dashboard = selectDashboardAggregates(ADMIN_DEMO_FIXTURES)

    expect(container.querySelector('[data-testid="admin-dashboard"]')).toBeTruthy()
    expect(container.querySelectorAll('.admin-metric-card')).toHaveLength(7)
    expect(metricValue(container, '전체 회원')).toBe(dashboard.memberCount.toLocaleString('ko-KR'))
    expect(metricValue(container, '주간 평균 출석')).toBe(
      `${Math.round(dashboard.weeklyAverage).toLocaleString('ko-KR')}명`,
    )
    expect(metricValue(container, '신규 회원')).toBe(`${dashboard.newMemberCount}명`)
    expect(metricValue(container, '장기 결석')).toBe(`${dashboard.longTermAbsenteeCount}명`)
    dashboard.serviceAverages.forEach((average) => {
      expect(metricValue(container, `${average.part}부 평균 출석`)).toBe(
        `${Math.round(average.rate * 100)}%`,
      )
    })

    expect(container.querySelectorAll('.admin-trend-column')).toHaveLength(
      dashboard.weeklySummaries.length,
    )
    expect(container.querySelectorAll('.admin-service-row')).toHaveLength(
      dashboard.serviceAverages.length,
    )
    expect(container.querySelector('[aria-label="최근 4주 주차별 출석 인원 막대 그래프"]'))
      .toBeTruthy()
  })

  it('shows privacy-safe member summaries without internal member IDs', async () => {
    rendered = await renderDashboard()
    const newMembers = selectNewMembers(ADMIN_DEMO_FIXTURES)
    const longTermAbsentees = selectLongTermAbsentees(ADMIN_DEMO_FIXTURES)
    const text = rendered.container.textContent ?? ''

    expect(text).toContain(newMembers[0]?.label ?? '')
    expect(text).toContain(longTermAbsentees[0]?.label ?? '')
    expect(rendered.container.querySelectorAll('.admin-member-panel')).toHaveLength(2)
    expect(rendered.container.querySelectorAll('.admin-member-list li').length).toBeLessThanOrEqual(10)
    expect(text).not.toContain('admin-demo-member-')
    expect(text).not.toContain('memberId')
  })
})
