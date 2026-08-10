import { useEffect, useState, type MouseEvent } from 'react'

import AdminDashboard from './AdminDashboard'
import AttendanceManagement from './AttendanceManagement'
import QRGeneration from './QRGeneration'
import './adminShell.css'

export type AdminViewId = 'dashboard' | 'qr-generation' | 'attendance-management'

interface AdminViewDefinition {
  id: AdminViewId
  label: string
  description: string
}

export const ADMIN_VIEWS: ReadonlyArray<AdminViewDefinition> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: '관리 현황을 한눈에 확인하는 화면입니다.',
  },
  {
    id: 'qr-generation',
    label: 'QR Generation',
    description: '출석용 QR 생성을 준비하는 화면입니다.',
  },
  {
    id: 'attendance-management',
    label: 'Attendance Management',
    description: '출석 관리를 준비하는 화면입니다.',
  },
]

const DEFAULT_ADMIN_VIEW: AdminViewId = 'dashboard'
const ADMIN_VIEW_QUERY = 'view'

function isAdminViewId(value: string | null): value is AdminViewId {
  return ADMIN_VIEWS.some((view) => view.id === value)
}

export function getAdminViewFromSearch(search: string): AdminViewId {
  const view = new URLSearchParams(search).get(ADMIN_VIEW_QUERY)
  return isAdminViewId(view) ? view : DEFAULT_ADMIN_VIEW
}

function getAdminViewHref(view: AdminViewId): string {
  if (view === DEFAULT_ADMIN_VIEW) {
    return '/admin'
  }

  return `/admin?${ADMIN_VIEW_QUERY}=${view}`
}

function updateAdminViewUrl(view: AdminViewId): void {
  const url = new URL(window.location.href)

  if (view === DEFAULT_ADMIN_VIEW) {
    url.searchParams.delete(ADMIN_VIEW_QUERY)
  } else {
    url.searchParams.set(ADMIN_VIEW_QUERY, view)
  }

  const search = url.searchParams.toString()
  const nextUrl = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
  window.history.pushState({}, '', nextUrl)
}

export default function AdminShell() {
  const [activeView, setActiveView] = useState<AdminViewId>(() => (
    getAdminViewFromSearch(window.location.search)
  ))

  useEffect(() => {
    const handlePopState = () => {
      setActiveView(getAdminViewFromSearch(window.location.search))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const selectedView = ADMIN_VIEWS.find((view) => view.id === activeView) ?? ADMIN_VIEWS[0]

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>, view: AdminViewId) {
    event.preventDefault()
    if (view === activeView) {
      return
    }

    updateAdminViewUrl(view)
    setActiveView(view)
  }

  return (
    <div className="admin-shell-layout">
      <aside className="admin-sidebar" aria-label="관리자 영역">
        <div className="admin-brand">
          <p className="admin-brand-eyebrow">Admin</p>
          <strong>관리자</strong>
        </div>

        <nav className="admin-navigation" aria-label="관리자 메뉴">
          <ul>
            {ADMIN_VIEWS.map((view) => (
              <li key={view.id}>
                <a
                  href={getAdminViewHref(view.id)}
                  aria-current={view.id === activeView ? 'page' : undefined}
                  className={view.id === activeView ? 'is-active' : undefined}
                  onClick={(event) => handleNavigation(event, view.id)}
                >
                  {view.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="admin-main" aria-labelledby="admin-shell-title">
        <header className="admin-page-header">
          <div>
            <p className="admin-page-eyebrow">Admin workspace</p>
            <h1 id="admin-shell-title">{selectedView.label}</h1>
          </div>
        </header>
        {selectedView.id === 'dashboard' ? <AdminDashboard /> : selectedView.id === 'qr-generation' ? <QRGeneration /> : <AttendanceManagement />}
      </main>
    </div>
  )
}
