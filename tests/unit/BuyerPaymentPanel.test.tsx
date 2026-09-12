import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BuyerPaymentPanel from '../../src/components/orders/BuyerPaymentPanel'
import {
  submitOrderPayment,
  uploadPaymentProof,
} from '../../src/features/orders/payments.service'
import type { OrderDetail } from '../../src/features/orders/orders.types'
import type { PaymentRecord, SellerPaymentMethod } from '../../src/features/orders/payments.types'

vi.mock('../../src/features/orders/orders.service', () => ({
  orderErrorLabel: (code: string) => `ERR:${code}`,
}))

vi.mock('../../src/features/orders/payments.service', () => ({
  submitOrderPayment: vi.fn(),
  uploadPaymentProof: vi.fn(),
  approveOrderPayment: vi.fn(),
  rejectOrderPayment: vi.fn(),
  markCashReceived: vi.fn(),
  paymentProofUrl: vi.fn(),
  getSellerPaymentMethods: vi.fn(),
  setSellerPaymentMethod: vi.fn(),
}))

const mockedSubmit = vi.mocked(submitOrderPayment)
const mockedUpload = vi.mocked(uploadPaymentProof)

function makeMethod(method: string, enabled: boolean, instructions: string | null): SellerPaymentMethod {
  return {
    id: `spm-${method}`,
    seller_id: 'seller-1',
    method,
    is_enabled: enabled,
    instructions,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }
}

const DEFAULT_METHODS: SellerPaymentMethod[] = [
  makeMethod('cash_on_pickup', true, 'Meet at the gate'),
  makeMethod('manual_transfer', true, 'GCash 09171234567'),
  makeMethod('cash_on_delivery', false, null),
]

function makeOrder(
  overrides: Partial<OrderDetail> & { paymentStatus?: 'rejected' } = {},
): OrderDetail {
  const { paymentStatus, ...rest } = overrides
  return {
    id: 'order-1',
    order_number: 'ORD-0001',
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
          payment_method: 'manual_transfer',
          payment_reference: 'GCASH-1',
          proof_path: null,
          rejection_reason: paymentStatus === 'rejected' ? 'Blurry photo' : null,
          status: paymentStatus,
          paid_at: null,
          created_at: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-02T00:00:00.000Z',
        }
      : null,
    fulfillment: null,
    buyer_name: null,
    ...rest,
  }
}

function renderPanel(
  order: OrderDetail = makeOrder(),
  methods: SellerPaymentMethod[] = DEFAULT_METHODS,
  buyerId = 'buyer-1',
  onUpdated: () => void = vi.fn(),
) {
  return render(<BuyerPaymentPanel order={order} buyerId={buyerId} methods={methods} onUpdated={onUpdated} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSubmit.mockResolvedValue({ data: { id: 'pay-1', status: 'submitted' } as unknown as PaymentRecord, error: null })
})

describe('BuyerPaymentPanel', () => {
  it('preselects cash on pickup for a pickup order that offers it', () => {
    renderPanel()
    expect(screen.getByRole('radio', { name: /Cash on pickup/ })).toBeChecked()
  })

  it('skips disabled methods and falls back to manual transfer when no cash is enabled', () => {
    renderPanel(makeOrder(), [makeMethod('cash_on_delivery', false, null), makeMethod('manual_transfer', true, 'GCash')])
    expect(screen.queryByRole('radio', { name: /Cash on delivery/ })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Manual transfer/ })).toBeChecked()
  })

  it('preselects cash on delivery for a delivery order when the seller enables it', () => {
    renderPanel(makeOrder({ fulfillment_type: 'delivery' }), [
      makeMethod('cash_on_delivery', true, 'Pay the courier'),
      makeMethod('manual_transfer', true, 'GCash'),
    ])
    expect(screen.getByRole('radio', { name: /Cash on delivery/ })).toBeChecked()
  })

  it('submits a cash-on-pickup order without proof or reference', async () => {
    const onUpdated = vi.fn()
    renderPanel(makeOrder(), DEFAULT_METHODS, 'buyer-1', onUpdated)

    fireEvent.click(screen.getByRole('button', { name: 'Submit payment details' }))

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalled())
    expect(mockedSubmit).toHaveBeenCalledWith({
      order_id: 'order-1',
      payment_method: 'cash_on_pickup',
      proof_path: null,
      reference: '',
      delivery: null,
    })
    expect(await screen.findByText(/payment details were submitted/)).toBeInTheDocument()
    expect(onUpdated).toHaveBeenCalled()
  })

  it('requires a proof upload for manual transfer', async () => {
    const order = makeOrder({
      fulfillment_type: 'delivery',
      payment: null,
    })
    // Only transfer available so manual_transfer gets preselected.
    renderPanel(order, [makeMethod('manual_transfer', true, 'GCash')])

    fireEvent.click(screen.getByRole('button', { name: 'Submit payment details' }))

    expect(await screen.findByText('Upload your payment proof to submit.')).toBeInTheDocument()
    expect(mockedUpload).not.toHaveBeenCalled()
    expect(mockedSubmit).not.toHaveBeenCalled()
  })

  it('uploads the proof then submits with the returned path', async () => {
    mockedUpload.mockResolvedValue({ path: 'buyer-1/order-1/proof-1.png', error: null })
    const order = makeOrder({ payment: null })
    renderPanel(order, [makeMethod('manual_transfer', true, 'GCash')])

    const file = new File(['x'], 'gcash.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Payment proof *'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit payment details' }))

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledWith(file, 'order-1', 'buyer-1'))
    await waitFor(() => expect(mockedSubmit).toHaveBeenCalled())
    expect(mockedSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: 'order-1',
        payment_method: 'manual_transfer',
        proof_path: 'buyer-1/order-1/proof-1.png',
        delivery: null,
      }),
    )
  })

  it('requires the delivery address fields before submitting a delivery order', async () => {
    const order = makeOrder({ fulfillment_type: 'delivery', payment: null })
    renderPanel(order, [makeMethod('cash_on_delivery', true, 'Pay the courier')])

    fireEvent.click(screen.getByRole('button', { name: 'Submit payment details' }))

    expect(await screen.findByText('Recipient name is required.')).toBeInTheDocument()
    expect(mockedSubmit).not.toHaveBeenCalled()
  })

  it('submits a complete delivery snapshot for a delivery order', async () => {
    const order = makeOrder({ fulfillment_type: 'delivery', payment: null })
    renderPanel(order, [makeMethod('cash_on_delivery', true, 'Pay the courier')])

    fireEvent.change(screen.getByLabelText(/Recipient name/), { target: { value: 'Ana Test' } })
    fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: '09170000000' } })
    fireEvent.change(screen.getByLabelText(/Street address/), { target: { value: '123 Sesame Street' } })
    fireEvent.change(screen.getByLabelText(/^City/), { target: { value: 'Cebu City' } })
    fireEvent.change(screen.getByLabelText(/Province/), { target: { value: 'Cebu' } })
    fireEvent.change(screen.getByLabelText(/Postal code/), { target: { value: '6000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit payment details' }))

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalled())
    expect(mockedSubmit).toHaveBeenCalledWith({
      order_id: 'order-1',
      payment_method: 'cash_on_delivery',
      proof_path: null,
      reference: '',
      delivery: {
        recipient_name: 'Ana Test',
        phone: '09170000000',
        address: '123 Sesame Street',
        city: 'Cebu City',
        province: 'Cebu',
        postal_code: '6000',
        delivery_notes: '',
      },
    })
  })

  it('shows the rejection reason and re-labels the submit button for a rejected payment', () => {
    renderPanel(makeOrder({ paymentStatus: 'rejected' }))
    expect(screen.getByText(/Your payment was not approved: Blurry photo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit corrected payment' })).toBeInTheDocument()
  })

  it('does not offer methods the seller has disabled on a rejected resubmit', () => {
    renderPanel(makeOrder({ paymentStatus: 'rejected' }), [makeMethod('cash_on_delivery', false, null)])
    expect(screen.queryByRole('radio', { name: /Cash on delivery/ })).not.toBeInTheDocument()
  })

  it('maps a submission RPC error through orderErrorLabel', async () => {
    mockedSubmit.mockResolvedValue({ data: null, error: { code: 'PAYMENT_METHOD_UNAVAILABLE', message: 'no' } })
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Submit payment details' }))

    expect(await screen.findByText('ERR:PAYMENT_METHOD_UNAVAILABLE')).toBeInTheDocument()
  })

  it('renders a safe inline error and resets busy when submission unexpectedly rejects', async () => {
    mockedSubmit.mockRejectedValueOnce(new Error('boom'))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Submit payment details' }))

    expect(
      await screen.findByText('Something went wrong submitting your payment. Please try again.'),
    ).toBeInTheDocument()
    expect(mockedSubmit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Submit payment details' })).not.toBeDisabled()
  })

  it('shows a safe inline error and never reaches submit when the proof upload unexpectedly rejects', async () => {
    mockedUpload.mockRejectedValueOnce(new Error('boom'))
    renderPanel(makeOrder({ payment: null }), [makeMethod('manual_transfer', true, 'GCash')])

    fireEvent.change(screen.getByLabelText('Payment proof *'), {
      target: { files: [new File(['x'], 'gcash.png', { type: 'image/png' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit payment details' }))

    expect(
      await screen.findByText('We could not upload your proof. Please try again.'),
    ).toBeInTheDocument()
    expect(mockedSubmit).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  vi.clearAllMocks()
})