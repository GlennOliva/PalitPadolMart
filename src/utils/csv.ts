export type CsvValue = string | number | null | undefined

const FORMULA_LEAD = /^[=+\-@\t\r]/

export function sanitizeCsvCell(value: CsvValue): string {
  const raw = value == null ? '' : String(value)
  return FORMULA_LEAD.test(raw) ? `'${raw}` : raw
}

function escapeCsvCell(value: CsvValue): string {
  const safe = sanitizeCsvCell(value)
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function buildCsv(header: CsvValue[], rows: CsvValue[][]): string {
  const lines: string[] = []
  lines.push(header.map((cell) => escapeCsvCell(cell)).join(','))
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}