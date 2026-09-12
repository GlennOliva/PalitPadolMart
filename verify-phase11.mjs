import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Phase 11 hosted verification uses only browser-safe anon-key clients and
// reusable confirmed accounts. It never creates Auth users or uses service-role.
const env = { ...process.env }
try {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (match && env[match[1]] === undefined) {
      env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch {
  // .env.local is optional when variables are exported by the shell.
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
  console.error('SKIPPED: hosted Phase 11 verification requires confirmed reusable test accounts.')
  console.error('')
  console.error('Missing (reuses the confirmed Phase 7 accounts):')
  for (const name of missing) console.error(`  ${name}`)
  process.exit(2)
}

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const EVIDENCE_BUCKET = 'dispute-evidence'
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

let failures = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

function toText(value) {
  return JSON.stringify(value)
}

function rpcCode(result) {
  if (result.error == null) return null
  const message = String(result.error.message ?? '')
  const code = message.split(':')[0].trim()
  return code === '' ? 'RPC_ERROR' : code
}

function expectRpcCode(name, result, expected) {
  const actual = rpcCode(result)
  check(name, actual === expected, actual === null ? 'unexpectedly succeeded' : `got ${actual}`)
}

function expectDenied(name, result) {
  check(name, result.error != null, result.error == null ? 'unexpectedly succeeded' : result.error.message)
}

async function signIn(role, email, password) {
  const c = client()
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error != null || data.user == null) {
    throw new Error(`could not sign in ${role} (${email}): ${error?.message ?? 'no user'}`)
  }
  return { c, user: data.user }
}

async function runRpc(c, name, params) {
  const result = await c.rpc(name, params)
  return result.error == null
    ? { data: result.data, error: null }
    : { data: null, error: result.error }
}

async function cancelAndDelete(buyerClient, orderId) {
  if (buyerClient == null || orderId == null) return
  try {
    await buyerClient.rpc('cancel_marketplace_order', { p_order_id: orderId })
    await buyerClient.rpc('delete_my_cancelled_order', { p_order_id: orderId })
  } catch {
    // Best effort for run-scoped pending test rows.
  }
}

async function signOutAll(clients) {
  await Promise.allSettled(
    clients.filter(Boolean).map((c) => c.auth.signOut().catch(() => null)),
  )
}

async function main() {
  console.log('== Phase 11 hosted verification (reports, disputes, evidence, refunds) ==')
  console.log(`Run id: ${runId}`)

  let seller = null
  let buyer = null
  let stranger = null
  const anon = client()
  let sellerId = null
  let category = null
  const listings = []
  const retainedListings = new Set()
  const pendingOrders = []

  async function createListing(title, quantity = 1) {
    const { data, error } = await seller.c
      .from('listings')
      .insert({
        seller_id: sellerId,
        category_id: category.id,
        title,
        description: 'Isolated Phase 11 hosted verification listing.',
        listing_condition: 'like_new',
        price: 1350,
        quantity,
        listing_status: 'active',
        pickup_available: true,
        delivery_available: false,
      })
      .select('id, seller_id, title, price, quantity, listing_status')
      .single()
    if (error != null) throw new Error(`could not create listing: ${error.message}`)
    listings.push(data.id)
    return data
  }

  async function createOrder(listingId) {
    const result = await runRpc(buyer.c, 'create_marketplace_order', {
      p_listing_id: listingId,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    })
    if (result.error != null) throw new Error(`could not create order: ${result.error.message}`)
    return result.data
  }

  async function confirmOrder(orderId) {
    const result = await runRpc(seller.c, 'confirm_marketplace_order', { p_order_id: orderId })
    if (result.error != null) throw new Error(`could not confirm order: ${result.error.message}`)
    return result.data
  }

  try {
    seller = await signIn(
      'seller',
      env.PHASE7_TEST_SELLER_EMAIL,
      env.PHASE7_TEST_SELLER_PASSWORD,
    )
    buyer = await signIn(
      'buyer',
      env.PHASE7_TEST_BUYER_EMAIL,
      env.PHASE7_TEST_BUYER_PASSWORD,
    )
    stranger = await signIn(
      'stranger',
      env.PHASE7_TEST_STRANGER_EMAIL,
      env.PHASE7_TEST_STRANGER_PASSWORD,
    )
    check('seller signs in', seller.user != null)
    check('buyer signs in', buyer.user != null)
    check('stranger signs in', stranger.user != null)

    const probe = await runRpc(buyer.c, 'open_order_dispute', {
      p_order_id: '00000000-0000-0000-0000-000000000000',
      p_reason: 'other',
      p_description: 'Hosted migration probe.',
    })
    if (probe.error != null && /PGRST202|could not find the function/i.test(String(probe.error.message))) {
      console.error('BLOCKED: Phase 11 RPCs are not present on the hosted project.')
      process.exitCode = 3
      return
    }
    expectRpcCode('Phase 11 dispute RPC is live', probe, 'ORDER_NOT_FOUND')

    const { data: profiles } = await seller.c
      .from('seller_profiles')
      .select('id, seller_status')
      .eq('user_id', seller.user.id)
    sellerId = profiles?.[0]?.id ?? null
    check('seller profile exists and is active', sellerId != null && profiles[0].seller_status === 'active', toText(profiles))
    if (sellerId == null) throw new Error('active seller profile is required')

    const categoryResult = await buyer.c.from('categories').select('id').limit(1).single()
    category = categoryResult.data
    if (category == null) throw new Error('at least one category is required')

    const primaryListing = await createListing(`Phase 11 primary ${runId}`, 4)
    const pendingListing = await createListing(`Phase 11 pending ${runId}`, 1)

    console.log('\n-- A. Listing reports and report privacy --')
    const report = await runRpc(buyer.c, 'submit_listing_report', {
      p_listing_id: primaryListing.id,
      p_reason: 'scam_or_fraud',
      p_description: '  Requests payment outside the marketplace.  ',
    })
    check(
      'buyer submits report with server-derived reporter and seller',
      report.error == null &&
        report.data?.reporter_id === buyer.user.id &&
        report.data?.seller_id === sellerId &&
        report.data?.status === 'pending' &&
        report.data?.description === 'Requests payment outside the marketplace.',
      toText(report.error ?? report.data),
    )
    const reportId = report.data?.id

    expectRpcCode(
      'duplicate active report is rejected',
      await runRpc(buyer.c, 'submit_listing_report', {
        p_listing_id: primaryListing.id,
        p_reason: 'other',
        p_description: null,
      }),
      'LISTING_REPORT_ALREADY_EXISTS',
    )
    expectRpcCode(
      'seller cannot report own listing',
      await runRpc(seller.c, 'submit_listing_report', {
        p_listing_id: primaryListing.id,
        p_reason: 'other',
        p_description: null,
      }),
      'SELF_REPORT_NOT_ALLOWED',
    )
    expectRpcCode(
      'unsupported report reason is rejected',
      await runRpc(stranger.c, 'submit_listing_report', {
        p_listing_id: primaryListing.id,
        p_reason: 'forged_reason',
        p_description: null,
      }),
      'INVALID_REPORT_REASON',
    )
    expectDenied(
      'anonymous caller cannot execute report RPC',
      await anon.rpc('submit_listing_report', {
        p_listing_id: primaryListing.id,
        p_reason: 'other',
        p_description: null,
      }),
    )

    const buyerReports = await buyer.c.from('listing_reports').select('*').eq('id', reportId)
    const sellerReports = await seller.c.from('listing_reports').select('*').eq('id', reportId)
    const strangerReports = await stranger.c.from('listing_reports').select('*').eq('id', reportId)
    check('reporter can read own report', buyerReports.data?.length === 1, buyerReports.error?.message)
    check('reported seller cannot read private report', sellerReports.data?.length === 0, sellerReports.error?.message)
    check('stranger cannot read private report', strangerReports.data?.length === 0, strangerReports.error?.message)
    expectDenied(
      'direct listing report insert is revoked',
      await buyer.c.from('listing_reports').insert({
        listing_id: primaryListing.id,
        reporter_id: buyer.user.id,
        seller_id: sellerId,
        reason: 'other',
        status: 'resolved',
      }),
    )
    expectDenied(
      'direct listing report status update is revoked',
      await buyer.c.from('listing_reports').update({ status: 'resolved' }).eq('id', reportId),
    )
    expectRpcCode(
      'non-admin cannot use report moderation RPC',
      await runRpc(buyer.c, 'admin_update_listing_report', {
        p_report_id: reportId,
        p_status: 'resolved',
        p_resolution: 'forged',
      }),
      'FORBIDDEN',
    )

    console.log('\n-- B. Order setup and dispute creation --')
    const pendingOrder = await createOrder(pendingListing.id)
    pendingOrders.push(pendingOrder.id)
    expectRpcCode(
      'pending order cannot be disputed',
      await runRpc(buyer.c, 'open_order_dispute', {
        p_order_id: pendingOrder.id,
        p_reason: 'other',
        p_description: 'Still awaiting confirmation.',
      }),
      'ORDER_NOT_DISPUTABLE',
    )

    const paidOrder = await createOrder(primaryListing.id)
    retainedListings.add(primaryListing.id)
    await confirmOrder(paidOrder.id)
    const payment = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: paidOrder.id,
      p_payment_method: 'cash_on_pickup',
    })
    check('buyer selects cash on pickup', payment.data?.status === 'pending', toText(payment.error ?? payment.data))
    await runRpc(seller.c, 'start_order_preparation', { p_order_id: paidOrder.id })
    const ready = await runRpc(seller.c, 'mark_order_ready_for_pickup', { p_order_id: paidOrder.id })
    check('order reaches ready-for-pickup', ready.data?.status === 'ready_for_pickup', toText(ready.error ?? ready.data))
    const paid = await runRpc(seller.c, 'mark_cash_received', { p_payment_id: payment.data?.id })
    check('seller records paid cash', paid.data?.status === 'paid', toText(paid.error ?? paid.data))

    expectRpcCode(
      'seller cannot open buyer dispute',
      await runRpc(seller.c, 'open_order_dispute', {
        p_order_id: paidOrder.id,
        p_reason: 'other',
        p_description: 'Forged seller opening.',
      }),
      'FORBIDDEN',
    )
    expectRpcCode(
      'stranger cannot open another buyer order dispute',
      await runRpc(stranger.c, 'open_order_dispute', {
        p_order_id: paidOrder.id,
        p_reason: 'other',
        p_description: 'Forged stranger opening.',
      }),
      'FORBIDDEN',
    )
    const dispute = await runRpc(buyer.c, 'open_order_dispute', {
      p_order_id: paidOrder.id,
      p_reason: 'item_not_received',
      p_description: '  Pickup handoff could not be completed.  ',
    })
    check(
      'buyer opens seller-specific dispute with derived identities',
      dispute.error == null &&
        dispute.data?.buyer_id === buyer.user.id &&
        dispute.data?.seller_id === sellerId &&
        dispute.data?.opened_by === buyer.user.id &&
        dispute.data?.order_id === paidOrder.id &&
        dispute.data?.status === 'open',
      toText(dispute.error ?? dispute.data),
    )
    const disputeId = dispute.data?.id
    expectRpcCode(
      'second active dispute for the order is rejected',
      await runRpc(buyer.c, 'open_order_dispute', {
        p_order_id: paidOrder.id,
        p_reason: 'payment_issue',
        p_description: 'Duplicate attempt.',
      }),
      'ACTIVE_DISPUTE_EXISTS',
    )
    const orderAfterOpen = await buyer.c.from('orders').select('status, total').eq('id', paidOrder.id).single()
    check(
      'opening a dispute does not rewrite order status or total',
      orderAfterOpen.data?.status === 'ready_for_pickup' && orderAfterOpen.data?.total === 1350,
      toText(orderAfterOpen.data),
    )

    const buyerDisputeRows = await buyer.c.from('disputes').select('*').eq('id', disputeId)
    const sellerDisputeRows = await seller.c.from('disputes').select('*').eq('id', disputeId)
    const strangerDisputeRows = await stranger.c.from('disputes').select('*').eq('id', disputeId)
    check('buyer can read dispute', buyerDisputeRows.data?.length === 1, buyerDisputeRows.error?.message)
    check('owning seller can read dispute', sellerDisputeRows.data?.length === 1, sellerDisputeRows.error?.message)
    check('stranger cannot read dispute', strangerDisputeRows.data?.length === 0, strangerDisputeRows.error?.message)
    expectDenied(
      'direct dispute status update is revoked',
      await buyer.c.from('disputes').update({ status: 'resolved', resolution: 'forged' }).eq('id', disputeId),
    )
    expectDenied(
      'direct dispute delete is revoked',
      await seller.c.from('disputes').delete().eq('id', disputeId),
    )
    expectRpcCode(
      'non-admin cannot use admin dispute resolution',
      await runRpc(seller.c, 'admin_resolve_dispute', {
        p_dispute_id: disputeId,
        p_resolution: 'forged',
      }),
      'FORBIDDEN',
    )

    console.log('\n-- C. Participant messages and private evidence --')
    const buyerMessage = await runRpc(buyer.c, 'send_dispute_message', {
      p_dispute_id: disputeId,
      p_message: '  Please verify the pickup handoff.  ',
    })
    const sellerMessage = await runRpc(seller.c, 'send_dispute_message', {
      p_dispute_id: disputeId,
      p_message: 'I am checking the transaction now.',
    })
    check(
      'buyer message sender is auth-derived and text is trimmed',
      buyerMessage.data?.sender_id === buyer.user.id && buyerMessage.data?.message === 'Please verify the pickup handoff.',
      toText(buyerMessage.error ?? buyerMessage.data),
    )
    check('seller can reply as the owning seller user', sellerMessage.data?.sender_id === seller.user.id, toText(sellerMessage.error ?? sellerMessage.data))
    expectRpcCode(
      'stranger cannot send a dispute message',
      await runRpc(stranger.c, 'send_dispute_message', {
        p_dispute_id: disputeId,
        p_message: 'Forged participant.',
      }),
      'FORBIDDEN',
    )
    expectRpcCode(
      'blank dispute message is rejected',
      await runRpc(buyer.c, 'send_dispute_message', { p_dispute_id: disputeId, p_message: '   ' }),
      'INVALID_MESSAGE',
    )
    const strangerMessages = await stranger.c.from('dispute_messages').select('*').eq('dispute_id', disputeId)
    check('stranger cannot read participant messages', strangerMessages.data?.length === 0, strangerMessages.error?.message)
    expectDenied(
      'direct dispute message insert is revoked',
      await buyer.c.from('dispute_messages').insert({
        dispute_id: disputeId,
        sender_id: stranger.user.id,
        message: 'forged sender',
      }),
    )

    const evidencePath = `${buyer.user.id}/${disputeId}/${randomUUID()}.png`
    const evidenceUpload = await buyer.c.storage.from(EVIDENCE_BUCKET).upload(evidencePath, ONE_PIXEL_PNG, {
      contentType: 'image/png',
      upsert: false,
    })
    check('buyer uploads evidence in exact private path', evidenceUpload.error == null, evidenceUpload.error?.message)
    const badPath = `${stranger.user.id}/${disputeId}/${randomUUID()}.png`
    expectDenied(
      'participant cannot spoof evidence owner path',
      await buyer.c.storage.from(EVIDENCE_BUCKET).upload(badPath, ONE_PIXEL_PNG, {
        contentType: 'image/png',
        upsert: false,
      }),
    )
    expectRpcCode(
      'register rejects an actor-spoofed path',
      await runRpc(buyer.c, 'register_dispute_evidence', {
        p_dispute_id: disputeId,
        p_storage_path: badPath,
        p_original_filename: 'proof.png',
        p_mime_type: 'image/png',
        p_size_bytes: ONE_PIXEL_PNG.length,
      }),
      'INVALID_EVIDENCE_PATH',
    )
    const evidence = await runRpc(buyer.c, 'register_dispute_evidence', {
      p_dispute_id: disputeId,
      p_storage_path: evidencePath,
      p_original_filename: 'pickup-proof.png',
      p_mime_type: 'image/png',
      p_size_bytes: ONE_PIXEL_PNG.length,
    })
    check(
      'evidence registration derives uploader and preserves trusted metadata',
      evidence.error == null &&
        evidence.data?.uploader_id === buyer.user.id &&
        evidence.data?.storage_path === evidencePath,
      toText(evidence.error ?? evidence.data),
    )
    expectRpcCode(
      'evidence object cannot be registered twice',
      await runRpc(buyer.c, 'register_dispute_evidence', {
        p_dispute_id: disputeId,
        p_storage_path: evidencePath,
        p_original_filename: 'pickup-proof.png',
        p_mime_type: 'image/png',
        p_size_bytes: ONE_PIXEL_PNG.length,
      }),
      'EVIDENCE_ALREADY_REGISTERED',
    )
    const sellerDownload = await seller.c.storage.from(EVIDENCE_BUCKET).download(evidencePath)
    const strangerDownload = await stranger.c.storage.from(EVIDENCE_BUCKET).download(evidencePath)
    const anonDownload = await anon.storage.from(EVIDENCE_BUCKET).download(evidencePath)
    check('owning seller can read buyer evidence', sellerDownload.error == null, sellerDownload.error?.message)
    check('stranger cannot read evidence object', strangerDownload.error != null, strangerDownload.error?.message)
    check('anonymous user cannot read evidence object', anonDownload.error != null, anonDownload.error?.message)
    await buyer.c.storage.from(EVIDENCE_BUCKET).remove([evidencePath])
    const registeredStillExists = await seller.c.storage.from(EVIDENCE_BUCKET).download(evidencePath)
    check('registered evidence object is immutable', registeredStillExists.error == null, registeredStillExists.error?.message)
    const strangerEvidence = await stranger.c.from('dispute_evidence').select('*').eq('dispute_id', disputeId)
    check('stranger cannot read evidence metadata', strangerEvidence.data?.length === 0, strangerEvidence.error?.message)
    expectDenied(
      'direct evidence metadata insert is revoked',
      await buyer.c.from('dispute_evidence').insert({
        dispute_id: disputeId,
        uploader_id: buyer.user.id,
        storage_path: evidencePath,
      }),
    )

    console.log('\n-- D. Full-order refund state machine --')
    expectRpcCode(
      'partial refund is rejected',
      await runRpc(buyer.c, 'request_refund', {
        p_dispute_id: disputeId,
        p_requested_amount: 1000,
        p_reason: 'Partial amount attack.',
      }),
      'REFUND_NOT_ALLOWED',
    )
    expectRpcCode(
      'refund above paid amount is rejected',
      await runRpc(buyer.c, 'request_refund', {
        p_dispute_id: disputeId,
        p_requested_amount: 1400,
        p_reason: 'Excess amount attack.',
      }),
      'REFUND_EXCEEDS_AVAILABLE',
    )
    expectRpcCode(
      'seller cannot request the buyer refund',
      await runRpc(seller.c, 'request_refund', {
        p_dispute_id: disputeId,
        p_requested_amount: 1350,
        p_reason: 'Seller forgery.',
      }),
      'FORBIDDEN',
    )
    const refund = await runRpc(buyer.c, 'request_refund', {
      p_dispute_id: disputeId,
      p_requested_amount: 1350,
      p_reason: '  Pickup handoff failed.  ',
    })
    check(
      'full refund request derives order, payment, buyer, seller, and amount',
      refund.error == null &&
        refund.data?.dispute_id === disputeId &&
        refund.data?.order_id === paidOrder.id &&
        refund.data?.payment_id === payment.data?.id &&
        refund.data?.buyer_id === buyer.user.id &&
        refund.data?.seller_id === sellerId &&
        refund.data?.amount === 1350 &&
        refund.data?.status === 'requested',
      toText(refund.error ?? refund.data),
    )
    const refundId = refund.data?.id
    expectRpcCode(
      'buyer cannot review own refund',
      await runRpc(buyer.c, 'review_refund', {
        p_refund_id: refundId,
        p_decision: 'approve',
        p_reason: null,
      }),
      'FORBIDDEN',
    )
    expectRpcCode(
      'stranger cannot review refund',
      await runRpc(stranger.c, 'review_refund', {
        p_refund_id: refundId,
        p_decision: 'approve',
        p_reason: null,
      }),
      'FORBIDDEN',
    )
    expectRpcCode(
      'refund rejection requires a reason',
      await runRpc(seller.c, 'review_refund', {
        p_refund_id: refundId,
        p_decision: 'reject',
        p_reason: '   ',
      }),
      'REJECTION_REASON_REQUIRED',
    )
    expectRpcCode(
      'buyer cannot close a dispute with active refund',
      await runRpc(buyer.c, 'close_my_dispute', { p_dispute_id: disputeId }),
      'REFUND_STILL_ACTIVE',
    )
    const approved = await runRpc(seller.c, 'review_refund', {
      p_refund_id: refundId,
      p_decision: 'approve',
      p_reason: 'Evidence accepted.',
    })
    check('owning seller approves full refund', approved.data?.status === 'approved', toText(approved.error ?? approved.data))
    expectRpcCode(
      'approved refund cannot be reviewed twice',
      await runRpc(seller.c, 'review_refund', {
        p_refund_id: refundId,
        p_decision: 'reject',
        p_reason: 'Too late.',
      }),
      'REFUND_NOT_REVIEWABLE',
    )
    expectRpcCode(
      'buyer cannot complete refund',
      await runRpc(buyer.c, 'complete_refund', {
        p_refund_id: refundId,
        p_method: 'manual_transfer',
        p_reference: 'FORGED',
        p_notes: null,
      }),
      'FORBIDDEN',
    )
    const completed = await runRpc(seller.c, 'complete_refund', {
      p_refund_id: refundId,
      p_method: 'manual_transfer',
      p_reference: '  P11-REFUND  ',
      p_notes: '  Returned outside the marketplace.  ',
    })
    check(
      'seller records manual completion with normalized audit fields',
      completed.data?.status === 'completed' &&
        completed.data?.method === 'manual_transfer' &&
        completed.data?.reference === 'P11-REFUND' &&
        completed.data?.notes === 'Returned outside the marketplace.',
      toText(completed.error ?? completed.data),
    )

    const finalOrder = await buyer.c.from('orders').select('status, total').eq('id', paidOrder.id).single()
    const finalPayment = await buyer.c.from('payments').select('status, amount').eq('id', payment.data?.id).single()
    const finalDispute = await buyer.c.from('disputes').select('status, resolution').eq('id', disputeId).single()
    check(
      'completion changes payment to refunded without rewriting order lifecycle',
      finalPayment.data?.status === 'refunded' &&
        finalPayment.data?.amount === 1350 &&
        finalOrder.data?.status === 'ready_for_pickup' &&
        finalOrder.data?.total === 1350,
      toText({ order: finalOrder.data, payment: finalPayment.data }),
    )
    check(
      'refund completion resolves dispute with server resolution',
      finalDispute.data?.status === 'resolved' && /Refund completed manually/.test(finalDispute.data?.resolution ?? ''),
      toText(finalDispute.data),
    )
    const refundEvents = await buyer.c.from('refund_events').select('event_type, from_status, to_status, actor_id').eq('refund_id', refundId).order('created_at')
    check(
      'refund audit history records requested, approved, completed actors and states',
      toText(refundEvents.data?.map((row) => row.event_type)) === toText(['requested', 'approved', 'completed']) &&
        refundEvents.data?.[0]?.actor_id === buyer.user.id &&
        refundEvents.data?.[1]?.actor_id === seller.user.id &&
        refundEvents.data?.[2]?.actor_id === seller.user.id,
      toText(refundEvents.data),
    )
    expectDenied(
      'direct refund update is revoked',
      await buyer.c.from('refunds').update({ status: 'requested', amount: 1 }).eq('id', refundId),
    )
    const strangerRefunds = await stranger.c.from('refunds').select('*').eq('id', refundId)
    const strangerRefundEvents = await stranger.c.from('refund_events').select('*').eq('refund_id', refundId)
    check('stranger cannot read refund', strangerRefunds.data?.length === 0, strangerRefunds.error?.message)
    check('stranger cannot read refund history', strangerRefundEvents.data?.length === 0, strangerRefundEvents.error?.message)
    expectRpcCode(
      'resolved dispute rejects new messages',
      await runRpc(buyer.c, 'send_dispute_message', { p_dispute_id: disputeId, p_message: 'Too late.' }),
      'DISPUTE_NOT_OPEN',
    )
    expectRpcCode(
      'resolved dispute rejects another refund',
      await runRpc(buyer.c, 'request_refund', {
        p_dispute_id: disputeId,
        p_requested_amount: 1350,
        p_reason: 'Duplicate.',
      }),
      'DISPUTE_NOT_OPEN',
    )

    console.log('\n-- E. Escalation and participant close path --')
    const supportOrder = await createOrder(primaryListing.id)
    await confirmOrder(supportOrder.id)
    const supportDispute = await runRpc(buyer.c, 'open_order_dispute', {
      p_order_id: supportOrder.id,
      p_reason: 'seller_issue',
      p_description: 'Seller assistance is required.',
    })
    check('buyer opens second isolated dispute', supportDispute.data?.status === 'open', toText(supportDispute.error ?? supportDispute.data))
    const supportDisputeId = supportDispute.data?.id
    expectRpcCode(
      'stranger cannot escalate dispute',
      await runRpc(stranger.c, 'escalate_dispute', {
        p_dispute_id: supportDisputeId,
        p_reason: 'Forged.',
      }),
      'FORBIDDEN',
    )
    const escalated = await runRpc(seller.c, 'escalate_dispute', {
      p_dispute_id: supportDisputeId,
      p_reason: 'Needs platform review.',
    })
    check('either participant can escalate open dispute', escalated.data?.status === 'under_review', toText(escalated.error ?? escalated.data))
    expectRpcCode(
      'seller cannot close buyer dispute',
      await runRpc(seller.c, 'close_my_dispute', { p_dispute_id: supportDisputeId }),
      'FORBIDDEN',
    )
    const closed = await runRpc(buyer.c, 'close_my_dispute', { p_dispute_id: supportDisputeId })
    check('buyer closes active dispute without refund', closed.data?.status === 'closed', toText(closed.error ?? closed.data))
    const disputeEvents = await buyer.c.from('dispute_events').select('event_type, from_status, to_status').eq('dispute_id', supportDisputeId).order('created_at')
    check(
      'dispute audit history records open, escalation, and close transitions',
      toText(disputeEvents.data?.map((row) => row.event_type)) === toText(['opened', 'escalated', 'closed']),
      toText(disputeEvents.data),
    )
    const strangerEvents = await stranger.c.from('dispute_events').select('*').eq('dispute_id', supportDisputeId)
    check('stranger cannot read dispute history', strangerEvents.data?.length === 0, strangerEvents.error?.message)

    console.log('\n-- Cleanup --')
    await cancelAndDelete(buyer.c, pendingOrder.id)
    const pendingStillThere = await buyer.c.from('orders').select('id').eq('id', pendingOrder.id)
    check('pending negative order cleaned up', pendingStillThere.data?.length === 0, pendingStillThere.error?.message)
    await seller.c.from('listings').delete().eq('id', pendingListing.id)
  } finally {
    try {
      if (buyer != null) {
        for (const orderId of pendingOrders) await cancelAndDelete(buyer.c, orderId)
      }
    } catch {
      // Best effort.
    }
    try {
      if (seller != null) {
        for (const listingId of listings) {
          if (!retainedListings.has(listingId)) await seller.c.from('listings').delete().eq('id', listingId)
        }
      }
    } catch {
      // Best effort.
    }
    await signOutAll([seller?.c, buyer?.c, stranger?.c, anon])
  }

  console.log('')
  if (failures === 0) console.log('== Result: ALL PASS ==')
  else {
    console.error(`== Result: FAIL - ${failures} failure(s) ==`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`FAIL: Phase 11 hosted verification crashed: ${error.stack ?? error.message}`)
  process.exitCode = 1
})
