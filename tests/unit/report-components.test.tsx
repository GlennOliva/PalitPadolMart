import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReportHeader } from '../../src/components/reports/ReportHeader'
import { PrintReportButton } from '../../src/components/reports/PrintReportButton'
import { PrintReportTable } from '../../src/components/reports/PrintReportTable'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReportHeader', () => {
  it('renders title, period, generated fields, and applied filters', () => {
    render(
      <ReportHeader
        title="Executive Marketplace Report"
        subtitle="PalitPaddleBai Mart"
        dateRange="September 1, 2026 – September 30, 2026"
        generatedAt="September 30, 2026, 10:45 AM"
        generatedBy="Marketplace administrator"
        filters={['Buckets: monthly', 'Compared with previous period']}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Executive Marketplace Report' })).toBeInTheDocument()
    expect(screen.getByText('PALITPADDLEBAI MART')).toBeInTheDocument()
    expect(screen.getByText('September 1, 2026 – September 30, 2026')).toBeInTheDocument()
    expect(screen.getByText('September 30, 2026, 10:45 AM')).toBeInTheDocument()
    expect(screen.getByText('Marketplace administrator')).toBeInTheDocument()
    expect(screen.getByText(/Applied filters:/)).toHaveTextContent('Buckets: monthly')
  })
})

describe('PrintReportButton', () => {
  it('calls window.print when pressed', () => {
    const printSpy = vi.fn()
    Object.defineProperty(window, 'print', { value: printSpy, configurable: true, writable: true })
    render(<PrintReportButton label="Print Report" />)
    screen.getByRole('button', { name: 'Print Report' }).click()
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('runs the async prepare step before printing', async () => {
    const printSpy = vi.fn()
    Object.defineProperty(window, 'print', { value: printSpy, configurable: true, writable: true })
    const onPrepare = vi.fn().mockResolvedValue(undefined)
    render(<PrintReportButton onPrepare={onPrepare} label="Print" />)
    screen.getByRole('button', { name: 'Print' }).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onPrepare).toHaveBeenCalledTimes(1)
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('defers printing until the async prepare step completes', async () => {
    const printSpy = vi.fn()
    Object.defineProperty(window, 'print', { value: printSpy, configurable: true, writable: true })
    let release: () => void = () => undefined
    const onPrepare = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { release = () => resolve(undefined) }),
    )
    render(<PrintReportButton onPrepare={onPrepare} />)
    const button = screen.getByRole('button', { name: 'Print Report' })
    button.click()
    expect(onPrepare).toHaveBeenCalledTimes(1)
    expect(printSpy).not.toHaveBeenCalled()
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(printSpy).toHaveBeenCalledTimes(1)
  })
})

describe('PrintReportTable', () => {
  it('renders a caption, columns, and numeric alignment', () => {
    render(
      <PrintReportTable
        caption="Top sellers"
        columns={[
          { key: 'store_name', label: 'Store' },
          { key: 'gross_sales', label: 'Gross sales', numeric: true },
        ]}
        rows={[
          { store_name: 'Ace Paddles PH', gross_sales: '₱1,600.00' },
          { store_name: 'Spin Shop', gross_sales: '₱900.00' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Top sellers' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Gross sales' })).toHaveClass('r')
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('2 rows')).toBeInTheDocument()
  })

  it('returns null when there are no rows', () => {
    const { container } = render(
      <PrintReportTable caption="Empty table" columns={[{ key: 'x', label: 'X' }]} rows={[]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})