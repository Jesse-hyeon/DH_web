export function parseServiceDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export function formatServiceDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function recentSundayServiceDates(
  referenceDate: string,
  count: number,
): ReadonlyArray<string> {
  const latestSunday = parseServiceDate(referenceDate)
  latestSunday.setUTCDate(latestSunday.getUTCDate() - latestSunday.getUTCDay())

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(latestSunday)
    date.setUTCDate(date.getUTCDate() - (count - index - 1) * 7)
    return formatServiceDate(date)
  })
}
