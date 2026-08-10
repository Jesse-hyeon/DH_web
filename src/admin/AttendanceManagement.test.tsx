import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import AttendanceManagement from './AttendanceManagement'
import { ADMIN_DEMO_FIXTURES } from './demoData'
import { selectAttendanceRows, selectPeriodDateRange, selectSessionTotals } from './selectors'
import type { AdminDemoFixtureBundle } from './types'

interface RenderedView {
  container: HTMLDivElement
  root: Root
}

async function renderView(fixtures: AdminDemoFixtureBundle = ADMIN_DEMO_FIXTURES): Promise<RenderedView> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<AttendanceManagement fixtures={fixtures} />)
  })

  return { container, root }
}

function setInputValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (!setter) {
    throw new Error('Unable to set form value')
  }
  setter.call(element, value)
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('AttendanceManagement', () => {
  let rendered: RenderedView | null = null

  afterEach(() => {
    if (rendered) {
      act(() => rendered?.root.unmount())
      rendered.container.remove()
      rendered = null
    }
    document.body.innerHTML = ''
  })

  it('defaults to current month and all services with privacy-safe rows and rates', async () => {
    rendered = await renderView()
    const { container } = rendered
    const expectedRows = selectAttendanceRows(ADMIN_DEMO_FIXTURES, {
      period: 'current-month',
      servicePart: 'all',
    })
    const expectedSessions = selectSessionTotals(ADMIN_DEMO_FIXTURES, {
      period: 'current-month',
      servicePart: 'all',
    })

    expect(container.querySelector('[data-testid="attendance-management"]')).toBeTruthy()
    expect(container.querySelector<HTMLSelectElement>('#attendance-period')?.value).toBe('current-month')
    expect(container.querySelector<HTMLSelectElement>('#attendance-service-part')?.value).toBe('all')
    expect(container.querySelector('label[for="attendance-period"]')?.textContent).toBe('조회 기간')
    expect(container.querySelector('label[for="attendance-service-part"]')?.textContent).toBe('예배 구분')
    expect(container.querySelector<HTMLSelectElement>('#attendance-period')?.getAttribute('aria-describedby')).toBe('attendance-filter-range')
    const range = selectPeriodDateRange(ADMIN_DEMO_FIXTURES, 'current-month')
    expect(container.querySelector('#attendance-filter-range')?.textContent)
      .toContain(`${range.from.replace(/-/g, '.')} - ${range.to.replace(/-/g, '.')}`)
    expect(container.querySelectorAll('.attendance-table tbody tr')).toHaveLength(Math.min(expectedRows.length, 100))
    expect(container.querySelectorAll('.attendance-table thead th')).toHaveLength(expectedSessions.length + 2)
    expect(container.querySelector('.attendance-table')?.textContent).toContain('2026.08.03')
    expect(container.querySelector('.attendance-table')?.textContent).toContain('2026.08.10')
    expect(container.textContent).toContain('김현우 A')
    expect(container.textContent).toContain('김현우 B')
    expect(container.textContent).not.toContain('admin-demo-member-')
    expect(container.querySelectorAll('.attendance-status').length).toBeGreaterThan(0)
    expect(container.querySelector('.attendance-rate-cell')?.textContent).toMatch(/%$/)
    const newMemberRow = Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      .find((row) => row.textContent?.includes('Synthetic new member'))
    expect(newMemberRow?.querySelector('.attendance-status.is-unrecorded')?.getAttribute('aria-label')).toBe('기록 없음')
  })

  it('updates rows, date columns, rates, and session totals for service and period filters', async () => {
    rendered = await renderView()
    const { container } = rendered
    const serviceSelect = container.querySelector<HTMLSelectElement>('#attendance-service-part')
    const periodSelect = container.querySelector<HTMLSelectElement>('#attendance-period')
    if (!serviceSelect || !periodSelect) {
      throw new Error('Unable to find attendance filters')
    }

    await act(async () => setInputValue(serviceSelect, '2'))
    const serviceRows = selectAttendanceRows(ADMIN_DEMO_FIXTURES, { period: 'current-month', servicePart: 2 })
    const serviceSessions = selectSessionTotals(ADMIN_DEMO_FIXTURES, { period: 'current-month', servicePart: 2 })
    expect(container.querySelectorAll('.attendance-table tbody tr')).toHaveLength(Math.min(serviceRows.length, 100))
    expect(container.querySelectorAll('.attendance-table thead th')).toHaveLength(serviceSessions.length + 2)
    expect(container.querySelector('.attendance-table')?.textContent).not.toContain('1부')
    expect(container.querySelector('.attendance-table')?.textContent).toContain('2부')

    await act(async () => setInputValue(periodSelect, 'all'))
    const allSessions = selectSessionTotals(ADMIN_DEMO_FIXTURES, { period: 'all', servicePart: 2 })
    expect(container.querySelectorAll('.attendance-session-list li')).toHaveLength(allSessions.length)
    expect(container.querySelector('.attendance-table')?.textContent).toContain('2026.07.20')
    expect(container.querySelector('.attendance-table')?.textContent).toContain('출석률')
  }, 15000)

  it('selects session detail and a member history panel independently', async () => {
    rendered = await renderView()
    const { container } = rendered
    const sessionButtons = container.querySelectorAll<HTMLButtonElement>('.attendance-session-list button')
    const memberButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.attendance-member-button'))
      .find((button) => button.textContent?.includes('김현우 A'))
    if (!sessionButtons[1] || !memberButton) {
      throw new Error('Unable to find session or member controls')
    }

    await act(async () => sessionButtons[1]?.click())
    expect(container.querySelector('#session-detail-title')?.textContent).toContain('부 세션 상세')
    expect(container.querySelector('.attendance-detail-list')?.textContent).toContain('참석 인원')

    await act(async () => memberButton.click())
    expect(container.querySelector('#member-history-title')?.textContent).toContain('김현우 A')
    expect(container.querySelector('.attendance-history-list li')).toBeTruthy()
    expect(container.querySelector('.attendance-history-summary')?.textContent).toContain('참석')
    expect(container.textContent).not.toContain('admin-demo-member-0001')
  })

  it('shows a clear no-result state and recovers when the query is cleared', async () => {
    rendered = await renderView()
    const { container } = rendered
    const search = container.querySelector<HTMLInputElement>('#attendance-member-search')
    if (!search) {
      throw new Error('Unable to find member search')
    }

    await act(async () => setInputValue(search, 'no matching synthetic member'))
    expect(container.querySelector('.attendance-table tbody')).toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('조건에 맞는 출석 기록이 없습니다')

    await act(async () => setInputValue(search, ''))
    expect(container.querySelector('.attendance-table tbody tr')).toBeTruthy()
  })

  it('shows empty states when the fixture has no attendance data', async () => {
    rendered = await renderView({
      ...ADMIN_DEMO_FIXTURES,
      dateRange: { from: ADMIN_DEMO_FIXTURES.referenceDate, to: ADMIN_DEMO_FIXTURES.referenceDate },
      members: [],
      sessions: [],
      events: [],
    })
    const { container } = rendered

    expect(container.querySelector('.attendance-table tbody')).toBeNull()
    expect(container.querySelector('.attendance-table-panel [role="status"]')?.textContent)
      .toContain('조건에 맞는 출석 기록이 없습니다')
    expect(container.querySelector('.attendance-session-list [role="status"]')?.textContent)
      .toBe('선택한 기간에 세션이 없습니다.')
    expect(container.querySelector('.attendance-session-detail [role="status"]')?.textContent)
      .toBe('선택한 기간에 예배 세션이 없습니다.')
    expect(container.querySelector('.attendance-history-panel [role="status"]')?.textContent)
      .toBe('회원 행을 선택하면 출석 이력을 확인할 수 있습니다.')
  })
})
