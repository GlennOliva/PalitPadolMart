import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  submitOrderPayment,
  approveOrderPayment,
  rejectOrderPayment,
  markCashReceived,
  uploadPaymentProof,
} from '../../src/features/orders/payments.service'
import {
  startOrderPreparation,
  markOrderShipped,
  markOrderReadyForPickup,
  confirmOrderReceived,
} from '../../src/features/orders/fulfillment.service'
import { PAYMENT_PROOF_BUCKET } from '../../src/features/orders/payments.types'

/**
 * RPC RECEIVER BINDING REGRESSION (Phase 9 runtime bug).
 *
 * The real `SupabaseClient.rpc` reads `this.rest` internally. A service file
 * that detached the method (`const rpc = supabase.rpc`) invoked it with
 * `this === undefined`, crashing the browser with:
 *
 *   TypeError: undefined is not an object (evaluating 'this.rest')
 *
 * That exact failure was reproduced during manual payment submission. This
 * mock mirrors the real client shape: `rpc` is a REAL method that requires the
 * client receiver and throws the same `this.rest` TypeError when it is lost.
 * The old code path failed here exactly like the browser; the fixed services
 * must call through the member expression so the receiver stays bound.
 */
const { supabaseClient, rpcReceivers, rpcPost, storageFrom } = vi.hoisted(() => {
  const rpcReceivers: unknown[] = []
  const rpcPost = vi.fn(async (_name: string, _args: unknown) => ({
    data: { id: 'pay-1', status: 'submitted' },
    error: null,
  }))
  const storageFrom = vi.fn()
  const supabaseClient = {
    rest: { post: rpcPost },
    storage: { from: storageFrom },
    from: vi.fn(),
    rpc(name: string, args: Record<string, unknown>) {
      rpcReceivers.push(this)
      const self = this as { rest?: { post?: (n: string, a: unknown) => Promise<unknown> } }
      if (self?.rest == null) {
        throw new TypeError("undefined is not an object (evaluating 'this.rest')")
      }
      return self.rest.post!(name, args)
    },
  }
  return { supabaseClient, rpcReceivers, rpcPost, storageFrom }
})

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: supabaseClient,
}))

describe('Phase 9 RPC services keep the Supabase client receiver bound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcReceivers.length = 0
  })

  it('submitOrderPayment invokes submit_payment with this === supabase', async () => {
    const { data, error } = await submitOrderPayment({
      order_id: 'order-1',
      payment_method: 'cash_on_pickup',
    })

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(rpcPost).toHaveBeenCalledWith(
      'submit_payment',
      expect.objectContaining({ p_order_id: 'order-1' }),
    )
    expect(rpcReceivers).toEqual([supabaseClient])
  })

  it('every payment-review RPC call keeps the client as its receiver', async () => {
    await approveOrderPayment('pay-1')
    await rejectOrderPayment('pay-1', 'Blurry image')
    await markCashReceived('pay-1')

    expect(rpcReceivers).toEqual([supabaseClient, supabaseClient, supabaseClient])
    expect(rpcPost).toHaveBeenNthCalledWith(
      1,
      'review_payment',
      expect.objectContaining({ p_payment_id: 'pay-1', p_decision: 'approve' }),
    )
    expect(rpcPost).toHaveBeenNthCalledWith(
      2,
      'review_payment',
      expect.objectContaining({ p_payment_id: 'pay-1', p_decision: 'reject' }),
    )
    expect(rpcPost).toHaveBeenNthCalledWith(
      3,
      'mark_cash_received',
      expect.objectContaining({ p_payment_id: 'pay-1' }),
    )
  })

  it('every fulfillment RPC call keeps the client as its receiver', async () => {
    await startOrderPreparation('order-1')
    await markOrderShipped('order-1', 'TRACK-1', 'J&T')
    await markOrderReadyForPickup('order-2')
    await confirmOrderReceived('order-1')

    expect(rpcReceivers).toEqual([
      supabaseClient,
      supabaseClient,
      supabaseClient,
      supabaseClient,
    ])
    expect(rpcPost).toHaveBeenNthCalledWith(
      1,
      'start_order_preparation',
      expect.objectContaining({ p_order_id: 'order-1' }),
    )
    expect(rpcPost).toHaveBeenNthCalledWith(
      2,
      'mark_order_shipped',
      expect.objectContaining({ p_order_id: 'order-1', p_tracking_number: 'TRACK-1', p_courier: 'J&T' }),
    )
    expect(rpcPost).toHaveBeenNthCalledWith(
      3,
      'mark_order_ready_for_pickup',
      expect.objectContaining({ p_order_id: 'order-2' }),
    )
    expect(rpcPost).toHaveBeenNthCalledWith(
      4,
      'confirm_order_received',
      expect.objectContaining({ p_order_id: 'order-1' }),
    )
  })

  it('a lost receiver surfaces a safe structured error instead of throwing', async () => {
    supabaseClient.rpc = function () {
      throw new TypeError("undefined is not an object (evaluating 'this.rest')")
    } as never

    const { data, error } = await submitOrderPayment({
      order_id: 'order-1',
      payment_method: 'cash_on_pickup',
    })

    expect(data).toBeNull()
    expect(error).toEqual({ code: 'UNKNOWN', message: 'Something went wrong.' })
  })

  it('uploadPaymentProof still routes through the storage bucket chain', async () => {
    const upload = vi.fn(
      async (_path: string, _file: File, _opts: Record<string, unknown>) => ({
        data: { path: 'ignored' },
        error: null,
      }),
    )
    storageFrom.mockReturnValue({ upload })

    const res = await uploadPaymentProof(
      new File(['x'], 'gcash.png', { type: 'image/png' }),
      'order-1',
      'buyer-1',
    )

    expect(res.error).toBeNull()
    expect(storageFrom).toHaveBeenCalledWith(PAYMENT_PROOF_BUCKET)
    const uploadCall = upload.mock.calls[0] as [string, File, Record<string, unknown>]
    expect(uploadCall[0]).toBe(res.path)
    expect(uploadCall[1].name).toBe('gcash.png')
    expect(uploadCall[2]).toEqual({ upsert: true })
  })
})