export const PRINT_MAX_ROWS = 200
export const PRINT_MAX_PAGES = 20
export const PRINT_DEFAULT_PAGE_SIZE = 25

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
}

const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

export function formatReportPeriod(start: string, end: string): string {
  return `${formatReportDate(start)} – ${formatReportDate(end)}`
}

export function formatReportDate(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-PH', DATE_FORMAT).format(date)
}

export function formatReportTimestamp(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-PH', DATETIME_FORMAT).format(date)
}

export function reportMarginLabel(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${start} to ${end}`
  }
  const startMonth = startDate.getMonth()
  const startYear = startDate.getFullYear()
  const endMonth = endDate.getMonth()
  const endYear = endDate.getFullYear()

  if (startYear === endYear && startMonth === endMonth) {
    return startDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  }
  if (startYear === endYear) {
    return `${startDate.toLocaleDateString('en-PH', { month: 'short' })} – ${endDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`
  }
  return `${formatReportDate(start)} – ${formatReportDate(end)}`
}