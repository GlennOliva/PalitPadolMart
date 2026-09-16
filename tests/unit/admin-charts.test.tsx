import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminLineChart } from '../../src/components/analytics/AdminLineChart'
import { AdminHBarChart } from '../../src/components/analytics/AdminHBarChart'
import { AdminBarChart, type AdminBarSeries } from '../../src/components/analytics/AdminBarChart'
import { AdminChartLegend } from '../../src/components/analytics/chart-theme'

describe('Admin chart components', () => {
  it('renders a line chart with an accessible label', () => {
    render(
      <AdminLineChart
        rows={[
          { bucket_start: '2026-01-01', gross_sales: 100, net_sales: 90 },
          { bucket_start: '2026-01-08', gross_sales: 200, net_sales: 180 },
        ]}
        xKey="bucket_start"
        xFormat={(value) => value}
        series={[
          { key: 'gross_sales', label: 'Gross sales', accessor: (row) => Number(row.gross_sales) },
          { key: 'net_sales', label: 'Net sales', accessor: (row) => Number(row.net_sales) },
        ]}
        formatValue={(value) => `₱${value}`}
        ariaLabel="Sales trend"
      />,
    )
    expect(screen.getByLabelText('Sales trend')).toBeInTheDocument()
  })

  it('returns null when all series values are zero', () => {
    const { container } = render(
      <AdminLineChart
        rows={[{ bucket_start: '2026-01-01', gross_sales: 0 }]}
        xKey="bucket_start"
        xFormat={(value) => value}
        series={[{ key: 'gross_sales', label: 'Gross sales', accessor: (row) => Number(row.gross_sales) }]}
        formatValue={(value) => `₱${value}`}
        ariaLabel="Empty trend"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a horizontal bar chart for ranking data', () => {
    render(
      <AdminHBarChart
        rows={[
          { label: 'Ace Paddles PH', value: 1600 },
          { label: 'Spin Shop', value: 900 },
        ]}
        formatValue={(value) => `₱${value}`}
        ariaLabel="Top sellers rank"
      />,
    )
    expect(screen.getByLabelText('Top sellers rank')).toBeInTheDocument()
  })

  it('renders grouped vertical bars from wide rows', () => {
    const series: AdminBarSeries[] = [
      { key: 'new_orders', label: 'New orders', accessor: (row) => Number(row.new_orders) },
      { key: 'completed', label: 'Completed', accessor: (row) => Number(row.completed_orders) },
    ]
    render(
      <AdminBarChart
        rows={[
          { x: '2026-01', new_orders: 5, completed_orders: 3 },
          { x: '2026-02', new_orders: 8, completed_orders: 6 },
        ]}
        xKey="x"
        xFormat={(value) => value}
        series={series}
        formatValue={(value) => `${value}`}
        ariaLabel="Order volume by month"
      />,
    )
    expect(screen.getByLabelText('Order volume by month')).toBeInTheDocument()
  })

  it('renders an HTML legend that survives printing', () => {
    render(
      <AdminChartLegend
        items={[
          { label: 'Gross sales', color: '#111111' },
          { label: 'Net sales', color: '#4f46e5' },
        ]}
      />,
    )
    expect(screen.getByText('Gross sales')).toBeInTheDocument()
    expect(screen.getByText('Net sales')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})