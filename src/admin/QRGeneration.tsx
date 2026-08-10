import { useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'

import { ADMIN_DEMO_REFERENCE_DATE } from './demoData'
import {
  createDemoSession,
  createDemoSessionUrl,
  deactivateDemoSession,
  listDemoSessions,
  type AdminDemoSession,
} from './demoSessionStore'
import type { AdminDemoDate, AdminDemoServicePart } from './types'

const SERVICE_PARTS: ReadonlyArray<AdminDemoServicePart> = [1, 2, 3]

function formatDate(value: AdminDemoDate): string {
  return value.replace(/-/g, '.')
}

function formatStatus(status: AdminDemoSession['status']): string {
  return status === 'active' ? '활성' : '비활성'
}

function toServicePart(value: string): AdminDemoServicePart | undefined {
  if (value === '1' || value === '2' || value === '3') {
    return Number(value) as AdminDemoServicePart
  }

  return undefined
}

function sessionTag(
  part: AdminDemoServicePart,
  date: AdminDemoDate,
  startsAt: string,
  sequence: number,
): string {
  return `demo-service-${part}-${date}-${startsAt.replace(':', '')}-${String(sequence).padStart(2, '0')}`
}

function SessionRow({ session, onDeactivate }: {
  session: AdminDemoSession
  onDeactivate: (sessionId: string) => void
}) {
  return (
    <li className="qr-session-row" data-session-id={session.id}>
      <div className="qr-session-details">
        <strong>{session.tag}</strong>
        <span>{session.part}부 · {formatDate(session.date)} · {session.startsAt}</span>
        <a href={session.url}>참여 링크</a>
      </div>
      <div className="qr-session-actions">
        <span className={`admin-status-pill is-${session.status}`}>{formatStatus(session.status)}</span>
        {session.status === 'active' && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => onDeactivate(session.id)}
          >
            비활성화
          </button>
        )}
      </div>
    </li>
  )
}

export default function QRGeneration() {
  const [part, setPart] = useState(String(2))
  const [date, setDate] = useState<AdminDemoDate>(ADMIN_DEMO_REFERENCE_DATE)
  const [startsAt, setStartsAt] = useState('11:00')
  const [sessions, setSessions] = useState<ReadonlyArray<AdminDemoSession>>(() => listDemoSessions())
  const [selectedSession, setSelectedSession] = useState<AdminDemoSession | null>(null)
  const [error, setError] = useState('')

  function refreshSessions() {
    setSessions(listDemoSessions())
  }

  function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const servicePart = toServicePart(part)

    if (!servicePart || !date || !startsAt) {
      setError('예배 부서, 예배일, 시작 시간을 모두 입력해 주세요.')
      return
    }

    try {
      const session = createDemoSession({
        part: servicePart,
        date,
        startsAt,
        tag: sessionTag(servicePart, date, startsAt, listDemoSessions().length + 1),
      })
      setSelectedSession(session)
      setError('')
      refreshSessions()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'QR 세션을 만들 수 없습니다.')
    }
  }

  function handleDeactivate(sessionId: string) {
    deactivateDemoSession(sessionId)
    refreshSessions()
    setSelectedSession((current) => current?.id === sessionId
      ? listDemoSessions().find((session) => session.id === sessionId) ?? null
      : current)
  }

  return (
    <section className="qr-generation" data-testid="qr-generation" aria-labelledby="qr-generation-title">
      <div className="qr-generation-grid">
        <section className="admin-dashboard-panel" aria-labelledby="qr-generation-form-title">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-panel-kicker">Demo session</p>
              <h2 id="qr-generation-form-title">새 QR 만들기</h2>
            </div>
            <span className="admin-panel-meta">같은 브라우저에서만 유지</span>
          </div>

          <form className="qr-generation-form" onSubmit={handleGenerate}>
            <label className="admin-field-label" htmlFor="demo-service-part">예배 부서</label>
            <select
              id="demo-service-part"
              required
              value={part}
              onChange={(event) => setPart(event.currentTarget.value)}
            >
              {SERVICE_PARTS.map((servicePart) => (
                <option key={servicePart} value={servicePart}>{servicePart}부 예배</option>
              ))}
            </select>

            <label className="admin-field-label" htmlFor="demo-service-date">예배일</label>
            <input
              id="demo-service-date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.currentTarget.value)}
            />

            <label className="admin-field-label" htmlFor="demo-service-time">시작 시간</label>
            <input
              id="demo-service-time"
              type="time"
              required
              value={startsAt}
              onChange={(event) => setStartsAt(event.currentTarget.value)}
            />

            {error && <div className="notice notice-error" role="alert">{error}</div>}
            <button className="primary-button" type="submit">QR 생성하기</button>
          </form>
        </section>

        <section className="admin-dashboard-panel" aria-labelledby="qr-generation-title">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-panel-kicker">QR preview</p>
              <h2 id="qr-generation-title">생성된 QR 미리보기</h2>
            </div>
          </div>

          {selectedSession ? (
            <div className="qr-generation-preview">
              <div className="qr-code-frame" aria-label="데모 출석 QR 코드">
                <QRCodeSVG
                  data-testid="demo-session-qr-code"
                  value={createDemoSessionUrl(selectedSession.id)}
                  size={220}
                  level="M"
                  marginSize={4}
                  title="데모 출석 QR"
                />
              </div>
              <strong>{selectedSession.label}</strong>
              <a className="qr-target-url" href={selectedSession.url}>{selectedSession.url}</a>
            </div>
          ) : (
            <p className="admin-empty-state" role="status">예배 정보를 입력하면 QR 미리보기가 표시됩니다.</p>
          )}
        </section>
      </div>

      <section className="admin-dashboard-panel" aria-labelledby="qr-session-list-title">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-panel-kicker">Session history</p>
            <h2 id="qr-session-list-title">QR 세션 목록</h2>
          </div>
          <span className="admin-panel-meta">{sessions.length}개</span>
        </div>

        {sessions.length === 0 ? (
          <p className="admin-empty-state" role="status">생성된 QR 세션이 없습니다.</p>
        ) : (
          <ul className="qr-session-list">
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} onDeactivate={handleDeactivate} />
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
