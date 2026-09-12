import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import SellerPaymentPanel from '../../src/components/orders/SellerPaymentPanel'
import SellerFulfillmentActions from '../../src/components/orders/SellerFulfillmentActions'
import { approveOrderPayment } from '../../src/features/orders/payments.service'
import {
  startOrderPreparation,
  markOrderReadyForPickup,
} from '../../src/features/orders/fulfillment.service'
import type { Order, OrderDetail } from '../../src/features/orders/orders.types'
import type { PaymentRecord } from '../../src/features/orders/payments.types'

vi.mock('../../src/features/orders/orders.service', () => ({
  orderErrorLabel: (code: string) => `ERR:${code}`,
}))

vi.mock('../../src/features/orders/payments.service', () => ({
  approveOrderPayment: vi.fn(),
  rejectOrderPayment: vi.fn(),
  markCashReceived: vi.fn(),
  submitOrderPayment: vi.fn(),
  uploadPaymentProof: vi.fn(),
  paymentProofUrl: vi.fn(),
  getSellerPaymentMethods: vi.fn(),
  setSellerPaymentMethod: vi.fn(),
}))

vi.mock('../../src/features/orders/fulfillment.service', () => ({
  startOrderPreparation: vi.fn(),
  markOrderShipped: vi.fn(),
  markOrderReadyForPickup: vi.fn(),
  confirmOrderReceived: vi.fn(),
  cashIsCollectable: vi.fn(() => false),
}))

const mockedApprove = vi.mocked(approveOrderPayment)
const mockedPrepare = vi.mocked(startOrderPreparation)
const mockedReady = vi.mocked(markOrderReadyForPickup)

function makeOrder(overrides: Partial<OrderDetail>): OrderDetail {
  return {
    id: 'order-a',
    order_number: 'PPB-A',
    status: 'confirmed',
    fulfillment_type: 'delivery',
    subtotal: 2000,
    total: 2000,
    notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    confirmed_at: '2026-08-02T00:00:00.000Z',
    paid_at: null,
    preparing_at: null,
    shipped_at: null,
    ready_for_pickup_at: null,
    completed_at: null,
    cancelled_at: null,
    seller: { id: 'seller-a', store_name: null },
    items: [],
    payment: {
      id: 'pay-a',
      order_id: 'order-a',
      amount: 2000,
      payment_method: 'manual_transfer',
      payment_reference: 'REF-A',
      proof_path: null,
      rejection_reason: null,
      status: 'submitted',
      paid_at: null,
      created_at: '2026-08-02T00:00:00.000Z',
      updated_at: '2026-08-02T00:00:00.000Z',
    },
    fulfillment: null,
    buyer_name: 'Buyer A',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApprove.mockResolvedValue({ data: { id: 'pay-a', status: 'paid' } as unknown as PaymentRecord, error: null })
  mockedPrepare.mockResolvedValue({ data: { status: 'preparing' } as unknown as Order, error: null })
  mockedReady.mockResolvedValue({ data: { status: 'ready_for_pickup' } as unknown as Order, error: null })
})

/**
 * PHASE 9 MULTI-SELLER INDEPENDENCE.
 *
 * The billing/shipping of a seller's orders must never be triggered by another
 * store's UI. Each seller views their own order detail page, but the panels are
 * rendered against order rows with a seller id — this test pins that the
 * component-level wiring stays per-order (the RLS/cross-seller proof lives in
 * verify-phase9.mjs Section G against the hosted DB).
 */
describe('multi-seller panel independence', () => {
  it("approving Seller A's payment never touches Seller B's payment", async () => {
    const orderA = makeOrder({})
    const orderB = makeOrder({
      id: 'order-b',
      order_number: 'PPB-B',
      seller: { id: 'seller-b', store_name: null },
      payment: {
        id: 'pay-b',
        order_id: 'order-b',
        amount: 1500,
        payment_method: 'manual_transfer',
        payment_reference: 'REF-B',
        proof_path: null,
        rejection_reason: null,
        status: 'submitted',
        paid_at: null,
        created_at: '2026-08-02T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
      },
    })

    const { container } = render(
      <>
        <div data-testid="seller-a-panel">
          <SellerPaymentPanel order={orderA} onUpdated={() => undefined} />
        </div>
        <div data-testid="seller-b-panel">
          <SellerPaymentPanel order={orderB} onUpdated={() => undefined} />
        </div>
      </>,
    )

    expect(within(screen.getByTestId('seller-a-panel')).getByText('REF-A')).toBeInTheDocument()
    expect(within(screen.getByTestId('seller-b-panel')).getByText('REF-B')).toBeInTheDocument()

    fireEvent.click(
      within(screen.getByTestId('seller-a-panel')).getByRole('button', { name: 'Approve payment' }),
    )

    await waitFor(() => expect(mockedApprove).toHaveBeenCalledTimes(1))
    expect(mockedApprove).toHaveBeenCalledWith('pay-a')
    expect(container.querySelectorAll('.order-detail__payment-summary')).toHaveLength(2)
  })

  it("starting preparation on Seller A's order does not advance Seller B's order", async () => {
    const orderA = makeOrder({})
    const orderB = makeOrder({
      id: 'order-b',
      order_number: 'PPB-B',
      status: 'preparing',
      fulfillment_type: 'pickup',
      seller: { id: 'seller-b', store_name: null },
      payment: { ...makeOrder({}).payment!, id: 'pay-b' },
    })

    render(
      <>
        <div data-testid="seller-a-panel">
          <SellerFulfillmentActions order={orderA} onUpdated={() => undefined} />
        </div>
        <div data-testid="seller-b-panel">
          <SellerFulfillmentActions order={orderB} onUpdated={() => undefined} />
        </div>
      </>,
    )

    const panelA = screen.getByTestId('seller-a-panel')
    const panelB = screen.getByTestId('seller-b-panel')

    expect(within(panelA).getByRole('button', { name: 'Start preparation' })).toBeInTheDocument()
    expect(within(panelA).queryByRole('button', { name: 'Mark ready for pickup' })).not.toBeInTheDocument()
    expect(within(panelB).getByRole('button', { name: 'Mark ready for pickup' })).toBeInTheDocument()
    expect(within(panelB).queryByRole('button', { name: 'Start preparation' })).not.toBeInTheDocument()

    fireEvent.click(within(panelA).getByRole('button', { name: 'Start preparation' }))

    await waitFor(() => expect(mockedPrepare).toHaveBeenCalledTimes(1))
    expect(mockedPrepare).toHaveBeenCalledWith('order-a')
    expect(mockedReady).not.toHaveBeenCalled()
  })

  it("marking Seller B's pickup order ready never ships Seller A's order", async () => {
    const orderA = makeOrder({})
    const orderB = makeOrder({
      id: 'order-b',
      order_number: 'PPB-B',
      status: 'preparing',
      fulfillment_type: 'pickup',
      seller: { id: 'seller-b', store_name: null },
    })

    render(
      <>
        <div data-testid="seller-a-panel">
          <SellerFulfillmentActions order={orderA} onUpdated={() => undefined} />
        </div>
        <div data-testid="seller-b-panel">
          <SellerFulfillmentActions order={orderB} onUpdated={() => undefined} />
        </div>
      </>,
    )

    fireEvent.click(
      within(screen.getByTestId('seller-b-panel')).getByRole('button', { name: 'Mark ready for pickup' }),
    )

    await waitFor(() => expect(mockedReady).toHaveBeenCalledTimes(1))
    expect(mockedReady).toHaveBeenCalledWith('order-b')
    expect(mockedPrepare).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  vi.clearAllMocks()
})