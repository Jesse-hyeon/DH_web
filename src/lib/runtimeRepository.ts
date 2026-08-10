import { demoAttendanceRepository } from './demoAttendanceStore'
import type { AttendanceRepository } from './attendanceRepository'
import {
  createFirebaseAttendanceRepository,
  type FirebaseWebConfig,
} from './firebaseAttendanceRepository'

export type AttendanceMode = 'firebase' | 'demo'

export interface RuntimeEnvironment {
  VITE_ATTENDANCE_MODE?: string
  VITE_FIREBASE_API_KEY?: string
  VITE_FIREBASE_AUTH_DOMAIN?: string
  VITE_FIREBASE_PROJECT_ID?: string
  VITE_FIREBASE_STORAGE_BUCKET?: string
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  VITE_FIREBASE_APP_ID?: string
  VITE_FIRESTORE_EMULATOR_HOST?: string
}

export const FIREBASE_CONFIG_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

export class FirebaseConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirebaseConfigurationError'
  }
}

export function getAttendanceMode(environment: RuntimeEnvironment): AttendanceMode {
  const configuredMode = environment.VITE_ATTENDANCE_MODE?.trim().toLowerCase()

  if (configuredMode === 'demo') {
    return 'demo'
  }

  if (configuredMode === undefined || configuredMode === '' || configuredMode === 'firebase') {
    return 'firebase'
  }

  throw new Error('VITE_ATTENDANCE_MODE must be either "firebase" or the explicit local-only value "demo".')
}

export function getFirebaseWebConfig(environment: RuntimeEnvironment): FirebaseWebConfig {
  const missingKeys = FIREBASE_CONFIG_ENV_KEYS.filter((key) => {
    const value = environment[key]
    return typeof value !== 'string' || value.trim().length === 0
  })

  if (missingKeys.length > 0) {
    throw new FirebaseConfigurationError(
      `Firebase mode is selected, but required public web configuration is missing: ${missingKeys.join(', ')}. `
        + 'Set VITE_ATTENDANCE_MODE=demo for local-only tests, or configure all six VITE_FIREBASE_* values.',
    )
  }

  return {
    apiKey: environment.VITE_FIREBASE_API_KEY as string,
    authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: environment.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket: environment.VITE_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: environment.VITE_FIREBASE_APP_ID as string,
    ...(environment.VITE_FIRESTORE_EMULATOR_HOST?.trim()
      ? { emulatorHost: environment.VITE_FIRESTORE_EMULATOR_HOST.trim() }
      : {}),
  }
}

export interface RuntimeRepositoryDependencies {
  demoRepository?: AttendanceRepository
  firebaseFactory?: (config: FirebaseWebConfig) => AttendanceRepository
}

export function createRuntimeAttendanceRepository(
  environment: RuntimeEnvironment = import.meta.env,
  dependencies: RuntimeRepositoryDependencies = {},
): AttendanceRepository {
  const mode = getAttendanceMode(environment)

  if (mode === 'demo') {
    return dependencies.demoRepository ?? demoAttendanceRepository
  }

  const config = getFirebaseWebConfig(environment)
  return (dependencies.firebaseFactory ?? createFirebaseAttendanceRepository)(config)
}
