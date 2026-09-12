import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SellerPaymentPanel from '../../src/components/orders/SellerPaymentPanel'
import {
  approveOrderPayment,
  rejectOrderPayment,
  markCashReceived,
} from '../../src/features/orders/payments.service'
import { cashIsCollectable } from '../../src/features/orders/fulfillment.service'
import type { OrderDetail } from '../../src/features/orders/orders.types'
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
  cashIsCollectable: vi.fn(),
}))

const mockedApprove = vi.mocked(approveOrderPayment)
const mockedReject = vi.mocked(rejectOrderPayment)
const mockedCash = vi.mocked(markCashReceived)
const mockedCollectable = vi.mocked(cashIsCollectable)

function makeOrder(overrides: Partial<OrderDetail> & { paymentStatus?: 'submitted' | 'paid' | 'pending' } = {}): OrderDetail {
  const { paymentStatus, ...rest } = overrides
  return {
    id: 'order-1',
    order_number: 'PPB-0001',
    status: 'confirmed',
    fulfillment_type: 'pickup',
    subtotal: 2000,
    total: 2000,
    notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    confirmed_at: null,
    paid_at: null,
    preparing_at: null,
    shipped_at: null,
    ready_for_pickup_at: null,
    completed_at: null,
    cancelled_at: null,
    seller: { id: 'seller-1', store_name: 'Ace Paddles PH' },
    items: [],
    payment: paymentStatus != null
      ? {
          id: 'pay-1',
          order_id: 'order-1',
          amount: 2000,
          payment_method: paymentStatus === 'pending' ? 'cash_on_pickup' : 'manual_transfer',
          payment_reference: 'GCASH-1',
          proof_path: null,
          rejection_reason: null,
          status: paymentStatus,
          paid_at: paymentStatus === 'paid' ? '2026-08-03T00:00:00.000Z' : null,
          created_at: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-02T00:00:00.000Z',
        }
      : null,
    fulfillment: null,
    buyer_name: 'Ana Test',
    ...rest,
  }
}

function renderPanel(
  order: OrderDetail = makeOrder(),
  onUpdated: () => void = vi.fn(),
) {
  return render(<SellerPaymentPanel order={order} onUpdated={onUpdated} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApprove.mockResolvedValue({ data: { id: 'pay-1', status: 'paid' } as unknown as PaymentRecord, error: null })
  mockedReject.mockResolvedValue({ data: { id: 'pay-1', status: 'rejected' } as unknown as PaymentRecord, error: null })
  mockedCash.mockResolvedValue({ data: { id: 'pay-1', status: 'paid' } as unknown as PaymentRecord, error: null })
  mockedCollectable.mockReturnValue(false)
})

describe('SellerPaymentPanel', () => {
  it('shows a notice when the buyer has not submitted payment yet', () => {
    renderPanel(makeOrder({ payment: null }))
    expect(screen.getByText(/has not submitted payment details yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve payment' })).not.toBeInTheDocument()
  })

  it('reveals the payment summary including reference, method and amount', () => {
    renderPanel(makeOrder({ paymentStatus: 'submitted' }))
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    expect(screen.getByText('Manual transfer')).toBeInTheDocument()
    expect(screen.getByText('GCASH-1')).toBeInTheDocument()
  })

  it('approves a submitted payment and refreshes the order', async () => {
    const onUpdated = vi.fn()
    renderPanel(makeOrder({ paymentStatus: 'submitted' }), onUpdated)

    fireEvent.click(screen.getByRole('button', { name: 'Approve payment' }))
    await waitFor(() => expect(mockedApprove).toHaveBeenCalledWith('pay-1'))
    expect(onUpdated).toHaveBeenCalled()
  })

  it('requires a reason before rejecting a payment', async () => {
    renderPanel(makeOrder({ paymentStatus: 'submitted' }))

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))

    expect(await screen.findByText('A reason is required when rejecting a payment.')).toBeInTheDocument()
    expect(mockedReject).not.toHaveBeenCalled()
  })

  it('rejects a payment with the typed reason and refreshes', async () => {
    const onUpdated = vi.fn()
    renderPanel(makeOrder({ paymentStatus: 'submitted' }), onUpdated)

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByLabelText(/Rejection reason/), {
      target: { value: 'Blurry image' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))

    await waitFor(() => expect(mockedReject).toHaveBeenCalledWith('pay-1', 'Blurry image'))
    expect(onUpdated).toHaveBeenCalled()
  })

  it('records cash as received when the order is collectable', async () => {
    mockedCollectable.mockReturnValue(true)
    const onUpdated = vi.fn()
    renderPanel(makeOrder({ status: 'ready_for_pickup', paymentStatus: 'pending' }), onUpdated)

    fireEvent.click(screen.getByRole('button', { name: 'Mark cash received' }))
    await waitFor(() => expect(mockedCash).toHaveBeenCalledWith('pay-1'))
    expect(onUpdated).toHaveBeenCalled()
  })

  it('hides seller review actions for an already-paid payment', () => {
    renderPanel(makeOrder({ status: 'shipped', paymentStatus: 'paid' }))
    expect(screen.queryByRole('button', { name: 'Approve payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark cash received' })).not.toBeInTheDocument()
  })

  it('maps an approval failure through orderErrorLabel', async () => {
    mockedApprove.mockResolvedValue({ data: null, error: { code: 'PAYMENT_NOT_SUBMITTED', message: 'no' } })
    renderPanel(makeOrder({ paymentStatus: 'submitted' }))

    fireEvent.click(screen.getByRole('button', { name: 'Approve payment' }))

    expect(await screen.findByText('ERR:PAYMENT_NOT_SUBMITTED')).toBeInTheDocument()
  })
})

afterEach(() => {
  vi.clearAllMocks()
})