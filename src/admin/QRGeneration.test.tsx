import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import QRGeneration from './QRGeneration'

interface RenderedView {
  container: HTMLDivElement
  root: Root
}

async function renderView(currentDate = '2026-08-11'): Promise<RenderedView> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<QRGeneration currentDate={currentDate} />)
  })

  return { container, root }
}

describe('QRGeneration', () => {
  let rendered: RenderedView | null = null

  beforeEach(() => {
    vi.stubEnv('VITE_ATTENDANCE_URL', 'http://localhost:5173/attend')
  })

  afterEach(() => {
    if (rendered) {
      act(() => rendered?.root.unmount())
      rendered.container.remove()
      rendered = null
    }
    document.body.innerHTML = ''
    vi.unstubAllEnvs()
  })

  it('shows three service QR codes for the selected date', async () => {
    rendered = await renderView()
    const dateOption = rendered.container.querySelector<HTMLButtonElement>('.qr-date-option:not(:disabled)')

    await act(async () => dateOption?.click())

    expect(rendered.container.querySelectorAll('.qr-session-part-card')).toHaveLength(3)
    expect(rendered.container.querySelectorAll('[data-testid="attendance-session-qr-code"]')).toHaveLength(3)
    expect(Array.from(rendered.container.querySelectorAll('[data-attendance-url]')).map(
      (element) => element.getAttribute('data-attendance-url'),
    )).toEqual([
      'http://localhost:5173/attend?serviceDate=2026-08-16&servicePart=1',
      'http://localhost:5173/attend?serviceDate=2026-08-16&servicePart=2',
      'http://localhost:5173/attend?serviceDate=2026-08-16&servicePart=3',
    ])
    expect(rendered.container.querySelectorAll('.qr-copy-button')).toHaveLength(3)
    expect(rendered.container.querySelector('.qr-copy-button')?.textContent).toBe('QR 이미지 복사')
  })

  it('keeps the three service QR codes unique when a date is selected repeatedly', async () => {
    rendered = await renderView()
    const dateOptions = rendered.container.querySelectorAll<HTMLButtonElement>('.qr-date-option:not(:disabled)')

    await act(async () => dateOptions[0]?.click())
    await act(async () => dateOptions[0]?.click())

    expect(rendered.container.querySelectorAll('.qr-session-part-card')).toHaveLength(3)
    expect(rendered.container.querySelectorAll('.qr-copy-button')).toHaveLength(3)
    expect(rendered.container.querySelectorAll('.admin-status-pill')).toHaveLength(0)
  })

  it('shows every Sunday in the selected year and disables past dates', async () => {
    rendered = await renderView()
    expect(rendered.container.querySelectorAll('.qr-date-option')).toHaveLength(5)
    expect(rendered.container.querySelectorAll('.qr-month-options button')).toHaveLength(12)
    expect(rendered.container.querySelectorAll('.qr-date-option:disabled').length).toBeGreaterThan(0)
    expect(rendered.container.querySelectorAll('.qr-session-part-card')).toHaveLength(3)
  })

  it('does not render copyable QR codes when the attendance URL is invalid', async () => {
    vi.stubEnv('VITE_ATTENDANCE_URL', 'not-a-valid-url')
    rendered = await renderView()

    expect(rendered.container.querySelector('[role="alert"]')).toBeTruthy()
    expect(rendered.container.querySelectorAll('[data-testid="attendance-session-qr-code"]')).toHaveLength(0)
    expect(rendered.container.querySelectorAll('.qr-copy-button')).toHaveLength(0)
  })

  it('selects the same day when the current date is Sunday', async () => {
    rendered = await renderView('2026-08-16')

    expect(rendered.container.querySelector('#qr-selected-date-title')?.textContent)
      .toBe('2026.08.16 QR')
  })

  it('clears stale QR codes when a past month is selected and resets them for a future year', async () => {
    rendered = await renderView()
    const januaryButton = Array.from(
      rendered.container.querySelectorAll<HTMLButtonElement>('.qr-month-options button'),
    ).find((button) => button.textContent === '1월')

    await act(async () => januaryButton?.click())

    expect(rendered.container.querySelectorAll('.qr-session-part-card')).toHaveLength(0)
    expect(rendered.container.textContent).toContain('선택할 수 있는 예배일이 없습니다.')

    const year2027Button = Array.from(
      rendered.container.querySelectorAll<HTMLButtonElement>('.qr-year-options button'),
    ).find((button) => button.textContent === '2027년')

    await act(async () => year2027Button?.click())

    expect(rendered.container.querySelector('#qr-selected-date-title')?.textContent)
      .toBe('2027.01.03 QR')
    expect(Array.from(rendered.container.querySelectorAll('[data-attendance-url]')).map(
      (element) => element.getAttribute('data-attendance-url'),
    )).toEqual([
      'http://localhost:5173/attend?serviceDate=2027-01-03&servicePart=1',
      'http://localhost:5173/attend?serviceDate=2027-01-03&servicePart=2',
      'http://localhost:5173/attend?serviceDate=2027-01-03&servicePart=3',
    ])
  })
})
