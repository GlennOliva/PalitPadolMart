import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Hosted Phase 12 verification uses only the public anon key and reusable,
// confirmed accounts. It never signs users up or uses a service-role key.
const env = { ...process.env }
try {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (match && env[match[1]] === undefined) {
      env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch {
  // Environment variables may be exported instead.
}

const url = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('FAIL: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing')
  process.exit(1)
}

const REQUIRED_CREDS = [
  'PHASE7_TEST_SELLER_EMAIL',
  'PHASE7_TEST_SELLER_PASSWORD',
  'PHASE7_TEST_BUYER_EMAIL',
  'PHASE7_TEST_BUYER_PASSWORD',
  'PHASE7_TEST_STRANGER_EMAIL',
  'PHASE7_TEST_STRANGER_PASSWORD',
]
const missing = REQUIRED_CREDS.filter((name) => !env[name])
if (missing.length > 0) {
  console.error('SKIPPED: hosted Phase 12 verification requires confirmed reusable accounts.')
  for (const name of missing) console.error(`  ${name}`)
  process.exit(2)
}

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let failures = 0
let skipped = 0

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function check(name, ok, detail = '') {
  if (ok) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

function skip(name, reason) {
  skipped += 1
  console.log(`  SKIP  ${name} - ${reason}`)
}

function detail(value) {
  if (value == null) return ''
  if (value instanceof Error) return value.message
  return JSON.stringify(value)
}

async function signIn(role, email, password) {
  const c = client()
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error != null || data.user == null) {
    throw new Error(`could not sign in ${role}: ${error?.message ?? 'no user returned'}`)
  }
  return { c, user: data.user }
}

async function notification(c, eventName, entityId) {
  return c
    .from('notifications')
    .select('*')
    .eq('event_name', eventName)
    .eq('related_entity_id', entityId)
    .order('created_at', { ascending: false })
}

async function expectOneNotification(name, c, eventName, entityId, expectedTarget) {
  const result = await notification(c, eventName, entityId)
  check(
    name,
    result.error == null && result.data?.length === 1 && result.data[0].related_entity_type === expectedTarget,
    detail(result.error ?? result.data),
  )
  return result.data?.[0] ?? null
}

async function expectNotificationCount(name, c, eventName, entityId, expectedCount, expectedTarget) {
  const result = await notification(c, eventName, entityId)
  check(
    name,
    result.error == null &&
      result.data?.length === expectedCount &&
      result.data.every((row) => row.related_entity_type === expectedTarget),
    detail(result.error ?? result.data),
  )
  return result.data ?? []
}

async function expectDenied(name, promise) {
  const result = await promise
  check(name, result.error != null, result.error == null ? 'unexpectedly succeeded' : '')
}

async function main() {
  console.log('== Phase 12 hosted verification (notifications) ==')
  console.log(`Run id: ${runId}`)

  const anon = client()
  let seller
  let buyer
  let stranger
  let sellerB = null
  let admin = null
  let sellerId
  let categoryId
  const listingIds = []
  let sellerOriginalStatus = null

  try {
    seller = await signIn('seller', env.PHASE7_TEST_SELLER_EMAIL, env.PHASE7_TEST_SELLER_PASSWORD)
    buyer = await signIn('buyer', env.PHASE7_TEST_BUYER_EMAIL, env.PHASE7_TEST_BUYER_PASSWORD)
    stranger = await signIn('stranger', env.PHASE7_TEST_STRANGER_EMAIL, env.PHASE7_TEST_STRANGER_PASSWORD)
    check('seller signs in with retained password auth', seller.user != null)
    check('buyer signs in with retained password auth', buyer.user != null)
    check('stranger signs in with retained password auth', stranger.user != null)

    if (env.PHASE8_TEST_SELLER_B_EMAIL && env.PHASE8_TEST_SELLER_B_PASSWORD) {
      sellerB = await signIn('seller B', env.PHASE8_TEST_SELLER_B_EMAIL, env.PHASE8_TEST_SELLER_B_PASSWORD)
    }
    if (env.PHASE12_TEST_ADMIN_EMAIL && env.PHASE12_TEST_ADMIN_PASSWORD) {
      admin = await signIn('admin', env.PHASE12_TEST_ADMIN_EMAIL, env.PHASE12_TEST_ADMIN_PASSWORD)
    }

    console.log('\n-- OAuth provider configuration probe --')
    const oauthStart = await anon.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:5173/auth/callback?next=%2Fdashboard',
        scopes: 'openid email profile',
        skipBrowserRedirect: true,
      },
    })
    let googleRedirect = false
    let oauthDetail = oauthStart.error?.message ?? 'no authorization URL returned'
    if (oauthStart.error == null && oauthStart.data.url) {
      const response = await fetch(oauthStart.data.url, { redirect: 'manual' })
      const location = response.headers.get('location')
      try {
        const target = location == null ? null : new URL(location)
        googleRedirect = target?.hostname === 'accounts.google.com'
        oauthDetail = target == null ? `HTTP ${response.status}, no redirect` : `HTTP ${response.status}, host ${target.hostname}`
      } catch {
        oauthDetail = `HTTP ${response.status}, invalid redirect`
      }
    }
    check('hosted Supabase Google provider redirects to Google', googleRedirect, oauthDetail)

    const sellerProfile = await seller.c
      .from('seller_profiles')
      .select('id, seller_status')
      .eq('user_id', seller.user.id)
      .single()
    sellerId = sellerProfile.data?.id
    sellerOriginalStatus = sellerProfile.data?.seller_status ?? null
    check('primary seller profile is active', sellerId != null && sellerOriginalStatus === 'active', detail(sellerProfile.error ?? sellerProfile.data))
    if (!sellerId) throw new Error('an active seller profile is required')

    const category = await buyer.c.from('categories').select('id').limit(1).single()
    categoryId = category.data?.id
    if (!categoryId) throw new Error('at least one category is required')

    console.log('\n-- A. Private write boundary and owner RLS --')
    await expectDenied(
      'authenticated browser cannot execute legacy notify_user',
      buyer.c.rpc('notify_user', {
        p_recipient_id: stranger.user.id,
        p_type: 'system',
        p_title: 'Forged notification',
        p_message: 'Forged by a browser client',
        p_related_entity_type: null,
        p_related_entity_id: null,
      }),
    )
    await expectDenied(
      'authenticated browser cannot execute private emitter',
      buyer.c.rpc('emit_marketplace_notification', {
        p_recipient_id: stranger.user.id,
        p_event_name: 'system.forged',
        p_event_key: `system.forged:${runId}`,
        p_type: 'system',
        p_title: 'Forged notification',
      }),
    )
    await expectDenied(
      'anonymous browser cannot execute legacy notify_user',
      anon.rpc('notify_user', {
        p_recipient_id: stranger.user.id,
        p_type: 'system',
        p_title: 'Forged notification',
        p_message: null,
        p_related_entity_type: null,
        p_related_entity_id: null,
      }),
    )
    await expectDenied(
      'direct notification insert is revoked',
      buyer.c.from('notifications').insert({
        recipient_id: buyer.user.id,
        event_name: 'system.forged',
        event_key: `system.forged:${runId}`,
        type: 'system',
        title: 'Forged notification',
      }),
    )

    const listing = await seller.c
      .from('listings')
      .insert({
        seller_id: sellerId,
        category_id: categoryId,
        title: `Phase 12 notification listing ${runId}`,
        description: 'Hosted Phase 12 notification verification listing.',
        listing_condition: 'like_new',
        price: 1450,
        quantity: 8,
        listing_status: 'active',
        pickup_available: true,
        delivery_available: true,
      })
      .select('id, price')
      .single()
    if (listing.error != null || listing.data == null) throw new Error(`could not create listing: ${listing.error?.message}`)
    listingIds.push(listing.data.id)

    const deliverySnapshot = {
      p_recipient_name: 'Phase 12 Buyer',
      p_phone: '09171234567',
      p_address: '12 Notification Street',
      p_city: 'Cebu City',
      p_province: 'Cebu',
      p_postal_code: '6000',
      p_delivery_notes: 'Hosted notification verification.',
    }

    console.log('\n-- B. Inquiry events --')
    const inquiry = await buyer.c
      .from('inquiries')
      .insert({
        listing_id: listing.data.id,
        buyer_id: buyer.user.id,
        seller_id: sellerId,
        subject: `Phase 12 inquiry ${runId}`,
        message: 'Is this paddle available for pickup?',
      })
      .select('id')
      .single()
    if (inquiry.error != null || inquiry.data == null) throw new Error(`could not create inquiry: ${inquiry.error?.message}`)
    const inquiryNotice = await expectOneNotification(
      'new inquiry notifies only the owning seller', seller.c, 'inquiry.created', inquiry.data.id, 'inquiry',
    )
    if (inquiryNotice == null) throw new Error('new inquiry notification was not created')
    const inquiryLeak = await notification(stranger.c, 'inquiry.created', inquiry.data.id)
    check('stranger cannot read seller inquiry notification', inquiryLeak.data?.length === 0, detail(inquiryLeak.error))

    const reply = await seller.c.rpc('send_inquiry_reply', {
      p_inquiry_id: inquiry.data.id,
      p_message: 'Yes, pickup is available.',
    })
    if (reply.error != null) throw new Error(`could not reply to inquiry: ${reply.error.message}`)
    await expectOneNotification('inquiry reply notifies the buyer', buyer.c, 'inquiry.reply', inquiry.data.id, 'inquiry')

    console.log('\n-- C. Order, payment, fulfillment, and review events --')
    const order = await buyer.c.rpc('create_marketplace_order', {
      p_listing_id: listing.data.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
      p_expected_unit_price: listing.data.price,
    })
    if (order.error != null || order.data == null) throw new Error(`could not create order: ${order.error?.message}`)
    const orderId = order.data.id
    const createdNotice = await expectOneNotification('order creation notifies its seller once', seller.c, 'order.created', orderId, 'seller_order')
    check('order notification has a stable deduplication key', createdNotice?.event_key === `order.created:${orderId}`, detail(createdNotice))

    const confirm = await seller.c.rpc('confirm_marketplace_order', { p_order_id: orderId })
    if (confirm.error != null) throw new Error(`could not confirm order: ${confirm.error.message}`)
    await expectOneNotification('order confirmation notifies the buyer once', buyer.c, 'order.confirmed', orderId, 'buyer_order')
    const duplicateConfirm = await seller.c.rpc('confirm_marketplace_order', { p_order_id: orderId })
    check('duplicate confirmation is rejected', duplicateConfirm.error != null)
    const confirmedRows = await notification(buyer.c, 'order.confirmed', orderId)
    check('failed duplicate transition cannot duplicate its notification', confirmedRows.data?.length === 1, detail(confirmedRows.error ?? confirmedRows.data))

    const payment = await buyer.c.rpc('submit_payment', {
      p_order_id: orderId,
      p_payment_method: 'cash_on_pickup',
    })
    if (payment.error != null || payment.data == null) throw new Error(`could not submit payment: ${payment.error?.message}`)
    await expectOneNotification('cash payment selection notifies the seller', seller.c, 'payment.cash_selected', orderId, 'seller_order')

    const preparing = await seller.c.rpc('start_order_preparation', { p_order_id: orderId })
    if (preparing.error != null) throw new Error(`could not prepare order: ${preparing.error.message}`)
    await expectOneNotification('preparing milestone notifies the buyer', buyer.c, 'order.preparing', orderId, 'buyer_order')

    const ready = await seller.c.rpc('mark_order_ready_for_pickup', { p_order_id: orderId })
    if (ready.error != null) throw new Error(`could not mark pickup ready: ${ready.error.message}`)
    await expectOneNotification('ready-for-pickup milestone notifies the buyer', buyer.c, 'order.ready_for_pickup', orderId, 'buyer_order')

    const paid = await seller.c.rpc('mark_cash_received', { p_payment_id: payment.data.id })
    if (paid.error != null) throw new Error(`could not mark cash received: ${paid.error.message}`)
    await expectOneNotification('cash receipt notifies the buyer', buyer.c, 'payment.received', orderId, 'buyer_order')

    const completed = await buyer.c.rpc('confirm_order_received', { p_order_id: orderId })
    if (completed.error != null) throw new Error(`could not complete order: ${completed.error.message}`)
    await expectOneNotification('order completion notifies the seller', seller.c, 'order.completed', orderId, 'seller_order')

    const orderItem = await buyer.c.from('order_items').select('id').eq('order_id', orderId).limit(1).single()
    if (orderItem.error != null || orderItem.data == null) throw new Error(`could not load order item: ${orderItem.error?.message}`)
    const review = await buyer.c.rpc('submit_review', {
      p_order_item_id: orderItem.data.id,
      p_rating: 5,
      p_seller_rating: 5,
      p_comment: `Phase 12 verified review ${runId}`,
    })
    if (review.error != null || review.data == null) throw new Error(`could not submit review: ${review.error?.message}`)
    await expectOneNotification('verified review notifies the reviewed seller', seller.c, 'review.received', review.data.id, 'seller_reviews')

    console.log('\n-- C2. Order cancellation/rejection and manual delivery events --')
    const buyerCancelledOrder = await buyer.c.rpc('create_marketplace_order', {
      p_listing_id: listing.data.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
      p_expected_unit_price: listing.data.price,
    })
    if (buyerCancelledOrder.error != null || buyerCancelledOrder.data == null) {
      throw new Error(`could not create buyer-cancelled order: ${buyerCancelledOrder.error?.message}`)
    }
    const buyerCancel = await buyer.c.rpc('cancel_marketplace_order', {
      p_order_id: buyerCancelledOrder.data.id,
    })
    if (buyerCancel.error != null) throw new Error(`could not cancel buyer order: ${buyerCancel.error.message}`)
    await expectOneNotification(
      'buyer cancellation notifies the owning seller',
      seller.c,
      'order.cancelled',
      buyerCancelledOrder.data.id,
      'seller_order',
    )
    const duplicateCancel = await buyer.c.rpc('cancel_marketplace_order', {
      p_order_id: buyerCancelledOrder.data.id,
    })
    check('duplicate cancellation is rejected', duplicateCancel.error != null)
    await expectNotificationCount(
      'failed cancellation emits no duplicate notification',
      seller.c,
      'order.cancelled',
      buyerCancelledOrder.data.id,
      1,
      'seller_order',
    )
    const deleteBuyerCancelled = await buyer.c.rpc('delete_my_cancelled_order', {
      p_order_id: buyerCancelledOrder.data.id,
    })
    check('buyer-cancelled verification order is deleted', deleteBuyerCancelled.error == null, detail(deleteBuyerCancelled.error))

    const sellerRejectedOrder = await buyer.c.rpc('create_marketplace_order', {
      p_listing_id: listing.data.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
      p_expected_unit_price: listing.data.price,
    })
    if (sellerRejectedOrder.error != null || sellerRejectedOrder.data == null) {
      throw new Error(`could not create seller-rejected order: ${sellerRejectedOrder.error?.message}`)
    }
    const sellerReject = await seller.c.rpc('cancel_marketplace_order', {
      p_order_id: sellerRejectedOrder.data.id,
    })
    if (sellerReject.error != null) throw new Error(`could not reject seller order: ${sellerReject.error.message}`)
    await expectOneNotification(
      'seller rejection notifies the buyer',
      buyer.c,
      'order.rejected',
      sellerRejectedOrder.data.id,
      'buyer_order',
    )
    const deleteSellerRejected = await buyer.c.rpc('delete_my_cancelled_order', {
      p_order_id: sellerRejectedOrder.data.id,
    })
    check('seller-rejected verification order is deleted', deleteSellerRejected.error == null, detail(deleteSellerRejected.error))

    const manualOrder = await buyer.c.rpc('create_marketplace_order', {
      p_listing_id: listing.data.id,
      p_quantity: 1,
      p_fulfillment_type: 'delivery',
      p_expected_unit_price: listing.data.price,
    })
    if (manualOrder.error != null || manualOrder.data == null) {
      throw new Error(`could not create manual delivery order: ${manualOrder.error?.message}`)
    }
    const confirmManual = await seller.c.rpc('confirm_marketplace_order', { p_order_id: manualOrder.data.id })
    if (confirmManual.error != null) throw new Error(`could not confirm manual delivery order: ${confirmManual.error.message}`)

    const manualProofPath = `${buyer.user.id}/${manualOrder.data.id}/proof.png`
    const manualPayment = await buyer.c.rpc('submit_payment', {
      p_order_id: manualOrder.data.id,
      p_payment_method: 'manual_transfer',
      p_proof_path: manualProofPath,
      p_reference: `P12-SUBMIT-${runId}`,
      ...deliverySnapshot,
    })
    if (manualPayment.error != null || manualPayment.data == null) {
      throw new Error(`could not submit manual payment: ${manualPayment.error?.message}`)
    }
    await expectOneNotification(
      'manual payment submission notifies the seller',
      seller.c,
      'payment.submitted',
      manualOrder.data.id,
      'seller_order',
    )

    const rejectManual = await seller.c.rpc('review_payment', {
      p_payment_id: manualPayment.data.id,
      p_decision: 'reject',
      p_rejection_reason: 'Please upload a clearer proof.',
    })
    if (rejectManual.error != null) throw new Error(`could not reject manual payment: ${rejectManual.error.message}`)
    await expectOneNotification(
      'manual payment rejection notifies the buyer',
      buyer.c,
      'payment.rejected',
      manualOrder.data.id,
      'buyer_order',
    )

    const resubmitManual = await buyer.c.rpc('submit_payment', {
      p_order_id: manualOrder.data.id,
      p_payment_method: 'manual_transfer',
      p_proof_path: manualProofPath,
      p_reference: `P12-RESUBMIT-${runId}`,
      ...deliverySnapshot,
    })
    if (resubmitManual.error != null || resubmitManual.data == null) {
      throw new Error(`could not resubmit manual payment: ${resubmitManual.error?.message}`)
    }
    await expectNotificationCount(
      'manual payment resubmission emits a second distinct seller notification',
      seller.c,
      'payment.submitted',
      manualOrder.data.id,
      2,
      'seller_order',
    )

    const approveManual = await seller.c.rpc('review_payment', {
      p_payment_id: resubmitManual.data.id,
      p_decision: 'approve',
    })
    if (approveManual.error != null) throw new Error(`could not approve manual payment: ${approveManual.error.message}`)
    await expectOneNotification(
      'manual payment approval notifies the buyer',
      buyer.c,
      'payment.approved',
      manualOrder.data.id,
      'buyer_order',
    )

    const prepareManual = await seller.c.rpc('start_order_preparation', { p_order_id: manualOrder.data.id })
    if (prepareManual.error != null) throw new Error(`could not prepare manual delivery order: ${prepareManual.error.message}`)
    const invalidShip = await seller.c.rpc('mark_order_shipped', {
      p_order_id: manualOrder.data.id,
      p_courier: '',
      p_tracking_number: '',
    })
    check('shipping without tracking is rejected', invalidShip.error != null)
    await expectNotificationCount(
      'failed shipping transition emits no notification',
      buyer.c,
      'order.shipped',
      manualOrder.data.id,
      0,
      'buyer_order',
    )
    const shipManual = await seller.c.rpc('mark_order_shipped', {
      p_order_id: manualOrder.data.id,
      p_courier: 'J&T Express',
      p_tracking_number: `P12-${runId}`,
    })
    if (shipManual.error != null) throw new Error(`could not ship manual delivery order: ${shipManual.error.message}`)
    await expectOneNotification(
      'delivery shipment notifies the buyer',
      buyer.c,
      'order.shipped',
      manualOrder.data.id,
      'buyer_order',
    )
    const completeManual = await buyer.c.rpc('confirm_order_received', { p_order_id: manualOrder.data.id })
    if (completeManual.error != null) throw new Error(`could not complete manual delivery order: ${completeManual.error.message}`)

    console.log('\n-- D. Reports, disputes, messages, and refunds --')
    const report = await buyer.c.rpc('submit_listing_report', {
      p_listing_id: listing.data.id,
      p_reason: 'other',
      p_description: `Phase 12 report privacy check ${runId}`,
    })
    if (report.error != null || report.data == null) throw new Error(`could not submit report: ${report.error?.message}`)
    const sellerReportNotice = await notification(seller.c, 'report.created', report.data.id)
    check('reported seller receives no report notification or report id', sellerReportNotice.data?.length === 0, detail(sellerReportNotice.error))
    if (admin != null) {
      const adminProfile = await admin.c.from('profiles').select('role, account_status').eq('id', admin.user.id).single()
      check('configured admin is active', adminProfile.data?.role === 'admin' && adminProfile.data?.account_status === 'active', detail(adminProfile.error ?? adminProfile.data))
      await expectOneNotification('listing reports notify an authorized admin', admin.c, 'report.created', report.data.id, 'listing_report')
    } else {
      skip('listing report positive admin notification', 'PHASE12_TEST_ADMIN_* is not configured')
    }

    const dispute = await buyer.c.rpc('open_order_dispute', {
      p_order_id: orderId,
      p_reason: 'other',
      p_description: `Phase 12 dispute ${runId}`,
    })
    if (dispute.error != null || dispute.data == null) throw new Error(`could not open dispute: ${dispute.error?.message}`)
    await expectOneNotification('dispute creation notifies the seller', seller.c, 'dispute.opened', dispute.data.id, 'seller_dispute')

    const message = await seller.c.rpc('send_dispute_message', {
      p_dispute_id: dispute.data.id,
      p_message: 'I am reviewing this request.',
    })
    if (message.error != null) throw new Error(`could not send dispute message: ${message.error.message}`)
    await expectOneNotification('dispute message notifies only the counterparty', buyer.c, 'dispute.message', dispute.data.id, 'buyer_dispute')

    const refund = await buyer.c.rpc('request_refund', {
      p_dispute_id: dispute.data.id,
      p_requested_amount: payment.data.amount,
      p_reason: 'Refund requested during Phase 12 notification verification.',
    })
    if (refund.error != null || refund.data == null) throw new Error(`could not request refund: ${refund.error?.message}`)
    await expectOneNotification('refund request notifies the seller', seller.c, 'dispute.refund_requested', dispute.data.id, 'seller_dispute')

    const approved = await seller.c.rpc('review_refund', {
      p_refund_id: refund.data.id,
      p_decision: 'approve',
    })
    if (approved.error != null) throw new Error(`could not approve refund: ${approved.error.message}`)
    await expectOneNotification('refund approval notifies the buyer', buyer.c, 'dispute.refund_approved', dispute.data.id, 'buyer_dispute')

    const refunded = await seller.c.rpc('complete_refund', {
      p_refund_id: refund.data.id,
      p_method: 'cash_return',
      p_reference: `P12-${runId}`,
      p_notes: 'Completed for hosted notification verification.',
    })
    if (refunded.error != null) throw new Error(`could not complete refund: ${refunded.error.message}`)
    await expectOneNotification('refund completion notifies the buyer once', buyer.c, 'dispute.refund_completed', dispute.data.id, 'buyer_dispute')

    const rejectedDispute = await buyer.c.rpc('open_order_dispute', {
      p_order_id: manualOrder.data.id,
      p_reason: 'other',
      p_description: `Phase 12 rejected refund ${runId}`,
    })
    if (rejectedDispute.error != null || rejectedDispute.data == null) {
      throw new Error(`could not open rejected-refund dispute: ${rejectedDispute.error?.message}`)
    }
    const rejectedRefund = await buyer.c.rpc('request_refund', {
      p_dispute_id: rejectedDispute.data.id,
      p_requested_amount: manualPayment.data.amount,
      p_reason: 'Refund rejection notification verification.',
    })
    if (rejectedRefund.error != null || rejectedRefund.data == null) {
      throw new Error(`could not request rejected refund: ${rejectedRefund.error?.message}`)
    }
    const rejectRefund = await seller.c.rpc('review_refund', {
      p_refund_id: rejectedRefund.data.id,
      p_decision: 'reject',
      p_reason: 'Order delivery was verified.',
    })
    if (rejectRefund.error != null) throw new Error(`could not reject refund: ${rejectRefund.error.message}`)
    await expectOneNotification(
      'refund rejection notifies the buyer',
      buyer.c,
      'dispute.refund_rejected',
      rejectedDispute.data.id,
      'buyer_dispute',
    )

    console.log('\n-- E. Read mutations and cross-user isolation --')
    check('new inquiry notification starts unread', inquiryNotice?.is_read === false, detail(inquiryNotice))
    const crossRead = await stranger.c.rpc('mark_notification_read', {
      p_notification_id: inquiryNotice.id,
    })
    check('cross-user mark-one is a non-disclosing no-op', crossRead.error == null && crossRead.data === false, detail(crossRead.error ?? crossRead.data))
    const ownRead = await seller.c.rpc('mark_notification_read', {
      p_notification_id: inquiryNotice.id,
    })
    check('recipient can mark one notification read', ownRead.error == null && ownRead.data === true, detail(ownRead.error ?? ownRead.data))
    const readBack = await seller.c.from('notifications').select('is_read').eq('id', inquiryNotice.id).single()
    check('mark-one persists', readBack.data?.is_read === true, detail(readBack.error ?? readBack.data))
    await expectDenied(
      'direct is_read update remains revoked',
      seller.c.from('notifications').update({ is_read: false }).eq('id', inquiryNotice.id),
    )
    await expectDenied(
      'notification title and recipient cannot be mutated directly',
      seller.c.from('notifications').update({ title: 'Forged', recipient_id: buyer.user.id }).eq('id', inquiryNotice.id),
    )

    const buyerUnreadBefore = await buyer.c
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
    const markAll = await buyer.c.rpc('mark_all_notifications_read')
    check(
      'mark-all returns exactly the caller unread count',
      markAll.error == null && markAll.data === (buyerUnreadBefore.count ?? 0),
      detail(markAll.error ?? { actual: markAll.data, expected: buyerUnreadBefore.count }),
    )
    const buyerUnreadAfter = await buyer.c
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
    check('mark-all leaves no caller unread rows', buyerUnreadAfter.error == null && buyerUnreadAfter.count === 0, detail(buyerUnreadAfter.error ?? buyerUnreadAfter.count))

    console.log('\n-- F. Multi-seller and seller-status isolation --')
    if (sellerB != null) {
      const sellerBProfile = await sellerB.c
        .from('seller_profiles')
        .select('id, seller_status')
        .eq('user_id', sellerB.user.id)
        .single()
      if (sellerBProfile.data?.seller_status === 'active') {
        const listingB = await sellerB.c
          .from('listings')
          .insert({
            seller_id: sellerBProfile.data.id,
            category_id: categoryId,
            title: `Phase 12 seller B ${runId}`,
            description: 'Second-seller notification isolation listing.',
            listing_condition: 'used',
            price: 1750,
            quantity: 2,
            listing_status: 'active',
            pickup_available: true,
            delivery_available: false,
          })
          .select('id, price')
          .single()
        if (listingB.error != null || listingB.data == null) throw new Error(`could not create seller B listing: ${listingB.error?.message}`)
        listingIds.push(listingB.data.id)
        const orderB = await buyer.c.rpc('create_marketplace_order', {
          p_listing_id: listingB.data.id,
          p_quantity: 1,
          p_fulfillment_type: 'pickup',
          p_expected_unit_price: listingB.data.price,
        })
        if (orderB.error != null || orderB.data == null) throw new Error(`could not create seller B order: ${orderB.error?.message}`)
        await expectOneNotification('seller B receives only its order event', sellerB.c, 'order.created', orderB.data.id, 'seller_order')
        const sellerALeak = await notification(seller.c, 'order.created', orderB.data.id)
        check('seller A cannot read seller B order notification', sellerALeak.data?.length === 0, detail(sellerALeak.error))
        await buyer.c.rpc('cancel_marketplace_order', { p_order_id: orderB.data.id })
        await buyer.c.rpc('delete_my_cancelled_order', { p_order_id: orderB.data.id })
      } else {
        skip('multi-seller notification isolation', 'configured seller B is not active')
      }
    } else {
      skip('multi-seller notification isolation', 'PHASE8_TEST_SELLER_B_* is not configured')
    }

    if (admin != null) {
      const rpcToSuspend = sellerOriginalStatus === 'active' ? 'admin_suspend_seller' : null
      const rpcToRestore = sellerOriginalStatus === 'active' ? 'admin_reactivate_seller' : 'admin_approve_seller'
      if (rpcToSuspend != null) {
        const statusChange = await admin.c.rpc(rpcToSuspend, {
          p_seller_id: sellerId,
          p_reason: 'Phase 12 notification verification',
        })
        check('active admin can drive trusted seller status transition', statusChange.error == null, detail(statusChange.error))
        const statusNotices = await seller.c
          .from('notifications')
          .select('*')
          .eq('event_name', 'seller.status_changed')
          .eq('related_entity_id', sellerId)
          .order('created_at', { ascending: false })
          .limit(1)
        check('seller status transition notifies only that seller', statusNotices.data?.length === 1 && statusNotices.data[0].related_entity_type === 'seller_status', detail(statusNotices.error ?? statusNotices.data))
        await admin.c.rpc(rpcToRestore, {
          p_seller_id: sellerId,
          p_reason: 'Phase 12 notification verification cleanup',
        })
      } else {
        skip('seller status notification', 'seller is not active; cannot safely test transition')
      }
    } else {
      skip('seller status notification', 'PHASE12_TEST_ADMIN_* is not configured')
    }

    if (skipped > 0) console.log(`\nExplicit skips: ${skipped}`)
    console.log(failures === 0 ? '== Result: ALL PASS ==' : `== Result: FAIL (${failures} failures) ==`)
  } finally {
    if (admin != null && sellerId && sellerOriginalStatus) {
      for (const restoreRpc of ['admin_reactivate_seller', 'admin_approve_seller']) {
        try {
          await admin.c.rpc(restoreRpc, {
            p_seller_id: sellerId,
            p_reason: 'Phase 12 notification verification cleanup',
          })
          break
        } catch {
          // Try next restore path.
        }
      }
    }
    for (const listingId of listingIds) {
      try {
        if (seller != null) {
          await seller.c.from('listings').update({ listing_status: 'archived' }).eq('id', listingId)
        }
        if (sellerB != null) {
          await sellerB.c.from('listings').update({ listing_status: 'archived' }).eq('id', listingId)
        }
      } catch {
        // Best effort through the normal seller update path.
      }
    }
    await Promise.allSettled([
      seller?.c.auth.signOut(),
      buyer?.c.auth.signOut(),
      stranger?.c.auth.signOut(),
      sellerB?.c.auth.signOut(),
      admin?.c.auth.signOut(),
    ].filter(Boolean))
  }

  if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
