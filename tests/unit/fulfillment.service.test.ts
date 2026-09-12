import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  startOrderPreparation,
  markOrderShipped,
  markOrderReadyForPickup,
  confirmOrderReceived,
  cashIsCollectable,
} from '../../src/features/orders/fulfillment.service'

/**
 * PHASE 9 FULFILLMENT INVARIANTS.
 *
 * The app-side fulfillment surface is a thin wrapper over the SECURITY DEFINER
 * RPCs owned by the seller/buyer; cross-role authorization is proven against
 * the hosted DB by verify-phase9.mjs. These tests pin the request assembly —
 * the RPC names and the trimmed tracking/courier arguments — so the client and
 * the SQL never drift apart.
 */
const { fulfillmentMocks } = vi.hoisted(() => ({
  fulfillmentMocks: {
    rpc: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    rpc: fulfillmentMocks.rpc,
  },
}))

describe('fulfillment RPC mapping', () => {
  beforeEach(() => {
    fulfillmentMocks.rpc.mockReset()
    fulfillmentMocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('startOrderPreparation → start_order_preparation with the order id', async () => {
    const { error } = await startOrderPreparation('order-1')
    expect(error).toBeNull()
    expect(fulfillmentMocks.rpc).toHaveBeenCalledWith('start_order_preparation', {
      p_order_id: 'order-1',
    })
  })

  it('markOrderReadyForPickup → mark_order_ready_for_pickup with the order id', async () => {
    const { error } = await markOrderReadyForPickup('order-1')
    expect(error).toBeNull()
    expect(fulfillmentMocks.rpc).toHaveBeenCalledWith('mark_order_ready_for_pickup', {
      p_order_id: 'order-1',
    })
  })

  it('confirmOrderReceived → confirm_order_received with the order id', async () => {
    const { error } = await confirmOrderReceived('order-1')
    expect(error).toBeNull()
    expect(fulfillmentMocks.rpc).toHaveBeenCalledWith('confirm_order_received', {
      p_order_id: 'order-1',
    })
  })

  it('markOrderShipped trims tracking/courier before sending', async () => {
    const { error } = await markOrderShipped('order-1', '  JNT-2026-001 ', ' J&T Express ')
    expect(error).toBeNull()
    expect(fulfillmentMocks.rpc).toHaveBeenCalledWith('mark_order_shipped', {
      p_order_id: 'order-1',
      p_tracking_number: 'JNT-2026-001',
      p_courier: 'J&T Express',
    })
  })

  it('markOrderShipped omits blank tracking/courier so the RPC raises TRACKING_REQUIRED', async () => {
    const { error } = await markOrderShipped('order-1', '   ', '')
    expect(error).toBeNull()
    expect(fulfillmentMocks.rpc).toHaveBeenCalledWith('mark_order_shipped', {
      p_order_id: 'order-1',
      p_tracking_number: undefined,
      p_courier: undefined,
    })
  })

  it('maps a structured RPC error through parseOrderError', async () => {
    fulfillmentMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'TRACKING_REQUIRED: tracking details are required for delivery' },
    })
    const { data, error } = await markOrderShipped('order-1', '', '')
    expect(data).toBeNull()
    expect(error).toEqual({
      code: 'TRACKING_REQUIRED',
      message: 'tracking details are required for delivery',
    })
  })

  it('parses a PGRST code into FORBIDDEN', async () => {
    fulfillmentMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'new row violates row-level security policy', code: '42501' },
    })
    const { error } = await confirmOrderReceived('order-1')
    expect(error).toEqual({
      code: 'FORBIDDEN',
      message: 'You are not allowed to do that.',
    })
  })
})

describe('cashIsCollectable', () => {
  it('is true for a pending cash-on-pickup order that is ready for pickup', () => {
    expect(
      cashIsCollectable({
        status: 'ready_for_pickup',
        payment: { status: 'pending', payment_method: 'cash_on_pickup' },
      }),
    ).toBe(true)
  })

  it('is true for a pending cash-on-delivery order once shipped', () => {
    expect(
      cashIsCollectable({
        status: 'shipped',
        payment: { status: 'pending', payment_method: 'cash_on_delivery' },
      }),
    ).toBe(true)
  })

  it('is false once the cash was already paid (paid status)', () => {
    expect(
      cashIsCollectable({
        status: 'shipped',
        payment: { status: 'paid', payment_method: 'cash_on_delivery' },
      }),
    ).toBe(false)
  })

  it('is false for non-cash methods', () => {
    expect(
      cashIsCollectable({
        status: 'ready_for_pickup',
        payment: { status: 'pending', payment_method: 'manual_transfer' },
      }),
    ).toBe(false)
  })

  it('is false before the order is handed off (confirmed)', () => {
    expect(
      cashIsCollectable({
        status: 'confirmed',
        payment: { status: 'pending', payment_method: 'cash_on_pickup' },
      }),
    ).toBe(false)
  })

  it('is false with no payment row at all', () => {
    expect(cashIsCollectable({ status: 'ready_for_pickup', payment: null })).toBe(false)
  })
})

afterEach(() => {
  vi.clearAllMocks()
})