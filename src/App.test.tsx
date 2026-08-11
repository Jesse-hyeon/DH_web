import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { generateMembers, type PublicMember } from './data/members'
import type {
  DemoAttendanceDraft,
  DemoAttendanceRecord,
  DemoAttendanceRepository,
} from './lib/demoAttendanceStore'
import { searchRegisteredMembers as searchDemoRegisteredMembers } from './lib/demoAttendanceStore'
import {
  MAX_ADMIN_ROWS,
  type CurrentServiceAttendance,
  type ServiceAttendanceSummary,
} from './lib/attendanceRepository'

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
    async searchRegisteredMembers(query, limit) {
      return searchDemoRegisteredMembers(query, registeredMembers, limit)
    },
    async getCurrentServiceConfig() {
      if (options.getCurrentServiceConfig) {
        return options.getCurrentServiceConfig()
      }

      return { serviceKey: options.serviceKey ?? serviceKey }
    },
    async getServiceConfig(selectedServiceKey) {
      return { serviceKey: selectedServiceKey }
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
    async getServiceAttendance(selectedServiceKey, limit?: number): Promise<CurrentServiceAttendance> {
      const submissions = options.submissions ? await options.submissions() : []
      const selectedSubmissions = submissions.filter(
        (record) => record.serviceKey === selectedServiceKey,
      )

      return {
        serviceKey: selectedServiceKey,
        totalCount: Math.min(selectedSubmissions.length, MAX_ADMIN_ROWS),
        rows: selectedSubmissions.slice(0, limit ?? MAX_ADMIN_ROWS),
      }
    },
    async getServiceAttendanceSummary(selectedServiceKey): Promise<ServiceAttendanceSummary> {
      const submissions = options.submissions ? await options.submissions() : []
      const selectedSubmissions = submissions.filter(
        (record) => record.serviceKey === selectedServiceKey,
      )

      return {
        serviceKey: selectedServiceKey,
        totalCount: Math.min(selectedSubmissions.length, MAX_ADMIN_ROWS),
        partCounts: {
          1: selectedSubmissions.filter((record) => record.servicePart === 1).length,
          2: selectedSubmissions.filter((record) => record.servicePart === 2).length,
          3: selectedSubmissions.filter((record) => record.servicePart === 3).length,
        },
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

async function renderApp(
  repository: DemoAttendanceRepository,
  path = `/attend?serviceDate=${serviceKey}&servicePart=1`,
): Promise<RenderedApp> {
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
    await vi.dynamicImportSettled()
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
    .find((button) => button.textContent === text || button.querySelector(':scope > span')?.textContent === text)

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

async function changeSearchInput(container: HTMLElement, value: string) {
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

async function typeSearch(container: HTMLElement, value: string) {
  await changeSearchInput(container, value)
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 320))
  })
  await flushEffects()
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
    const repository = createRepository()
    const searchMembers = vi.spyOn(repository, 'searchRegisteredMembers')
    rendered = await renderApp(repository)

    expect(byText(rendered.container, '이름을 두 글자 이상 입력해 주세요.')).toBeTruthy()
    expect(inputByLabel(rendered.container, '이름 검색').placeholder).toBe('이름을 검색해 주세요.')
    expect(rendered.container.textContent).not.toContain('김도윤')
    expect(rendered.container.querySelectorAll('.candidate-row')).toHaveLength(0)
    expect(searchMembers).not.toHaveBeenCalled()
  })

  it('renders duplicate names distinctly and submits the selected ID with display snapshot only', async () => {
    const submissions: DemoAttendanceDraft[] = []
    const duplicateMembers: PublicMember[] = [
      { memberId: 'm-001', displayLabel: '김현우', searchName: '김현우', sortKey: '김현우 1', cohort: '1교구' },
      { memberId: 'm-002', displayLabel: '김현우', searchName: '김현우', sortKey: '김현우 2', cohort: '2교구' },
    ]
    rendered = await renderApp(createRepository({
      members: duplicateMembers,
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

    expect(rendered.container.querySelectorAll('.candidate-row')).toHaveLength(2)
    expect(rendered.container.textContent).toContain('1교구')
    expect(rendered.container.textContent).toContain('2교구')
    expect(rendered.container.textContent).not.toContain('m-001')
    expect(rendered.container.textContent).not.toContain('m-002')

    const secondCandidate = rendered.container.querySelectorAll<HTMLButtonElement>('.candidate-row')[1]
    if (!secondCandidate) throw new Error('Unable to find second duplicate member')
    await clickButton(secondCandidate)
    expect(byText(rendered.container, '김현우')).toBeTruthy()
    expect(rendered.container.textContent).not.toContain('m-002')

    await clickButton(buttonByText(rendered.container, '출석 제출하기'))

    expect(submissions).toEqual([
      {
        memberId: 'm-002',
        displayNameSnapshot: '김현우',
        serviceKey,
        servicePart: 1,
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

  it('clears stale candidates immediately when the search text changes', async () => {
    rendered = await renderApp(createRepository())
    await typeSearch(rendered.container, '김현우')

    expect(rendered.container.querySelectorAll('.candidate-row')).toHaveLength(1)

    await changeSearchInput(rendered.container, '김지훈')

    expect(rendered.container.querySelectorAll('.candidate-row')).toHaveLength(0)
    expect(rendered.container.textContent).toContain('검색 중...')
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
    await clickButton(buttonByText(rendered.container, '김현우'))

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
    expect(byText(rendered.container, '김현우')).toBeTruthy()
    expect(byText(rendered.container, `${serviceKey} · 1부 예배 출석이 기록되었습니다.`)).toBeTruthy()
  })

  it('shows the service part from the QR and uses a simple confirmation button', async () => {
    rendered = await renderApp(createRepository(), `/attend?serviceDate=${serviceKey}&servicePart=2`)

    expect(byText(rendered.container, `${serviceKey} · 2부`)).toBeTruthy()
    await typeSearch(rendered.container, '김현우')
    await clickButton(buttonByText(rendered.container, '김현우'))
    await clickButton(buttonByText(rendered.container, '출석 제출하기'))

    expect(byText(rendered.container, `${serviceKey} · 2부 예배 출석이 기록되었습니다.`)).toBeTruthy()
    expect(buttonByText(rendered.container, '확인')).toBeTruthy()
    expect(rendered.container.textContent).not.toContain('다른 이름 검색하기')
  })

  it('confirms the first persisted service part when a later QR is scanned again', async () => {
    rendered = await renderApp(createRepository({
      submit: async (draft) => ({
        ...draft,
        id: 'existing-attendance',
        servicePart: 1,
        submittedAt: new Date('2026-08-10T00:30:00.000Z'),
        countForMemberService: 1,
      }),
    }), `/attend?serviceDate=${serviceKey}&servicePart=3`)

    await typeSearch(rendered.container, '김현우')
    await clickButton(buttonByText(rendered.container, '김현우'))
    await clickButton(buttonByText(rendered.container, '출석 제출하기'))

    expect(byText(rendered.container, `${serviceKey} · 1부 예배 출석이 기록되었습니다.`)).toBeTruthy()
    expect(rendered.container.textContent).not.toContain(`${serviceKey} · 3부 예배 출석이 기록되었습니다.`)
  })

  it('requires a complete QR session while admin uses a separate page', async () => {
    rendered = await renderApp(createRepository(), '/')
    expect(byText(rendered.container, '사용할 수 없는 경로입니다')).toBeTruthy()

    act(() => {
      rendered?.root.unmount()
    })
    rendered.container.remove()

    rendered = await renderApp(createRepository(), '/attend')
    expect(byText(rendered.container, '유효한 출석 QR이 필요합니다')).toBeTruthy()

    act(() => {
      rendered?.root.unmount()
    })
    rendered.container.remove()

    rendered = await renderApp(createRepository(), '/attend?serviceDate=invalid&servicePart=4')
    expect(byText(rendered.container, '유효한 출석 QR이 필요합니다')).toBeTruthy()

    act(() => {
      rendered?.root.unmount()
    })
    rendered.container.remove()

    rendered = await renderApp(createRepository(), '/admin')
    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent).toBe('대시보드')

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

  it('defaults to 대시보드 with three accessible navigation links', async () => {
    rendered = await renderApp(createRepository(), '/admin')

    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent).toBe('대시보드')
    expect(rendered.container.querySelectorAll('nav a')).toHaveLength(3)
    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent).toBe('대시보드')
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

    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent).toBe('QR 관리')
    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent)
      .toBe('QR 관리')
    expect(window.location.pathname).toBe('/admin')
    expect(window.location.search).toBe('?view=qr-generation&serviceDate=2026-08-16')

    const attendanceLink = rendered.container.querySelector<HTMLAnchorElement>(
      'a[href="/admin?view=attendance-management"]',
    )
    await act(async () => {
      attendanceLink?.click()
    })

    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent).toBe('출석 관리')
    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent)
      .toBe('출석 관리')
  })

  it('opens the attendance view and loads the bounded recent service rows', async () => {
    const repository = createRepository({ serviceKey: '2026-08-16' })
    const getServiceAttendance = vi.spyOn(repository, 'getServiceAttendance')

    rendered = await renderApp(repository, '/admin?view=attendance-management')

    expect(rendered.container.querySelector('nav a[aria-current="page"]')?.textContent).toBe('출석 관리')
    expect(getServiceAttendance).toHaveBeenCalledTimes(4)
    expect(getServiceAttendance).toHaveBeenCalledWith('2026-08-16', 2_000)
  })
})
