import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import {
  createDemoSession,
  deactivateDemoSession,
  listDemoSubmissions,
  resetDemoSessionStore,
} from './admin/demoSessionStore'
import { generateMembers, type PublicMember } from './data/members'
import type {
  DemoAttendanceDraft,
  DemoAttendanceRecord,
  DemoAttendanceRepository,
} from './lib/demoAttendanceStore'
import { MAX_ADMIN_ROWS, type CurrentServiceAttendance } from './lib/attendanceRepository'

const serviceKey = '2026-08-10'

afterEach(() => {
  vi.unstubAllEnvs()
})

interface RenderedApp {
  container: HTMLDivElement
  root: Root
}

function createRepository(options: {
  members?: PublicMember[]
  submit?: (draft: DemoAttendanceDraft) => Promise<DemoAttendanceRecord>
  serviceKey?: string
  submissions?: () => Promise<DemoAttendanceRecord[]>
  listMemberHistory?: (memberId: string, limit?: number) => Promise<DemoAttendanceRecord[]>
  getCurrentServiceConfig?: () => Promise<{ serviceKey: string }>
} = {}): DemoAttendanceRepository {
  const registeredMembers = options.members ?? generateMembers()

  return {
    async listRegisteredMembers() {
      return registeredMembers
    },
    async getCurrentServiceConfig() {
      if (options.getCurrentServiceConfig) {
        return options.getCurrentServiceConfig()
      }

      return { serviceKey: options.serviceKey ?? serviceKey }
    },
    async submitAttendance(draft) {
      if (options.submit) {
        return options.submit(draft)
      }

      return {
        ...draft,
        id: 'submitted-1',
        submittedAt: new Date('2026-08-10T01:00:00.000Z'),
        countForMemberService: 1,
      }
    },
    async getCurrentServiceAttendance(limit?: number): Promise<CurrentServiceAttendance> {
      const config = options.getCurrentServiceConfig
        ? await options.getCurrentServiceConfig()
        : { serviceKey: options.serviceKey ?? serviceKey }
      const submissions = options.submissions ? await options.submissions() : []
      const currentServiceSubmissions = submissions.filter(
        (record) => record.serviceKey === config.serviceKey,
      )

      return {
        serviceKey: config.serviceKey,
        totalCount: Math.min(currentServiceSubmissions.length, MAX_ADMIN_ROWS),
        rows: currentServiceSubmissions.slice(0, limit ?? MAX_ADMIN_ROWS),
      }
    },
    async listMemberHistory(memberId, limit) {
      if (options.listMemberHistory) {
        return options.listMemberHistory(memberId, limit)
      }

      void memberId
      void limit
      return []
    },
  }
}

async function renderApp(repository: DemoAttendanceRepository, path = '/attend'): Promise<RenderedApp> {
  window.history.pushState({}, '', path)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<App repository={repository} />)
  })
  await flushEffects()

  return { container, root }
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function byText(container: HTMLElement, text: string): HTMLElement {
  const match = Array.from(container.querySelectorAll<HTMLElement>('button, h1, h2, p, div, span, strong'))
    .find((element) => element.textContent === text)

  if (!match) {
    throw new Error(`Unable to find text: ${text}`)
  }

  return match
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent === text)

  if (!match) {
    throw new Error(`Unable to find button: ${text}`)
  }

  return match
}

function inputByLabel(container: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll<HTMLLabelElement>('label'))
    .find((element) => element.textContent === labelText)
  const id = label?.getAttribute('for')

  if (!id) {
    throw new Error(`Unable to find label: ${labelText}`)
  }

  const input = container.querySelector<HTMLInputElement>(`#${id}`)
  if (!input) {
    throw new Error(`Unable to find input for label: ${labelText}`)
  }

  return input
}

async function typeSearch(container: HTMLElement, value: string) {
  const input = inputByLabel(container, '이름 검색')
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set

  if (!valueSetter) {
    throw new Error('Unable to set input value')
  }

  await act(async () => {
    valueSetter.call(input, value)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
  })
}

async function clickButton(button: HTMLButtonElement) {
  await act(async () => {
    button.click()
  })
  await flushEffects()
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  })
}

describe('App attendee flow', () => {
  let rendered: RenderedApp | null = null

  beforeEach(() => {
    setOnline(true)
  })

  afterEach(() => {
    if (rendered) {
      act(() => {
        rendered?.root.unmount()
      })
      rendered.container.remove()
      rendered = null
    }
    document.body.innerHTML = ''
    setOnline(true)
  })

  it('empty search does not render the full member list', async () => {
    rendered = await renderApp(createRepository())

    expect(byText(rendered.container, '등록된 이름을 검색한 뒤 본인을 선택해 주세요.')).toBeTruthy()
    expect(rendered.container.textContent).not.toContain('샘플회원 0003')
    expect(rendered.container.querySelectorAll('.candidate-row')).toHaveLength(0)
  })

  it('renders duplicate names distinctly and submits the selected ID with display snapshot only', async () => {
    const submissions: DemoAttendanceDraft[] = []
    rendered = await renderApp(createRepository({
      submit: async (draft) => {
        submissions.push(draft)
        return {
          ...draft,
          id: 'submitted-1',
          submittedAt: new Date('2026-08-10T01:00:00.000Z'),
          countForMemberService: 1,
        }
      },
    }))

    await typeSearch(rendered.container, '  김현우  ')

    expect(buttonByText(rendered.container, '김현우 A')).toBeTruthy()
    expect(buttonByText(rendered.container, '김현우 B')).toBeTruthy()
    expect(rendered.container.textContent).not.toContain('m-001')
    expect(rendered.container.textContent).not.toContain('m-002')

    await clickButton(buttonByText(rendered.container, '김현우 B'))
    expect(byText(rendered.container, '김현우 B')).toBeTruthy()
    expect(rendered.container.textContent).not.toContain('m-002')

    await clickButton(buttonByText(rendered.container, '출석 제출하기'))

    expect(submissions).toEqual([
      {
        memberId: 'm-002',
        displayNameSnapshot: '김현우 B',
        serviceKey,
      },
    ])
    expect(byText(rendered.container, '출석 완료')).toBeTruthy()
  })

  it('cannot submit arbitrary free text', async () => {
    const submit = vi.fn()
    rendered = await renderApp(createRepository({ submit }))

    await typeSearch(rendered.container, '등록되지 않은 이름')

    expect(byText(rendered.container, '검색 결과가 없습니다. 이름을 다시 확인해 주세요.')).toBeTruthy()
    expect(Array.from(rendered.container.querySelectorAll('button')).map((button) => button.textContent))
      .not.toContain('출석 제출하기')
    expect(submit).not.toHaveBeenCalled()
  })

  it('blocks offline submission, shows retryable errors, and reaches success', async () => {
    let attempts = 0
    rendered = await renderApp(createRepository({
      submit: async (draft) => {
        attempts += 1
        if (attempts === 1) {
          throw new Error('데모 저장소 오류')
        }

        return {
          ...draft,
          id: 'submitted-2',
          submittedAt: new Date('2026-08-10T01:00:00.000Z'),
          countForMemberService: 1,
        }
      },
    }))

    await typeSearch(rendered.container, '김현우')
    await clickButton(buttonByText(rendered.container, '김현우 A'))

    setOnline(false)
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(byText(rendered.container, '오프라인 상태입니다. 연결 후 출석을 제출할 수 있어요.')).toBeTruthy()
    expect(buttonByText(rendered.container, '출석 제출하기').disabled).toBe(true)

    setOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await clickButton(buttonByText(rendered.container, '출석 제출하기'))
    expect(byText(rendered.container, '데모 저장소 오류')).toBeTruthy()

    await clickButton(buttonByText(rendered.container, '출석 제출하기'))
    expect(byText(rendered.container, '김현우 A')).toBeTruthy()
    expect(byText(rendered.container, `${serviceKey} 예배 출석이 기록되었습니다.`)).toBeTruthy()
  })

  it('keeps root and attend routes on the attendee flow while admin and QR use separate pages', async () => {
    rendered = await renderApp(createRepository(), '/')
    expect(byText(rendered.container, '오늘 예배 출석')).toBeTruthy()

    act(() => {
      rendered?.root.unmount()
    })
    rendered.container.remove()

    rendered = await renderApp(createRepository(), '/attend')
    expect(byText(rendered.container, '오늘 예배 출석')).toBeTruthy()

    act(() => {
      rendered?.root.unmount()
    })
    rendered.container.remove()

    rendered = await renderApp(createRepository(), '/admin')
    expect(byText(rendered.container, 'Dashboard')).toBeTruthy()

    act(() => {
      rendered?.root.unmount()
    })
    rendered.container.remove()

    vi.stubEnv('VITE_ATTENDANCE_URL', 'http://localhost:5173/attend')
    rendered = await renderApp(createRepository(), '/qr')
    expect(byText(rendered.container, '출석 체크')).toBeTruthy()
    expect(rendered.container.querySelector('[data-testid="attendance-qr-code"]')).toBeTruthy()
  })
})

describe('App admin shell', () => {
  let rendered: RenderedApp | null = null

  afterEach(() => {
    if (rendered) {
      act(() => {
        rendered?.root.unmount()
      })
      rendered.container.remove()
      rendered = null
    }
    document.body.innerHTML = ''
  })

  it('defaults to Dashboard with three accessible navigation links', async () => {
    rendered = await renderApp(createRepository(), '/admin')

    expect(byText(rendered.container, 'Dashboard')).toBeTruthy()
    expect(rendered.container.querySelectorAll('nav a')).toHaveLength(3)
    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Dashboard')
    expect(rendered.container.textContent).not.toContain('현재 예배 출석 현황')
  })

  it('switches views and keeps the active destination in same-document history', async () => {
    rendered = await renderApp(createRepository(), '/admin')

    const qrLink = rendered.container.querySelector<HTMLAnchorElement>(
      'a[href="/admin?view=qr-generation"]',
    )
    expect(qrLink).toBeTruthy()

    await act(async () => {
      qrLink?.click()
    })

    expect(byText(rendered.container, 'QR Generation')).toBeTruthy()
    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent)
      .toBe('QR Generation')
    expect(window.location.pathname).toBe('/admin')
    expect(window.location.search).toBe('?view=qr-generation')

    const attendanceLink = rendered.container.querySelector<HTMLAnchorElement>(
      'a[href="/admin?view=attendance-management"]',
    )
    await act(async () => {
      attendanceLink?.click()
    })

    expect(byText(rendered.container, 'Attendance Management')).toBeTruthy()
    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent)
      .toBe('Attendance Management')
  })

  it('opens a view from the admin view query without reading the repository', async () => {
    const repository = createRepository()
    const getCurrentServiceAttendance = vi.spyOn(repository, 'getCurrentServiceAttendance')

    rendered = await renderApp(repository, '/admin?view=attendance-management')

    expect(byText(rendered.container, 'Attendance Management')).toBeTruthy()
    expect(getCurrentServiceAttendance).not.toHaveBeenCalled()
  })
})

describe('App QR monitor', () => {
  let rendered: RenderedApp | null = null

  afterEach(() => {
    if (rendered) {
      act(() => {
        rendered?.root.unmount()
      })
      rendered.container.remove()
      rendered = null
    }
    document.body.innerHTML = ''
  })

  it('shows a clear missing config error', async () => {
    vi.stubEnv('VITE_ATTENDANCE_URL', '')

    rendered = await renderApp(createRepository(), '/qr')

    expect(byText(rendered.container, '출석 QR 설정 필요')).toBeTruthy()
    expect(rendered.container.textContent).toContain('VITE_ATTENDANCE_URL')
    expect(rendered.container.textContent).toContain('http://localhost:5173/attend')
    expect(rendered.container.querySelector('[data-testid="attendance-qr-code"]')).toBeNull()
  })

  it('rejects admin QR targets', async () => {
    vi.stubEnv('VITE_ATTENDANCE_URL', 'http://localhost:5173/admin')

    rendered = await renderApp(createRepository(), '/qr')

    expect(rendered.container.textContent).toContain('관리자 경로')
    expect(rendered.container.textContent).not.toContain('http://localhost:5173/admin')
    expect(rendered.container.querySelector('[data-testid="attendance-qr-code"]')).toBeNull()
  })

  it('renders a non-empty QR SVG for a valid attend target', async () => {
    const target = 'http://localhost:5173/attend?source=monitor#front'
    vi.stubEnv('VITE_ATTENDANCE_URL', target)

    rendered = await renderApp(createRepository(), '/qr')

    const qrCode = rendered.container.querySelector<SVGSVGElement>('[data-testid="attendance-qr-code"]')
    expect(qrCode).toBeTruthy()
    expect(qrCode?.querySelector('path')).toBeTruthy()
    expect(qrCode?.outerHTML.length).toBeGreaterThan(500)
    expect(rendered.container.textContent).toContain(target)
    expect(rendered.container.textContent).not.toContain('/admin')
  })
})

describe('App demo attendee routing', () => {
  let rendered: RenderedApp | null = null

  beforeEach(() => {
    resetDemoSessionStore()
  })

  afterEach(() => {
    if (rendered) {
      act(() => rendered?.root.unmount())
      rendered.container.remove()
      rendered = null
    }
    document.body.innerHTML = ''
  })

  it('uses demo-local submission for an explicit active session without the repository', async () => {
    const session = createDemoSession({ part: 2, date: serviceKey, startsAt: '11:00' })
    const repository = createRepository()
    const submit = vi.spyOn(repository, 'submitAttendance')
    const listMembers = vi.spyOn(repository, 'listRegisteredMembers')
    const getConfig = vi.spyOn(repository, 'getCurrentServiceConfig')

    rendered = await renderApp(repository, session.url)
    await typeSearch(rendered.container, '김현우')
    await clickButton(buttonByText(rendered.container, '김현우 A'))
    await clickButton(buttonByText(rendered.container, '출석 제출하기'))

    expect(byText(rendered.container, '데모 출석 완료')).toBeTruthy()
    expect(listDemoSubmissions(session.id)).toHaveLength(1)
    expect(submit).not.toHaveBeenCalled()
    expect(listMembers).not.toHaveBeenCalled()
    expect(getConfig).not.toHaveBeenCalled()
  })

  it('renders deterministic invalid and closed states without repository access', async () => {
    const repository = createRepository()
    const submit = vi.spyOn(repository, 'submitAttendance')
    const listMembers = vi.spyOn(repository, 'listRegisteredMembers')
    const getConfig = vi.spyOn(repository, 'getCurrentServiceConfig')

    rendered = await renderApp(repository, '/attend?demoSessionId=missing-demo-session')
    expect(byText(rendered.container, '유효하지 않은 데모 세션입니다')).toBeTruthy()
    expect(submit).not.toHaveBeenCalled()
    expect(listMembers).not.toHaveBeenCalled()
    expect(getConfig).not.toHaveBeenCalled()

    act(() => {
      rendered?.root.unmount()
    })
    rendered.container.remove()
    rendered = null

    const session = createDemoSession({ part: 1, date: serviceKey, startsAt: '09:00' })
    deactivateDemoSession(session.id)
    rendered = await renderApp(repository, session.url)
    expect(byText(rendered.container, '종료된 데모 세션입니다')).toBeTruthy()
    expect(rendered.container.querySelector('[data-testid="demo-session-closed"]')).toBeTruthy()
    expect(submit).not.toHaveBeenCalled()
    expect(listMembers).not.toHaveBeenCalled()
    expect(getConfig).not.toHaveBeenCalled()
  })

  it('keeps queryless attend repository-backed and does not resolve a demo session', async () => {
    const repository = createRepository()
    const getConfig = vi.spyOn(repository, 'getCurrentServiceConfig')
    const session = createDemoSession({ part: 3, date: serviceKey, startsAt: '14:00' })

    rendered = await renderApp(repository, '/attend')

    expect(byText(rendered.container, '오늘 예배 출석')).toBeTruthy()
    expect(getConfig).toHaveBeenCalled()
    expect(listDemoSubmissions(session.id)).toHaveLength(0)
  })
})
