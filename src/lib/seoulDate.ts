import type { ISODate, ServiceKey } from '../domain/types'

export const SEOUL_TIME_ZONE = 'Asia/Seoul' as const

export interface SeoulDateParts {
  year: number
  month: number
  day: number
}

const seoulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SEOUL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Cannot derive a Seoul date from an invalid Date.')
  }
}

export function getSeoulDateParts(date: Date = new Date()): SeoulDateParts {
  assertValidDate(date)

  const parts = seoulDateFormatter.formatToParts(date)
  const values = new Map(
    parts
      .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map((part) => [part.type, Number(part.value)]),
  )

  const year = values.get('year')
  const month = values.get('month')
  const day = values.get('day')

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Unable to resolve the Seoul calendar date.')
  }

  return { year, month, day }
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function toSeoulISODate(date: Date = new Date()): ISODate {
  const { year, month, day } = getSeoulDateParts(date)
  return `${String(year).padStart(4, '0')}-${padDatePart(month)}-${padDatePart(day)}`
}

export function toSeoulServiceKey(date: Date = new Date()): ServiceKey {
  return toSeoulISODate(date)
}
