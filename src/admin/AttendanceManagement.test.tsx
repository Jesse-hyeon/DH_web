import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AttendanceRepository } from '../lib/attendanceRepository'
import type { ServiceKey } from '../domain/types'
import AttendanceManagement, {
  buildAttendanceExcelXml,
  mergeCurrentServiceAttendance,
} from './AttendanceManagement'
import { ADMIN_DEMO_FIXTURES } from './demoData'
import { selectAttendanceRows, selectSessionTotals } from './selectors'
import type { AdminDemoFixtureBundle } from './types'

interface RenderedView {
  container: HTMLDivElement
  root: Root
}

async function renderView(
  fixtures: AdminDemoFixtureBundle = ADMIN_DEMO_FIXTURES,
  repository?: AttendanceRepository,
  serviceDate?: ServiceKey,
): Promise<RenderedView> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <AttendanceManagement fixtures={fixtures} repository={repository} serviceDate={serviceDate} />,
    )
    await Promise.resolve()
  })
  return { container, root }
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (!setter) {
    throw new Error('Unable to set input value')
  }
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
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

  it('renders the member attendance table for the recent four weeks by default', async () => {
    rendered = await renderView()
    const { container } = rendered
    const expectedRows = selectAttendanceRows(ADMIN_DEMO_FIXTURES, { period: 'last-4-weeks', servicePart: 'all' })
    const expectedSessions = selectSessionTotals(ADMIN_DEMO_FIXTURES, { period: 'last-4-weeks', servicePart: 'all' })

    expect(container.querySelector('[data-testid="attendance-management"]')).toBeTruthy()
    expect(container.querySelector('h2')?.textContent).toBe('교인별 출석 현황')
    expect(container.querySelector('.attendance-table-title-group')?.textContent).toContain('전체 교인 2,000명')
    expect(container.querySelector('.attendance-table thead th')?.textContent).toBe('교인')
    expect(container.querySelector<HTMLInputElement>('[aria-label="교인 검색"]')).toBeTruthy()
    expect(container.querySelectorAll('.attendance-table tbody tr')).toHaveLength(Math.min(expectedRows.length, 100))
    const expectedDates = new Set(expectedSessions.map((total) => total.session.date))
    expect(container.querySelectorAll('.attendance-table thead th')).toHaveLength(expectedDates.size + 2)
    expect(container.querySelector('.attendance-table')?.textContent).toContain('2026.07.26')
    expect(container.querySelector('.attendance-table')?.textContent).toContain('2026.08.16')
    expect(container.querySelectorAll('.attendance-status').length).toBeGreaterThan(0)
    expect(container.querySelector('.attendance-table')?.textContent).toContain('1부')
    expect(container.querySelector('.attendance-table')?.textContent).not.toContain('세션별 출석')
    expect(container.querySelector('.attendance-table')?.textContent).not.toContain('주차별 출석')
  })

  it('filters members by name', async () => {
    rendered = await renderView()
    const { container } = rendered
    const search = container.querySelector<HTMLInputElement>('#attendance-member-search')
    if (!search) {
      throw new Error('Unable to find member search')
    }

    await act(async () => setInputValue(search, '김민준'))

    expect(container.querySelectorAll('.attendance-table tbody tr')).toHaveLength(1)
    expect(container.querySelector('.attendance-table')?.textContent).toContain('김민준')
  })

  it('opens a member detail modal with attendance and profile information', async () => {
    rendered = await renderView()
    const { container } = rendered
    const memberButton = container.querySelector<HTMLButtonElement>('.attendance-member-button')
    if (!memberButton) {
      throw new Error('Unable to find member detail button')
    }

    await act(async () => memberButton.click())

    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('교인 상세')
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('등록 시점')
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('주로 참석하는 예배')
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('출석 추이')
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('전체 기간')
    expect(container.querySelectorAll('.attendance-detail-date')).toHaveLength(26)

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="상세 정보 닫기"]')?.click()
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it.each([
    ['last-4-weeks', 4, '2026.07.26', '2026.07.19'],
    ['last-3-months', 11, '2026.06.07', '2026.05.31'],
    ['all', 26, '2026.02.22', undefined],
  ] as const)('applies the %s period to the attendance table', async (period, dateCount, includedDate, excludedDate) => {
    rendered = await renderView()
    const { container } = rendered
    const periodButton = container.querySelector<HTMLButtonElement>(`[data-period="${period}"]`)
    if (!periodButton) {
      throw new Error('Unable to find attendance period button')
    }

    await act(async () => periodButton.click())

    expect(container.querySelectorAll('.attendance-table thead th')).toHaveLength(dateCount + 2)
    expect(container.querySelector('.attendance-table')?.textContent).toContain(includedDate)
    if (excludedDate) {
      expect(container.querySelector('.attendance-table')?.textContent).not.toContain(excludedDate)
    }
  })

  it('shows a simple no-result message', async () => {
    rendered = await renderView()
    const { container } = rendered
    const search = container.querySelector<HTMLInputElement>('#attendance-member-search')
    if (!search) {
      throw new Error('Unable to find member search')
    }

    await act(async () => setInputValue(search, '없는 회원'))

    expect(container.querySelector('.attendance-table')).toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent).toBe('검색 결과가 없습니다.')
  })

  it('builds an Excel workbook from only the selected period dates', () => {
    const rows = selectAttendanceRows(ADMIN_DEMO_FIXTURES, {
      period: 'last-4-weeks',
      servicePart: 'all',
    })
    const dates = [...new Set(selectSessionTotals(ADMIN_DEMO_FIXTURES, {
      period: 'last-4-weeks',
      servicePart: 'all',
    }).map((total) => total.session.date))]
    const workbook = buildAttendanceExcelXml(rows, dates)

    expect(workbook).toContain('ss:Name="출석부"')
    expect(workbook).toContain('교인')
    expect(workbook).toContain('교구')
    expect(workbook).toContain('출석률')
    expect(workbook).toContain('2026.07.26')
    expect(workbook).toContain('2026.08.16')
    expect(workbook).not.toContain('2026.07.19')
    expect(workbook).toMatch(/[123]부|미확인/)
  })

  it('labels the Excel download with the active attendance period', async () => {
    rendered = await renderView()
    const periodButton = rendered.container.querySelector<HTMLButtonElement>('[data-period="last-3-months"]')
    if (!periodButton) throw new Error('Unable to find period button')

    await act(async () => periodButton.click())

    expect(rendered.container.querySelector<HTMLButtonElement>('.attendance-export-button')?.ariaLabel)
      .toBe('최근 3개월 출석부 엑셀 다운로드')
  })

  it('shows an explicit retry message when live attendance cannot be loaded', async () => {
    const repository = {
      getCurrentServiceConfig: vi.fn().mockResolvedValue({ serviceKey: '2026-08-16' }),
      getServiceAttendance: vi.fn().mockRejectedValue(new Error('offline')),
    } as unknown as AttendanceRepository

    rendered = await renderView(ADMIN_DEMO_FIXTURES, repository)
    await act(async () => {
      await Promise.resolve()
    })

    expect(rendered.container.querySelector('[role="alert"]')?.textContent)
      .toBe('실시간 출석 정보를 불러오지 못했습니다. 화면을 새로고침해 주세요.')
  })

  it('reloads all bounded period rows only when the administrator requests it', async () => {
    const getServiceAttendance = vi.fn().mockImplementation(async (serviceKey: string) => ({
      serviceKey,
      totalCount: 0,
      rows: [],
    }))
    const repository = {
      getCurrentServiceConfig: vi.fn().mockResolvedValue({ serviceKey: '2026-08-16' }),
      getServiceAttendance,
    } as unknown as AttendanceRepository

    rendered = await renderView(ADMIN_DEMO_FIXTURES, repository)
    await act(async () => {
      await Promise.resolve()
    })
    const refreshButton = rendered.container.querySelector<HTMLButtonElement>('.attendance-refresh-button')
    if (!refreshButton) throw new Error('Unable to find attendance refresh button')

    await act(async () => {
      refreshButton.click()
      await Promise.resolve()
    })

    expect(getServiceAttendance).toHaveBeenCalledTimes(8)
    expect(getServiceAttendance).toHaveBeenLastCalledWith('2026-08-16', 2_000)
  })

  it('loads the service date selected in QR management instead of the separate current config', async () => {
    const getServiceAttendance = vi.fn().mockResolvedValue({
      serviceKey: '2026-08-23',
      totalCount: 0,
      rows: [],
    })
    const getCurrentServiceAttendance = vi.fn()
    const repository = {
      getCurrentServiceAttendance,
      getServiceAttendance,
    } as unknown as AttendanceRepository

    rendered = await renderView(ADMIN_DEMO_FIXTURES, repository, '2026-08-23')
    await act(async () => {
      await Promise.resolve()
    })

    expect(getServiceAttendance).toHaveBeenCalledWith('2026-08-23', 2_000)
    expect(getCurrentServiceAttendance).not.toHaveBeenCalled()
    expect(rendered.container.textContent).toContain('2026.08.23')
  })

  it('merges a QR attendance record into the same member ID and keeps the first service part', () => {
    const input = mergeCurrentServiceAttendance(ADMIN_DEMO_FIXTURES, {
      serviceKey: '2026-08-16',
      totalCount: 2,
      rows: [
        {
          id: 'later',
          memberId: 'm-001',
          displayNameSnapshot: '김현우',
          serviceKey: '2026-08-16',
          servicePart: 3,
          submittedAt: new Date('2026-08-16T03:00:00.000Z'),
        },
        {
          id: 'first',
          memberId: 'm-001',
          displayNameSnapshot: '김현우',
          serviceKey: '2026-08-16',
          servicePart: 2,
          submittedAt: new Date('2026-08-16T01:00:00.000Z'),
        },
      ],
    })
    const row = selectAttendanceRows(input, {
      dateRange: { from: '2026-08-16', to: '2026-08-16' },
      servicePart: 'all',
    }).find((candidate) => candidate.member.id === 'm-001')

    expect(row?.member.label).toBe('김현우')
    expect(row?.events).toEqual([
      expect.objectContaining({ memberId: 'm-001', part: 2, status: 'attended' }),
    ])
  })

  it('adds the current Firebase Sunday when it is newer than the fixed demo history', () => {
    const input = mergeCurrentServiceAttendance(ADMIN_DEMO_FIXTURES, {
      serviceKey: '2026-08-23',
      totalCount: 0,
      rows: [],
    })
    const rows = selectAttendanceRows(input, { period: 'last-4-weeks', servicePart: 'all' })

    expect(input.referenceDate).toBe('2026-08-23')
    expect(input.sessions.filter((session) => session.date === '2026-08-23')).toHaveLength(3)
    expect(rows[0]?.events).toContainEqual(expect.objectContaining({ date: '2026-08-23', status: 'missed' }))
  })
})
