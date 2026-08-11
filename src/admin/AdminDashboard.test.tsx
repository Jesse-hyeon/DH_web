import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import type { AttendanceRepository, CurrentServiceAttendance } from '../lib/attendanceRepository'
import AdminDashboard from './AdminDashboard'
import { ADMIN_DEMO_FIXTURES, ADMIN_DEMO_REFERENCE_DATE } from './demoData'
import {
  selectLongTermAbsentees,
  selectNewMembers,
  selectServiceAverages,
} from './selectors'

interface RenderedDashboard {
  container: HTMLDivElement
  root: Root
}

async function renderDashboard(repository?: AttendanceRepository): Promise<RenderedDashboard> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<AdminDashboard repository={repository} />)
    await Promise.resolve()
  })

  return { container, root }
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

  it('renders dashboard charts from the deterministic selectors', async () => {
    rendered = await renderDashboard()
    const container = rendered.container

    expect(container.querySelector('[data-testid="admin-dashboard"]')).toBeTruthy()
    expect(container.querySelector('.admin-metric-grid')).toBeNull()
    expect(container.querySelectorAll('.admin-metric-card')).toHaveLength(0)

    expect(container.querySelector('.admin-trend-line-chart')).toBeTruthy()
    expect(container.querySelectorAll('.admin-trend-point')).toHaveLength(4)
    expect(container.querySelectorAll('.admin-trend-date')).toHaveLength(4)
    expect(container.textContent).not.toContain('주차')
    expect(container.querySelectorAll('.admin-service-column')).toHaveLength(
      3,
    )
    expect(container.querySelector<HTMLInputElement>('input[aria-label="예배 출석 날짜"]')?.value)
      .toBe(ADMIN_DEMO_REFERENCE_DATE)
    const serviceAverages = selectServiceAverages(ADMIN_DEMO_FIXTURES, {
      dateRange: { from: ADMIN_DEMO_REFERENCE_DATE, to: ADMIN_DEMO_REFERENCE_DATE },
    })
    expect(serviceAverages.map((average) => average.attendedCount))
      .toEqual([...serviceAverages.map((average) => average.attendedCount)].sort((a, b) => a - b))
    const maxAttendedCount = Math.max(...serviceAverages.map((average) => average.attendedCount), 1)
    serviceAverages.forEach((average) => {
      const row = container.querySelector(`[data-service-part="${average.part}"]`)
      expect(row?.querySelector('.admin-service-column-value')?.textContent)
        .toBe(`${average.attendedCount.toLocaleString('ko-KR')}명`)
      expect(row?.querySelector('.admin-service-column-bar')?.getAttribute('style'))
        .toContain(`height: ${Math.round((average.attendedCount / maxAttendedCount) * 100)}%`)
      expect(row?.textContent).toContain(`${average.attendedCount.toLocaleString('ko-KR')}명 참석`)
      expect(row?.textContent).not.toContain('명 대상')
    })
    expect(container.querySelector('[aria-label="최근 4주 날짜별 출석 인원 선 그래프"]'))
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

  it('offers recent four-week and three-month ranges', async () => {
    rendered = await renderDashboard()
    const periodSelect = rendered.container.querySelector<HTMLSelectElement>('select[aria-label="출석 추이 기간"]')

    expect(periodSelect?.value).toBe('last-4-weeks')
    expect(Array.from(periodSelect?.options ?? []).map((option) => option.value))
      .toEqual(['last-4-weeks', 'last-3-months'])
    expect(rendered.container.querySelectorAll('.admin-trend-point')).toHaveLength(4)
    expect(rendered.container.querySelector('button')).toBeNull()
  })

  it('updates service attendance bars for the selected date', async () => {
    rendered = await renderDashboard()
    const dateInput = rendered.container.querySelector<HTMLInputElement>('input[aria-label="예배 출석 날짜"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set

    if (!dateInput || !setter) {
      throw new Error('Unable to set service attendance date')
    }

    await act(async () => {
      setter.call(dateInput, '2026-08-03')
      dateInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(dateInput.value).toBe('2026-08-03')
    const expected = selectServiceAverages(ADMIN_DEMO_FIXTURES, {
      dateRange: { from: '2026-08-03', to: '2026-08-03' },
    })
    expected.forEach((average) => {
      const row = rendered?.container.querySelector(`[data-service-part="${average.part}"]`)
      expect(row?.textContent).toContain(`${average.attendedCount.toLocaleString('ko-KR')}명 참석`)
    })
  })

  it('uses actual repository check-ins for trend and service comparison charts', async () => {
    const totalsByDate = new Map([
      ['2026-07-26', 1],
      ['2026-08-02', 2],
      ['2026-08-09', 3],
      ['2026-08-16', 6],
    ])
    const getServiceAttendance = async (serviceKey: string): Promise<CurrentServiceAttendance> => {
      const totalCount = totalsByDate.get(serviceKey) ?? 0
      const rows = Array.from({ length: totalCount }, (_, index) => ({
        id: `${serviceKey}-${index}`,
        memberId: `m-${index}`,
        displayNameSnapshot: `교인 ${index}`,
        serviceKey,
        servicePart: (index < 1 ? 1 : index < 3 ? 2 : 3) as 1 | 2 | 3,
        submittedAt: new Date(`${serviceKey}T01:00:00.000Z`),
      }))
      return { serviceKey, totalCount, rows }
    }
    const repository = {
      getCurrentServiceConfig: async () => ({ serviceKey: '2026-08-16' }),
      getServiceAttendance,
    } as unknown as AttendanceRepository

    rendered = await renderDashboard(repository)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      await Promise.resolve()
    })

    expect(Array.from(rendered.container.querySelectorAll('.admin-trend-value')).map(
      (element) => element.textContent,
    )).toEqual(['1', '2', '3', '6'])
    expect(Array.from(rendered.container.querySelectorAll('.admin-service-column-value')).map(
      (element) => element.textContent,
    )).toEqual(['1명', '2명', '3명'])
    expect(rendered.container.querySelector<HTMLInputElement>('input[aria-label="예배 출석 날짜"]')?.value)
      .toBe('2026-08-16')
  })
})
