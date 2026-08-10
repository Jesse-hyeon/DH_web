import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'

import QRGeneration from './QRGeneration'
import { resetDemoSessionStore } from './demoSessionStore'

interface RenderedView {
  container: HTMLDivElement
  root: Root
}

async function renderView(): Promise<RenderedView> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<QRGeneration />)
  })

  return { container, root }
}

describe('QRGeneration', () => {
  let rendered: RenderedView | null = null

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

  it('generates a tagged active session with an exact preview link and QR', async () => {
    rendered = await renderView()
    const generateButton = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'QR 생성하기')

    await act(async () => generateButton?.click())

    expect(rendered.container.querySelector('[data-testid="demo-session-qr-code"]')).toBeTruthy()
    expect(rendered.container.querySelector('.admin-status-pill')?.textContent).toBe('활성')
    expect(rendered.container.textContent).toContain('demo-service-2-2026-08-10-1100-01')
    expect(rendered.container.querySelector<HTMLAnchorElement>('.qr-target-url')?.getAttribute('href'))
      .toBe('/attend?demoSessionId=admin-demo-session-0001')
    expect(rendered.container.querySelector<HTMLAnchorElement>('.qr-target-url')?.textContent)
      .toBe('/attend?demoSessionId=admin-demo-session-0001')
  })

  it('keeps generated sessions unique and deactivates without removing the row', async () => {
    rendered = await renderView()
    const generateButton = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'QR 생성하기')

    await act(async () => generateButton?.click())
    await act(async () => generateButton?.click())

    expect(rendered.container.querySelectorAll('.qr-session-row')).toHaveLength(2)
    expect(new Set(Array.from(rendered.container.querySelectorAll('.qr-session-row'))
      .map((row) => row.getAttribute('data-session-id'))).size).toBe(2)
    expect(new Set(Array.from(rendered.container.querySelectorAll('.qr-session-details strong'))
      .map((tag) => tag.textContent)).size).toBe(2)

    const deactivateButton = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '비활성화')
    await act(async () => deactivateButton?.click())

    expect(rendered.container.querySelectorAll('.qr-session-row')).toHaveLength(2)
    expect(rendered.container.querySelectorAll('.admin-status-pill.is-inactive')).toHaveLength(1)
    expect(Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => button.textContent === '비활성화')).toHaveLength(1)
  })

  it('reports invalid form values without creating a session', async () => {
    rendered = await renderView()
    const date = rendered.container.querySelector<HTMLInputElement>('#demo-service-date')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (!date || !setter) {
      throw new Error('Unable to locate date input')
    }

    await act(async () => {
      setter.call(date, '2026-02-30')
      date.dispatchEvent(new Event('input', { bubbles: true }))
      date.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const generateButton = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'QR 생성하기')
    await act(async () => generateButton?.click())

    expect(rendered.container.querySelectorAll('.qr-session-row')).toHaveLength(0)
  })
})
