import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

import type { AdminDemoDate, AdminDemoServicePart } from './types'
import {
  getAttendanceTargetUrlForCurrentBrowser,
  withAttendanceSession,
} from '../lib/attendanceUrl'
import { toSeoulServiceKey } from '../lib/seoulDate'

const SERVICE_PARTS: ReadonlyArray<AdminDemoServicePart> = [1, 2, 3]

function formatDate(value: AdminDemoDate): string {
  return value.replace(/-/g, '.')
}

function parseDate(value: AdminDemoDate): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function formatAdminDate(value: Date): AdminDemoDate {
  return value.toISOString().slice(0, 10)
}

function nextSundayOnOrAfter(value: AdminDemoDate): AdminDemoDate {
  const date = parseDate(value)
  date.setUTCDate(date.getUTCDate() + (7 - date.getUTCDay()) % 7)
  return formatAdminDate(date)
}

function addDays(value: AdminDemoDate, days: number): AdminDemoDate {
  const date = parseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatAdminDate(date)
}

function weekOfMonth(value: AdminDemoDate): number {
  return Math.floor((parseDate(value).getUTCDate() - 1) / 7) + 1
}

interface QRDateOption {
  value: AdminDemoDate
  month: number
  weekNumber: number
  compactDate: string
  accessibleLabel: string
  isPast: boolean
}

const QR_YEAR_OPTIONS = [2026, 2027] as const
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1)

function sundayOptionsForYear(year: number, currentDate: AdminDemoDate): ReadonlyArray<QRDateOption> {
  const firstDay = `${year}-01-01`
  const firstSunday = addDays(firstDay, (7 - parseDate(firstDay).getUTCDay()) % 7)
  const options: QRDateOption[] = []

  for (let date = firstSunday; parseDate(date).getUTCFullYear() === year; date = addDays(date, 7)) {
    const parsed = parseDate(date)
    options.push({
      value: date,
      month: parsed.getUTCMonth() + 1,
      weekNumber: weekOfMonth(date),
      compactDate: `${String(parsed.getUTCMonth() + 1).padStart(2, '0')}.${String(parsed.getUTCDate()).padStart(2, '0')}`,
      accessibleLabel: `${parsed.getUTCMonth() + 1}월 ${weekOfMonth(date)}주차 예배 (${formatDate(date)})`,
      isPast: date < currentDate,
    })
  }

  return options
}

export interface QRGenerationProps {
  currentDate?: AdminDemoDate
  selectedDate?: AdminDemoDate
  onDateChange?: (date: AdminDemoDate | null) => void
}

export default function QRGeneration({
  currentDate = toSeoulServiceKey(),
  selectedDate,
  onDateChange,
}: QRGenerationProps) {
  const defaultQrDate = nextSundayOnOrAfter(currentDate)
  const initialDate = selectedDate ?? defaultQrDate
  const currentYear = parseDate(currentDate).getUTCFullYear()
  const currentMonth = parseDate(currentDate).getUTCMonth() + 1
  const [date, setDate] = useState<AdminDemoDate | null>(initialDate)
  const [year, setYear] = useState(parseDate(initialDate).getUTCFullYear())
  const [month, setMonth] = useState(parseDate(initialDate).getUTCMonth() + 1)
  const [error, setError] = useState('')
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null)
  const dateOptions = sundayOptionsForYear(year, currentDate)
  const visibleDateOptions = dateOptions.filter((option) => option.month === month)
  const attendanceTarget = getAttendanceTargetUrlForCurrentBrowser()

  useEffect(() => {
    onDateChange?.(date)
  }, [date, onDateChange])

  function selectCalendarPage(selectedYear: number, selectedMonth: number) {
    const firstAvailableDate = sundayOptionsForYear(selectedYear, currentDate)
      .find((option) => option.month === selectedMonth && !option.isPast)?.value ?? null

    setYear(selectedYear)
    setMonth(selectedMonth)
    setDate(firstAvailableDate)
    setError('')
    setCopiedSessionId(null)
  }

  function handleDateSelect(selectedDate: AdminDemoDate) {
    setDate(selectedDate)
    setError('')
  }

  async function copyQRCode(sessionId: string) {
    const svg = document.querySelector<SVGSVGElement>(`[data-qr-session-id="${sessionId}"]`)
    if (!svg || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
      setError('QR 이미지를 복사할 수 없습니다.')
      return
    }

    const svgMarkup = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(svgBlob)

    try {
      const image = new Image()
      image.src = objectUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('QR 이미지 변환 실패'))
      })

      const canvas = document.createElement('canvas')
      canvas.width = Number(svg.getAttribute('width')) || 140
      canvas.height = Number(svg.getAttribute('height')) || 140
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!pngBlob) {
        throw new Error('QR 이미지 변환 실패')
      }

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
      setCopiedSessionId(sessionId)
      setError('')
      window.setTimeout(() => setCopiedSessionId((current) => current === sessionId ? null : current), 1600)
    } catch {
      setError('QR 이미지를 복사할 수 없습니다.')
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  return (
    <section className="qr-generation" data-testid="qr-generation" aria-labelledby="qr-generation-title">
      <section className="admin-dashboard-panel" aria-labelledby="qr-generation-form-title">
        <div className="admin-panel-heading">
          <div>
            <h2 id="qr-generation-form-title">QR 관리</h2>
          </div>
        </div>

        <div className="qr-generation-form">
          <div className="qr-generation-picker">
            <div className="qr-year-picker">
              <span className="admin-field-label">연도</span>
              <div className="qr-year-options" role="tablist" aria-label="예배 연도 선택">
                {QR_YEAR_OPTIONS.map((option) => (
                  <button
                    className={year === option ? 'is-selected' : undefined}
                    type="button"
                    role="tab"
                    aria-selected={year === option}
                    key={option}
                    onClick={() => {
                      selectCalendarPage(option, option === currentYear ? currentMonth : 1)
                    }}
                  >
                    {option}년
                  </button>
                ))}
              </div>
            </div>
            <span className="admin-field-label">예배일</span>
            <div className="qr-month-options" role="tablist" aria-label="예배 월 선택">
              {MONTH_OPTIONS.map((option) => (
                <button
                  className={month === option ? 'is-selected' : undefined}
                  type="button"
                  role="tab"
                  aria-selected={month === option}
                  key={option}
                  onClick={() => selectCalendarPage(year, option)}
                >
                  {option}월
                </button>
              ))}
            </div>
            <div className="qr-selected-month-heading">
              <h3>{month}월 예배</h3>
            </div>
            <div className="qr-week-options" role="listbox" aria-label={`${month}월 예배일 선택`}>
              {visibleDateOptions.map((option) => (
                <button
                  className={`qr-date-option ${date === option.value ? 'is-selected' : ''} ${option.isPast ? 'is-past' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={date === option.value}
                  aria-label={option.accessibleLabel}
                  disabled={option.isPast}
                  key={option.value}
                  onClick={() => handleDateSelect(option.value)}
                >
                  <span>{option.weekNumber}주차</span>
                  <strong>{option.compactDate}</strong>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {!attendanceTarget.ok && (
            <div className="notice notice-error" role="alert">
              QR을 만들기 전에 실제 출석 URL을 설정해 주세요. {attendanceTarget.error}
            </div>
          )}
          {attendanceTarget.ok && (date ? (
            <section className="qr-selected-sessions" aria-labelledby="qr-selected-date-title">
              <div className="qr-selected-month-heading">
                <h3 id="qr-selected-date-title">{formatDate(date)} QR</h3>
              </div>
              <div className="qr-session-part-links">
                {SERVICE_PARTS.map((part) => {
                  const sessionId = `service-${date}-${part}`
                  const sessionUrl = withAttendanceSession(attendanceTarget.url, date, part)

                  return (
                    <div className="qr-session-part-card" key={part}>
                      <strong>{part}부 예배</strong>
                      <QRCodeSVG
                        data-attendance-url={sessionUrl}
                        data-qr-session-id={sessionId}
                        data-testid="attendance-session-qr-code"
                        value={sessionUrl}
                        size={140}
                        level="M"
                        marginSize={3}
                        title={`${part}부 출석 QR`}
                      />
                      <button className="qr-copy-button" type="button" onClick={() => void copyQRCode(sessionId)}>
                        {copiedSessionId === sessionId ? '복사됨' : 'QR 이미지 복사'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : (
            <p className="qr-empty-month" role="status">선택할 수 있는 예배일이 없습니다.</p>
          ))}
        </div>
      </section>
    </section>
  )
}
