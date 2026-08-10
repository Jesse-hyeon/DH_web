import { describe, expect, it, vi } from 'vitest'

import { demoAttendanceRepository } from './demoAttendanceStore'
import {
  createRuntimeAttendanceRepository,
  getAttendanceMode,
  getFirebaseWebConfig,
  type RuntimeEnvironment,
} from './runtimeRepository'

const firebaseEnvironment: RuntimeEnvironment = {
  VITE_ATTENDANCE_MODE: 'firebase',
  VITE_FIREBASE_API_KEY: 'public-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-project.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-project-id',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-project.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'demo-sender-id',
  VITE_FIREBASE_APP_ID: 'demo-app-id',
}

describe('runtime attendance repository selection', () => {
  it('defaults to real Firebase mode instead of silently selecting the demo store', () => {
    expect(getAttendanceMode({})).toBe('firebase')
  })

  it('requires all six Firebase web settings in Firebase mode', () => {
    expect(() => getFirebaseWebConfig({ VITE_ATTENDANCE_MODE: 'firebase' })).toThrow(
      /VITE_FIREBASE_API_KEY.*VITE_FIREBASE_APP_ID/,
    )
  })

  it('selects the explicit demo mode without touching Firebase configuration', () => {
    const firebaseFactory = vi.fn()
    const demoRepository = { ...demoAttendanceRepository }

    expect(createRuntimeAttendanceRepository(
      { VITE_ATTENDANCE_MODE: 'demo' },
      { demoRepository, firebaseFactory },
    )).toBe(demoRepository)
    expect(firebaseFactory).not.toHaveBeenCalled()
  })

  it('passes the public web config to the Firebase repository factory', () => {
    const firebaseFactory = vi.fn(() => demoAttendanceRepository)

    expect(createRuntimeAttendanceRepository(firebaseEnvironment, { firebaseFactory }))
      .toBe(demoAttendanceRepository)
    expect(firebaseFactory).toHaveBeenCalledWith({
      apiKey: 'public-api-key',
      authDomain: 'demo-project.firebaseapp.com',
      projectId: 'demo-project-id',
      storageBucket: 'demo-project.firebasestorage.app',
      messagingSenderId: 'demo-sender-id',
      appId: 'demo-app-id',
    })
  })
})
