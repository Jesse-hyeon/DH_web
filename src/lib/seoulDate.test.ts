import { describe, expect, it } from 'vitest'

import {
  SEOUL_TIME_ZONE,
  getSeoulDateParts,
  toSeoulISODate,
  toSeoulServiceKey,
} from './seoulDate'

describe('Seoul date utilities', () => {
  it('uses the Asia/Seoul timezone', () => {
    expect(SEOUL_TIME_ZONE).toBe('Asia/Seoul')
  })

  it('rolls over to the next Seoul date at 15:00 UTC', () => {
    const beforeMidnight = new Date('2026-08-09T14:59:59.999Z')
    const atMidnight = new Date('2026-08-09T15:00:00.000Z')

    expect(toSeoulISODate(beforeMidnight)).toBe('2026-08-09')
    expect(getSeoulDateParts(atMidnight)).toEqual({ year: 2026, month: 8, day: 10 })
    expect(toSeoulISODate(atMidnight)).toBe('2026-08-10')
  })

  it('formats a service key as the Seoul YYYY-MM-DD calendar date', () => {
    const date = new Date('2026-01-01T15:00:00.000Z')

    expect(toSeoulServiceKey(date)).toBe('2026-01-02')
  })
})
