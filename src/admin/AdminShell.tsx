import { useCallback, useEffect, useState, type MouseEvent } from 'react'

import type { AttendanceRepository } from '../lib/attendanceRepository'
import { parseAttendanceServiceDate } from '../lib/attendanceUrl'
import type { ServiceKey } from '../domain/types'
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
    label: '대시보드',
    description: '관리 현황을 한눈에 확인하는 화면입니다.',
  },
  {
    id: 'qr-generation',
    label: 'QR 관리',
    description: '출석용 QR을 관리하는 화면입니다.',
  },
  {
    id: 'attendance-management',
    label: '출석 관리',
    description: '출석 관리를 준비하는 화면입니다.',
  },
]

const DEFAULT_ADMIN_VIEW: AdminViewId = 'dashboard'
const ADMIN_VIEW_QUERY = 'view'
const ADMIN_SERVICE_DATE_QUERY = 'serviceDate'

function AdminNavigationIcon({ view }: { view: AdminViewId }) {
  if (view === 'dashboard') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3" y="3" width="5" height="5" rx="1" />
        <rect x="12" y="3" width="5" height="5" rx="1" />
        <rect x="3" y="12" width="5" height="5" rx="1" />
        <rect x="12" y="12" width="5" height="5" rx="1" />
      </svg>
    )
  }

  if (view === 'qr-generation') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 8V4a1 1 0 0 1 1-1h4M12 3h4a1 1 0 0 1 1 1v4M17 12v4a1 1 0 0 1-1 1h-4M8 17H4a1 1 0 0 1-1-1v-4" />
        <rect x="7" y="7" width="6" height="6" rx="1.5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 4h8M7.5 10h8M7.5 16h8" />
      <path d="m3 4 1 1 2-2M3 10l1 1 2-2M3 16l1 1 2-2" />
    </svg>
  )
}

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

function updateAdminServiceDateUrl(serviceDate: ServiceKey | null): void {
  const url = new URL(window.location.href)
  if (serviceDate) {
    url.searchParams.set(ADMIN_SERVICE_DATE_QUERY, serviceDate)
  } else {
    url.searchParams.delete(ADMIN_SERVICE_DATE_QUERY)
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

export interface AdminShellProps {
  repository: AttendanceRepository
}

export default function AdminShell({ repository }: AdminShellProps) {
  const [activeView, setActiveView] = useState<AdminViewId>(() => (
    getAdminViewFromSearch(window.location.search)
  ))
  const [selectedServiceDate, setSelectedServiceDate] = useState<ServiceKey | undefined>(() => (
    parseAttendanceServiceDate(window.location.search)
  ))

  useEffect(() => {
    const handlePopState = () => {
      setActiveView(getAdminViewFromSearch(window.location.search))
      setSelectedServiceDate(parseAttendanceServiceDate(window.location.search))
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

  const handleServiceDateChange = useCallback((date: ServiceKey | null) => {
    setSelectedServiceDate(date ?? undefined)
    updateAdminServiceDateUrl(date)
  }, [])

  return (
    <div className="admin-shell-layout">
      <aside className="admin-sidebar" aria-label="관리자 영역">
        <div className="admin-brand">
          <strong>대흥교회<br />출석관리 시스템</strong>
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
                  <span className="admin-navigation-icon">
                    <AdminNavigationIcon view={view.id} />
                  </span>
                  <span>{view.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="admin-main" aria-label="관리자 화면">
        {selectedView.id === 'dashboard'
          ? <AdminDashboard repository={repository} />
          : selectedView.id === 'qr-generation'
            ? (
              <QRGeneration
                selectedDate={selectedServiceDate}
                onDateChange={handleServiceDateChange}
              />
            )
            : <AttendanceManagement repository={repository} serviceDate={selectedServiceDate} />}
      </main>
    </div>
  )
}
