import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SellerReviewSummary, type SellerReviewSummaryProps } from '../../src/components/seller/SellerAnalyticsViews'

const { chartMocks } = vi.hoisted(() => ({
  chartMocks: {
    hbar: vi.fn(),
  },
}))

vi.mock('../../src/components/analytics/AdminHBarChart', () => ({
  AdminHBarChart: (props: Record<string, unknown>) => {
    chartMocks.hbar(props)
    const rows = (props.rows ?? []) as { label: string; value: number }[]
    return (
      <div role="img" aria-label="mock hbar">
        {rows.map((row) => (
          <span key={`${row.label}-${row.value}`}>
            {row.label}={row.value}
          </span>
        ))}
      </div>
    )
  },
}))
vi.mock('../../src/components/analytics/chart-theme', () => ({
  AdminChartLegend: () => null,
  chartColorFor: () => '#111111',
}))

function renderSummary(props: Partial<SellerReviewSummaryProps>) {
  return render(
    <MemoryRouter>
      <SellerReviewSummary
        count={props.count ?? 0}
        average={props.average ?? null}
        distribution={props.distribution ?? {}}
        status={props.status ?? 'data'}
        onRetry={props.onRetry}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  chartMocks.hbar.mockClear()
})

describe('SellerReviewSummary — trusted customer review summary', () => {
  it('shows the total qualifying review count, never the empty state', () => {
    renderSummary({ count: 3, average: 4.7, distribution: { 5: 2, 4: 1 }, status: 'data' })
    expect(screen.getByText('3 verified reviews · all time')).toBeInTheDocument()
    expect(screen.getByText('4.7')).toBeInTheDocument()
    expect(screen.queryByText('No reviews yet.')).not.toBeInTheDocument()
  })

  it('formats the average rating 5,4,5 → 4.67 → 4.7', () => {
    renderSummary({ count: 3, average: 4.6666666667, distribution: { 5: 2, 4: 1 }, status: 'data' })
    expect(screen.getByText('4.7')).toBeInTheDocument()
  })

  it('renders a 5..1 star distribution that sums to the qualifying count', () => {
    renderSummary({ count: 3, average: 4.7, distribution: { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 }, status: 'data' })
    expect(screen.getByText('Rating distribution')).toBeInTheDocument()
    expect(screen.getByText('5★=2')).toBeInTheDocument()
    expect(screen.getByText('4★=1')).toBeInTheDocument()
    expect(screen.getByText('3★=0')).toBeInTheDocument()
    expect(screen.getByText('2★=0')).toBeInTheDocument()
    expect(screen.getByText('1★=0')).toBeInTheDocument()
    expect(chartMocks.hbar).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          { label: '5★', value: 2 },
          { label: '4★', value: 1 },
          { label: '3★', value: 0 },
          { label: '2★', value: 0 },
          { label: '1★', value: 0 },
        ],
        ariaLabel: 'Rating distribution: 3 reviews',
      }),
    )
  })

  it('shows the empty state only when the trusted count is zero', () => {
    renderSummary({ count: 0, average: null, distribution: {}, status: 'empty' })
    expect(screen.getByText('No reviews yet.')).toBeInTheDocument()
    expect(screen.queryByText('Rating distribution')).not.toBeInTheDocument()
  })

  it('renders a loading skeleton without flashing empty copy', () => {
    renderSummary({ count: 0, average: null, distribution: {}, status: 'loading' })
    expect(screen.getByText('Loading review summary…')).toBeInTheDocument()
    expect(screen.queryByText('No reviews yet.')).not.toBeInTheDocument()
  })

  it('renders a friendly error state with a retry action', () => {
    const onRetry = vi.fn()
    renderSummary({ count: 0, average: null, distribution: {}, status: 'error', onRetry })
    expect(screen.getByText('Unable to load review information.')).toBeInTheDocument()
    screen.getByRole('button', { name: /Retry/i }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('qualifies only approved reviews via the trusted count', () => {
    renderSummary({ count: 3, average: 4.7, distribution: { 5: 2, 4: 1 }, status: 'data' })
    expect(screen.getByText('3 verified reviews · all time')).toBeInTheDocument()
    expect(screen.queryByText('4 verified reviews · all time')).not.toBeInTheDocument()
  })

  it('keeps sellers isolated: 3 for seller A, 1 for seller B', () => {
    const sellerA = renderSummary({ count: 3, average: 4.7, distribution: { 5: 2, 4: 1 }, status: 'data' })
    expect(within(sellerA.container).getByText('3 verified reviews · all time')).toBeInTheDocument()
    const sellerB = renderSummary({ count: 1, average: 5, distribution: { 5: 1 }, status: 'data' })
    expect(within(sellerB.container).getByText('1 verified review · all time')).toBeInTheDocument()
    expect(within(sellerB.container).queryByText('3 verified reviews · all time')).not.toBeInTheDocument()
  })

  it('shows the total review count, not the current page length', () => {
    renderSummary({ count: 20, average: 4.6, distribution: { 5: 15, 4: 5 }, status: 'data' })
    expect(screen.getByText('20 verified reviews · all time')).toBeInTheDocument()
    expect(screen.queryByText('10 verified reviews · all time')).not.toBeInTheDocument()
  })
})