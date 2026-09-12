import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ListingReportDialog from '../../src/components/marketplace/ListingReportDialog'
import OrderDisputePanel from '../../src/components/disputes/OrderDisputePanel'
import DisputeList from '../../src/components/disputes/DisputeList'
import DisputeEvidencePanel from '../../src/components/disputes/DisputeEvidencePanel'
import DisputeRefundPanel from '../../src/components/disputes/DisputeRefundPanel'
import DisputeDetail from '../../src/components/disputes/DisputeDetail'
import type {
  DisputeDetail as DisputeDetailType,
  DisputeSummary,
} from '../../src/features/disputes/disputes.types'
import type { OrderDetail } from '../../src/features/orders/orders.types'

const phase11UiMocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 'buyer-1', email: 'buyer@example.com' } as { id: string; email: string } | null,
  },
  submitListingReport: vi.fn(),
  getOrderDispute: vi.fn(),
  getDisputeDetail: vi.fn(),
  sendDisputeMessage: vi.fn(),
  escalateDispute: vi.fn(),
  closeMyDispute: vi.fn(),
  uploadDisputeEvidence: vi.fn(),
  disputeEvidenceUrl: vi.fn(),
  requestRefund: vi.fn(),
  approveRefund: vi.fn(),
  rejectRefund: vi.fn(),
  completeRefund: vi.fn(),
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => phase11UiMocks.auth,
}))

vi.mock('../../src/features/reports/reports.service', () => ({
  submitListingReport: phase11UiMocks.submitListingReport,
}))

vi.mock('../../src/features/disputes/disputes.service', () => ({
  getOrderDispute: phase11UiMocks.getOrderDispute,
  getDisputeDetail: phase11UiMocks.getDisputeDetail,
  sendDisputeMessage: phase11UiMocks.sendDisputeMessage,
  escalateDispute: phase11UiMocks.escalateDispute,
  closeMyDispute: phase11UiMocks.closeMyDispute,
  uploadDisputeEvidence: phase11UiMocks.uploadDisputeEvidence,
  disputeEvidenceUrl: phase11UiMocks.disputeEvidenceUrl,
  requestRefund: phase11UiMocks.requestRefund,
  approveRefund: phase11UiMocks.approveRefund,
  rejectRefund: phase11UiMocks.rejectRefund,
  completeRefund: phase11UiMocks.completeRefund,
  disputeErrorLabel: () => 'The action could not be completed.',
}))

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Current location">{`${location.pathname}${location.search}`}</output>
}

function summary(overrides: Partial<DisputeSummary> = {}): DisputeSummary {
  return {
    id: 'dispute-1',
    order_id: 'order-1',
    reason: 'item_not_received',
    description: 'The parcel never arrived.',
    status: 'open',
    resolution: null,
    resolved_at: null,
    created_at: '2026-09-12T01:00:00.000Z',
    updated_at: '2026-09-12T01:00:00.000Z',
    seller: { store_name: 'Ace Paddles' },
    buyer_name: 'Ana Buyer',
    order: {
      id: 'order-1',
      order_number: 'PPB-1001',
      status: 'shipped',
      total: 4500,
      payment_status: 'paid',
      items: [{
        id: 'item-1',
        listing_id: 'listing-1',
        product_title: 'Control Paddle',
        quantity: 1,
        unit_price: 4500,
      }],
    },
    refund: null,
    ...overrides,
  }
}

function detail(overrides: Partial<DisputeDetailType> = {}): DisputeDetailType {
  return {
    ...summary(),
    messages: [],
    evidence: [],
    events: [],
    refund: null,
    ...overrides,
  }
}

function order(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    order_number: 'PPB-1001',
    status: 'shipped',
    fulfillment_type: 'delivery',
    subtotal: 4500,
    total: 4500,
    notes: null,
    created_at: '2026-09-10T01:00:00.000Z',
    updated_at: '2026-09-12T01:00:00.000Z',
    confirmed_at: '2026-09-10T02:00:00.000Z',
    paid_at: '2026-09-10T03:00:00.000Z',
    preparing_at: '2026-09-11T01:00:00.000Z',
    shipped_at: '2026-09-12T01:00:00.000Z',
    ready_for_pickup_at: null,
    completed_at: null,
    cancelled_at: null,
    seller: { id: 'seller-1', store_name: 'Ace Paddles' },
    buyer_name: 'Ana Buyer',
    items: [{
      id: 'item-1',
      listing_id: 'listing-1',
      product_title: 'Control Paddle',
      quantity: 1,
      unit_price: 4500,
    }],
    payment: null,
    fulfillment: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  phase11UiMocks.auth.isAuthenticated = true
  phase11UiMocks.auth.user = { id: 'buyer-1', email: 'buyer@example.com' }
  phase11UiMocks.submitListingReport.mockResolvedValue({ data: { id: 'report-1' }, error: null })
  phase11UiMocks.getOrderDispute.mockResolvedValue({ data: null, error: null })
  phase11UiMocks.getDisputeDetail.mockResolvedValue({ data: detail(), error: null })
  phase11UiMocks.sendDisputeMessage.mockResolvedValue({ data: { id: 'message-1' }, error: null })
  phase11UiMocks.escalateDispute.mockResolvedValue({ data: { id: 'dispute-1' }, error: null })
  phase11UiMocks.closeMyDispute.mockResolvedValue({ data: { id: 'dispute-1' }, error: null })
  phase11UiMocks.uploadDisputeEvidence.mockResolvedValue({ data: { id: 'evidence-1' }, error: null })
  phase11UiMocks.disputeEvidenceUrl.mockResolvedValue({ data: 'https://private.example/evidence', error: null })
  phase11UiMocks.requestRefund.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
  phase11UiMocks.approveRefund.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
  phase11UiMocks.rejectRefund.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
  phase11UiMocks.completeRefund.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
})

describe('ListingReportDialog', () => {
  it('submits an accessible authenticated report and confirms receipt', async () => {
    render(
      <MemoryRouter>
        <ListingReportDialog listingId="listing-1" listingTitle="Suspicious Paddle" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Report listing' }))
    expect(screen.getByRole('dialog', { name: 'Report listing' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'scam_or_fraud' } })
    fireEvent.change(screen.getByLabelText(/^Details/), {
      target: { value: 'Seller requests payment off-platform.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => {
      expect(phase11UiMocks.submitListingReport).toHaveBeenCalledWith({
        listingId: 'listing-1',
        reason: 'scam_or_fraud',
        description: 'Seller requests payment off-platform.',
      })
    })
    expect(await screen.findByText(/thanks for reporting this listing/i)).toBeInTheDocument()
  })

  it('redirects a guest to sign in with the listing return URL', () => {
    phase11UiMocks.auth.isAuthenticated = false
    phase11UiMocks.auth.user = null
    render(
      <MemoryRouter initialEntries={['/marketplace/listing-1']}>
        <Routes>
          <Route path="*" element={<><ListingReportDialog listingId="listing-1" listingTitle="Paddle" /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Report listing' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/login')
  })
})

describe('OrderDisputePanel', () => {
  it('offers the buyer an open-dispute route only for an eligible order', async () => {
    render(
      <MemoryRouter>
        <OrderDisputePanel order={order()} view="buyer" />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: 'Report a problem' })).toHaveAttribute(
      'href',
      '/orders/order-1/dispute',
    )
  })

  it('does not offer a dispute mutation for an ineligible pending order', async () => {
    render(
      <MemoryRouter>
        <OrderDisputePanel order={order({ status: 'pending' })} view="buyer" />
      </MemoryRouter>,
    )
    await waitFor(() => expect(phase11UiMocks.getOrderDispute).toHaveBeenCalledWith('order-1'))
    expect(screen.queryByRole('link', { name: 'Report a problem' })).not.toBeInTheDocument()
  })

  it('routes either participant to an existing dispute rather than opening another', async () => {
    phase11UiMocks.getOrderDispute.mockResolvedValue({ data: summary(), error: null })
    render(
      <MemoryRouter>
        <OrderDisputePanel order={order({ status: 'disputed' })} view="seller" />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: 'View dispute' })).toHaveAttribute(
      'href',
      '/seller/disputes/dispute-1',
    )
  })
})

describe('dispute participant views', () => {
  it('renders a role-correct linked summary without private counterparty fields', () => {
    render(
      <MemoryRouter>
        <DisputeList disputes={[summary()]} view="buyer" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /PPB-1001/ })).toHaveAttribute(
      'href',
      '/disputes/dispute-1',
    )
    expect(screen.getByText('Ace Paddles')).toBeInTheDocument()
    expect(screen.queryByText('buyer@example.com')).not.toBeInTheDocument()
  })

  it('sends a participant message and refreshes the authoritative detail', async () => {
    render(
      <MemoryRouter initialEntries={['/disputes/dispute-1']}>
        <Routes>
          <Route path="/disputes/:disputeId" element={<DisputeDetail view="buyer" />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByLabelText(/^Add a message/), { target: { value: 'Please check the courier.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => {
      expect(phase11UiMocks.sendDisputeMessage).toHaveBeenCalledWith(
        'dispute-1',
        'Please check the courier.',
      )
    })
    await waitFor(() => expect(phase11UiMocks.getDisputeDetail).toHaveBeenCalledTimes(2))
  })
})

describe('DisputeEvidencePanel', () => {
  it('uploads supported evidence for the signed-in participant', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(
      <DisputeEvidencePanel
        disputeId="dispute-1"
        userId="buyer-1"
        evidence={[]}
        view="buyer"
        active
        onUpdated={onRefresh}
      />,
    )
    const file = new File(['proof'], 'proof.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Add evidence'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload evidence' }))
    await waitFor(() => {
      expect(phase11UiMocks.uploadDisputeEvidence).toHaveBeenCalledWith('buyer-1', 'dispute-1', file)
    })
    expect(onRefresh).toHaveBeenCalled()
  })

  it('opens existing evidence only after obtaining a short-lived signed URL', async () => {
    const open = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(
      <DisputeEvidencePanel
        disputeId="dispute-1"
        userId="buyer-1"
        evidence={[{
          id: 'evidence-1',
          uploader: { id: 'seller-user-1', display_name: 'Seller' },
          storage_path: 'seller-user-1/dispute-1/proof.pdf',
          original_filename: 'proof.pdf',
          mime_type: 'application/pdf',
          size_bytes: 100,
          created_at: '2026-09-12T01:00:00.000Z',
        }]}
        view="buyer"
        active={false}
        onUpdated={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View evidence' }))
    await waitFor(() => {
      expect(phase11UiMocks.disputeEvidenceUrl).toHaveBeenCalledWith(
        'seller-user-1/dispute-1/proof.pdf',
      )
      expect(open).toHaveBeenCalled()
    })
  })
})

describe('DisputeRefundPanel', () => {
  it('lets the buyer request only the displayed full order amount', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(
      <DisputeRefundPanel
        dispute={detail()}
        view="buyer"
        active
        onUpdated={onRefresh}
      />,
    )
    expect(screen.getByText('₱4,500.00')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^Refund reason/), { target: { value: 'Item was never received.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request full refund' }))
    await waitFor(() => {
      expect(phase11UiMocks.requestRefund).toHaveBeenCalledWith({
        disputeId: 'dispute-1',
        requestedAmount: 4500,
        reason: 'Item was never received.',
      })
    })
    expect(onRefresh).toHaveBeenCalled()
  })

  it('lets only the seller approve a requested refund', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(
      <DisputeRefundPanel
        dispute={detail({
          refund: {
            id: 'refund-1',
            amount: 4500,
            reason: 'Never delivered',
            status: 'requested',
            review_reason: null,
            method: null,
            reference: null,
            notes: null,
            requested_at: '2026-09-12T01:00:00.000Z',
            reviewed_at: null,
            completed_at: null,
            created_at: '2026-09-12T01:00:00.000Z',
            updated_at: '2026-09-12T01:00:00.000Z',
            events: [],
          },
        })}
        view="seller"
        active
        onUpdated={onRefresh}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Approve refund' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, approve refund' }))
    await waitFor(() => expect(phase11UiMocks.approveRefund).toHaveBeenCalledWith('refund-1'))
    expect(onRefresh).toHaveBeenCalled()
  })
})
