import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// PHASE 9 HOSTED VERIFICATION
// ============================================================================
// Verifies the Phase 9 payment status + fulfillment system against the hosted
// Supabase project using REUSABLE, CONFIRMED test accounts configured via
// environment variables. It NEVER creates Auth users: it only signs in with
// the provided credentials, runs the payment/fulfillment/RLS/storage
// scenarios, cleans up every row it can (through the supported production
// RPCs), and leaves the Auth accounts intact for future runs.
//
// Required credentials (local only — never commit real values):
//   PHASE7_TEST_SELLER_EMAIL / PHASE7_TEST_SELLER_PASSWORD
//   PHASE7_TEST_BUYER_EMAIL  / PHASE7_TEST_BUYER_PASSWORD
//   PHASE7_TEST_STRANGER_EMAIL / PHASE7_TEST_STRANGER_PASSWORD
//
// If any required credential is missing the script SKIPS safely — it does not
// attempt signup.
//
// Scope: Phase 9 RPCs — submit_payment, review_payment, mark_cash_received,
// start_order_preparation, mark_order_shipped, mark_order_ready_for_pickup,
// confirm_order_received, can_upload_payment_proof, payment_is_open — plus the
// RLS hardening (payments/fulfillment are RPC-managed, sellers self-serve
// payment methods, proof storage is buyer-owned), direct-attack denials,
// per-transition inventory regression, and multi-seller independence.
//
// Optional credentials (only when set; the script SKIPs those sub-sections):
//   PHASE8_TEST_BUYER_B_EMAIL / PHASE8_TEST_BUYER_B_PASSWORD   (cross-buyer)
//   PHASE8_TEST_SELLER_B_EMAIL / PHASE8_TEST_SELLER_B_PASSWORD (cross-seller
//     + multi-seller independence)
//
// Retention note: orders that pass 'confirmed' have no client-side delete path
// (the transaction record is intentionally permanent), so the happy-path
// orders end COMPLETED (or stay PREPARING for the multi-seller Seller A leg)
// and are retained, along with their listings. Only the pending negative-order
// is cancelled + deleted. This mirrors Phase 8.
// ============================================================================

// --- Local-only environment loading (process.env wins; .env.local fills gaps) ---
const env = { ...process.env }
try {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {
  // .env.local is optional when the values are already exported.
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
  console.error('SKIPPED: hosted Phase 9 verification requires confirmed reusable test accounts.')
  console.error('')
  console.error('Missing (reuses the confirmed Phase 7 accounts):')
  for (const name of missing) console.error(`  ${name}`)
  process.exit(2)
}

const sellerEmail = env.PHASE7_TEST_SELLER_EMAIL
const sellerPassword = env.PHASE7_TEST_SELLER_PASSWORD
const buyerEmail = env.PHASE7_TEST_BUYER_EMAIL
const buyerPassword = env.PHASE7_TEST_BUYER_PASSWORD
const strangerEmail = env.PHASE7_TEST_STRANGER_EMAIL
const strangerPassword = env.PHASE7_TEST_STRANGER_PASSWORD

// Optional Phase 8 accounts gate the cross-user and multi-seller sections.
const buyerBEmail = env.PHASE8_TEST_BUYER_B_EMAIL
const buyerBPassword = env.PHASE8_TEST_BUYER_B_PASSWORD
const sellerBEmail = env.PHASE8_TEST_SELLER_B_EMAIL
const sellerBPassword = env.PHASE8_TEST_SELLER_B_PASSWORD
const hasBuyerB = Boolean(buyerBEmail && buyerBPassword)
const hasSellerB = Boolean(sellerBEmail && sellerBPassword)

// Unique run id isolates every row created by this run so reruns never collide.
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const PROOF_BUCKET = 'payment-proofs'

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

let failures = 0
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function skip(name) {
  console.log(`  SKIP  ${name}`)
}

function toText(v) {
  return JSON.stringify(v)
}

function authErrorCode(message = '') {
  const m = message.toLowerCase()
  if (m.includes('rate limit') || m.includes('rate_limit') || m.includes('too many')) {
    return 'EMAIL_RATE_LIMIT'
  }
  if (m.includes('not confirmed')) return 'EMAIL_NOT_CONFIRMED'
  if (m.includes('invalid login') || m.includes('invalid_credentials')) return 'INVALID_LOGIN'
  return 'SIGN_IN_FAILED'
}

async function signIn(role, email, password) {
  const c = client()
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error != null || data.user == null) {
    const code = authErrorCode(error?.message)
    throw new Error(`${code}: could not sign in ${role} (${email}): ${error?.message ?? 'no user'}`)
  }
  return { c, user: data.user }
}

// Raised-code extraction: functions raise 'CODE: message', and PostgREST
// surfaces the whole string in error.message.
function rpcCode(res) {
  if (res.error == null) return null
  const msg = String(res.error.message ?? '')
  const code = msg.split(':')[0].trim()
  return code === '' ? 'RPC_ERROR' : code
}

function expectRpcCode(name, res, code) {
  const got = rpcCode(res)
  check(name, got === code, got === null ? 'unexpectedly succeeded' : `got ${got}`)
}

async function runRpc(c, name, params) {
  const res = await c.rpc(name, params)
  if (res.error != null) return { data: null, error: res.error }
  return { data: res.data, error: null }
}

async function cleanupListing(sellerC, listingId) {
  if (listingId == null || sellerC == null) return
  try {
    const { error } = await sellerC.from('listings').delete().eq('id', listingId)
    if (error != null) {
      console.error(`  cleanup: could not delete test listing ${listingId}: ${error.message}`)
    }
  } catch (err) {
    console.error(`  cleanup: listing delete failed: ${err.message}`)
  }
}

// Cancel a pending order via the supported RPC, then delete it via the
// buyer-only delete RPC, so run-scoped orders never block listing cleanup.
async function cancelAndDelete(participantC, orderId) {
  if (orderId == null || participantC == null) return
  try {
    await participantC.rpc('cancel_marketplace_order', { p_order_id: orderId })
  } catch {
    // best-effort
  }
  try {
    await participantC.rpc('delete_my_cancelled_order', { p_order_id: orderId })
  } catch {
    // best-effort
  }
}

async function signOutAll(clients) {
  await Promise.allSettled(
    clients
      .filter((c) => c != null)
      .map((c) => c.auth.signOut().then(() => null).catch(() => null)),
  )
}

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function main() {
  console.log('== Phase 9 hosted verification (payment status + fulfillment) ==')
  console.log(`Run id: ${runId}`)
  console.log(`Accounts (emails only): ${sellerEmail}, ${buyerEmail}, ${strangerEmail}`
    + (hasBuyerB || hasSellerB ? ` (+ buyer B, seller B)` : ''))

  let seller = null
  let buyer = null
  let stranger = null
  let buyerB = null
  let sellerB = null
  const anonClient = client()
  let sellerId = null
  let category = null
  let brand = null

  // Rows this run creates (for cleanup).
  const deletableListings = []
  const pendingOrders = [] // { orderId, buyerClient } — cancelled + deleted in cleanup
  const proofPaths = [] // storage objects the buyer owns (best-effort delete)
  const disabledMethods = [] // { method } seller disabled during the run (re-enable)
  // Retained orders/listings are intentionally kept (permanent transaction
  // records) and are never swept by cleanup.
  const retainedListings = []

  async function createListing({ title, quantity }) {
    const { data: listing, error } = await seller.c
      .from('listings')
      .insert({
        seller_id: sellerId,
        category_id: category.id,
        brand_id: brand?.id ?? null,
        title,
        description: 'Isolated Phase 9 verification listing.',
        listing_condition: 'like_new',
        price: 1200,
        quantity,
        listing_status: 'active',
        pickup_available: true,
        delivery_available: true,
      })
      .select('id, title, listing_status, quantity, price, seller_id')
      .single()
    if (error != null) throw new Error(`could not create test listing: ${error.message}`)
    deletableListings.push(listing.id)
    return listing
  }

  async function orderByBuyer(listingId, fulfillmentType) {
    const res = await runRpc(buyer.c, 'create_marketplace_order', {
      p_listing_id: listingId,
      p_quantity: 1,
      p_fulfillment_type: fulfillmentType,
    })
    if (res.error != null) throw new Error(`could not create test order: ${res.error.message}`)
    return res.data
  }

  async function confirmOrder(orderId) {
    const res = await runRpc(seller.c, 'confirm_marketplace_order', { p_order_id: orderId })
    if (res.error != null) throw new Error(`could not confirm test order: ${res.error.message}`)
    return res.data
  }

  async function listingQuantity(sellerC, listingId) {
    const { data } = await sellerC.from('listings').select('quantity').eq('id', listingId).single()
    return data?.quantity
  }

  async function setMethodEnabled(method, enabled) {
    const { error } = await seller.c
      .from('seller_payment_methods')
      .update({ is_enabled: enabled })
      .eq('seller_id', sellerId)
      .eq('method', method)
    if (error != null) throw new Error(`could not update payment method ${method}: ${error.message}`)
    if (!enabled) disabledMethods.push(method)
  }

  const deliverySnapshot = {
    p_recipient_name: 'Ana Test',
    p_phone: '09171234567',
    p_address: '123 Sesame Street',
    p_city: 'Cebu City',
    p_province: 'Cebu',
    p_postal_code: '6000',
    p_delivery_notes: 'Ring once.',
  }

  try {
    // 1. Sign in all three reusable accounts. No signup, no new Auth users.
    seller = await signIn('seller', sellerEmail, sellerPassword)
    buyer = await signIn('buyer', buyerEmail, buyerPassword)
    stranger = await signIn('stranger', strangerEmail, strangerPassword)
    check('seller signs in', seller.user != null)
    check('buyer signs in', buyer.user != null)
    check('stranger signs in', stranger.user != null)

    if (hasBuyerB) {
      try {
        buyerB = await signIn('buyer B', buyerBEmail, buyerBPassword)
        check('buyer B signs in', buyerB.user != null)
      } catch (err) {
        console.error(`  SKIP  buyer B signs in (${err.message})`)
        buyerB = null
      }
    } else {
      skip('buyer B signs in (requires PHASE8_TEST_BUYER_B_*)')
    }

    if (hasSellerB) {
      try {
        sellerB = await signIn('seller B', sellerBEmail, sellerBPassword)
        check('seller B signs in', sellerB.user != null)
      } catch (err) {
        console.error(`  SKIP  seller B signs in (${err.message})`)
        sellerB = null
      }
    } else {
      skip('seller B signs in (requires PHASE8_TEST_SELLER_B_*)')
    }

    // 1b. Probe that the Phase 9 RPCs are live on the hosted project.
    const probe = await buyer.c.rpc('submit_payment', {
      p_order_id: '00000000-0000-0000-0000-000000000000',
      p_payment_method: 'manual_transfer',
    })
    if (probe.error != null && /PGRST202|could not find the function/i.test(String(probe.error.code ?? probe.error.message))) {
      console.error('BLOCKED: Phase 9 payment/fulfillment RPCs are not present on the hosted project.')
      console.error('Apply supabase/migrations/20260815000100_phase9_payment_and_fulfillment.sql first.')
      process.exitCode = 3
      return
    }

    // 2. Seller profile: reuse existing; must be ACTIVE to sell.
    const { data: existingProfiles } = await seller.c
      .from('seller_profiles')
      .select('id, seller_status, store_name')
      .eq('user_id', seller.user.id)
    if ((existingProfiles ?? []).length > 0) {
      sellerId = existingProfiles[0].id
      check('seller profile reused', sellerId != null, toText(existingProfiles))
      check(
        'seller is active',
        existingProfiles[0].seller_status === 'active',
        toText(existingProfiles[0].seller_status),
      )
    } else {
      const { data: createdProfile, error: profileErr } = await seller.c
        .from('seller_profiles')
        .insert({ user_id: seller.user.id, store_name: `Ace Paddles ${runId}` })
        .select('id, seller_status')
        .single()
      sellerId = createdProfile?.id ?? null
      check('seller self-creates a seller profile', profileErr == null && sellerId != null, profileErr?.message)
      check('seller is active', createdProfile?.seller_status === 'active', toText(createdProfile?.seller_status))
    }
    if (sellerId == null) throw new Error('no seller profile id — cannot continue verification')

    // 2b. Category/brand reference rows for test listings.
    const { data: categoryRow } = await buyer.c.from('categories').select('id').limit(1).single()
    const { data: brandRow } = await buyer.c.from('brands').select('id').limit(1).maybeSingle()
    category = categoryRow
    brand = brandRow
    if (category == null) throw new Error('no category found — cannot create test listings')

    // 2c. Seller payment-method seeding (migration backfill) is visible to the
    // seller (own rows, including disabled) and to the buyer (enabled rows of
    // an active seller only).
    const { data: sellerMethods } = await seller.c
      .from('seller_payment_methods')
      .select('method, is_enabled')
      .eq('seller_id', sellerId)
    const { data: buyerMethods } = await buyer.c
      .from('seller_payment_methods')
      .select('method, is_enabled')
      .eq('seller_id', sellerId)
    check(
      'seller sees all three own payment methods',
      (sellerMethods ?? []).length === 3,
      toText(sellerMethods),
    )
    check(
      'buyer sees enabled methods of the active seller',
      (buyerMethods ?? []).length === 3 && (buyerMethods ?? []).every((m) => m.is_enabled),
      toText(buyerMethods),
    )

    // 3. Test listings.
    const LD = await createListing({ title: `Phase 9 delivery happy ${runId}`, quantity: 4 })
    const LP = LD // pickup happy-path order reuses the same listing
    const LC = await createListing({ title: `Phase 9 pending negative ${runId}`, quantity: 2 })
    check('seller owns active test listings', LD.listing_status === 'active' && LC.listing_status === 'active')
    retainedListings.push(LD.id)

    // ----------------------------------------------------------------------
    // SECTION A — pending order: payment gates + helper RPCs + cleanup path
    // ----------------------------------------------------------------------
    console.log('\n-- A. Pending order guards --')
    const C1 = await orderByBuyer(LC.id, 'pickup')
    pendingOrders.push({ orderId: C1.id, buyerClient: buyer.c })
    check('buyer created a pending pickup order', C1.status === 'pending', toText(C1.status))

    const submitOnPending = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: C1.id,
      p_payment_method: 'manual_transfer',
      ...deliverySnapshot,
    })
    expectRpcCode('submit_payment on a pending order fails', submitOnPending, 'INVALID_ORDER_STATUS')

    const prepPending = await runRpc(seller.c, 'start_order_preparation', { p_order_id: C1.id })
    expectRpcCode('start_order_preparation on a pending order fails', prepPending, 'ORDER_NOT_PREPARABLE')

    const canUploadC1 = await runRpc(buyer.c, 'can_upload_payment_proof', { p_order_id: C1.id })
    check('can_upload_payment_proof is false on a pending order', canUploadC1.data === false, toText(canUploadC1.data))
    const isOpenC1 = await runRpc(buyer.c, 'payment_is_open', { p_order_id: C1.id })
    check('payment_is_open is false on a pending order', isOpenC1.data === false, toText(isOpenC1.data))

    // C1 is cleaned up at the end (pending → cancel → delete → listing delete).

    // ----------------------------------------------------------------------
    // SECTION B — delivery + manual transfer: proof review, reject/resubmit,
    //             prepare → ship → complete
    // ----------------------------------------------------------------------
    console.log('\n-- B. Delivery + manual transfer happy path --')
    const D1 = await orderByBuyer(LD.id, 'delivery')
    check('buyer created a delivery order', D1.status === 'pending', toText(D1.status))
    // Inventory regression baseline: quantity immediately after the Phase 8
    // checkout RPC (stock is decremented at order creation, never again).
    const stockD1 = await listingQuantity(seller.c, LD.id)
    check('stock captured immediately after Phase 8 checkout', Number.isInteger(stockD1), toText(stockD1))
    const D1c = await confirmOrder(D1.id)
    check('seller confirmed the delivery order', D1c.status === 'confirmed' && D1c.confirmed_at != null, toText(D1c.status))

    const canUploadD1 = await runRpc(buyer.c, 'can_upload_payment_proof', { p_order_id: D1.id })
    check('can_upload_payment_proof is true once confirmed', canUploadD1.data === true, toText(canUploadD1.data))

    const strangerSubmit = await runRpc(stranger.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'manual_transfer',
      ...deliverySnapshot,
    })
    expectRpcCode('stranger cannot submit payment on another buyer order', strangerSubmit, 'FORBIDDEN')

    const noProof = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'manual_transfer',
      ...deliverySnapshot,
    })
    expectRpcCode('manual transfer without proof is rejected', noProof, 'PAYMENT_PROOF_REQUIRED')

    const foreignProof = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'manual_transfer',
      p_proof_path: '00000000-0000-0000-0000-000000000000/D1/proof.png',
      ...deliverySnapshot,
    })
    expectRpcCode('proof path outside the buyer folder is rejected', foreignProof, 'INVALID_PAYMENT_PROOF')

    const noAddress = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'manual_transfer',
      p_proof_path: `${buyer.user.id}/D1/proof.png`,
    })
    expectRpcCode('delivery order without a destination is rejected', noAddress, 'DELIVERY_ADDRESS_REQUIRED')

    // Disabled seller method → unavailable.
    await setMethodEnabled('cash_on_delivery', false)
    const disabledMethod = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'cash_on_delivery',
    })
    expectRpcCode('disabled seller method is unavailable', disabledMethod, 'PAYMENT_METHOD_UNAVAILABLE')
    await setMethodEnabled('cash_on_delivery', true)

    const wrongFulfillmentCash = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'cash_on_pickup',
    })
    expectRpcCode('cash on pickup is invalid for a delivery order', wrongFulfillmentCash, 'INVALID_PAYMENT_METHOD')

    // Happy-path submit.
    const proofOkPath = `${buyer.user.id}/${D1.id}/proof-ok.png`
    proofPaths.push(proofOkPath)
    const D1submit = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'manual_transfer',
      p_proof_path: proofOkPath,
      p_reference: 'GCASH-RUN-1',
      ...deliverySnapshot,
    })
    check(
      'buyer submits a manual-transfer payment',
      D1submit.data != null && D1submit.data.status === 'submitted' && D1submit.data.amount === D1.total,
      toText(D1submit.data),
    )
    check(
      'payment row is recorded with proof and reference',
      D1submit.data?.proof_path === proofOkPath && D1submit.data?.payment_reference === 'GCASH-RUN-1',
      toText(D1submit.data),
    )
    check(
      'payment is tied to the correct order',
      D1submit.data?.order_id === D1.id,
      toText(D1submit.data?.order_id),
    )
    const { data: D1participants } = await buyer.c
      .from('orders')
      .select('buyer_id, seller_id')
      .eq('id', D1.id)
      .single()
    check(
      'order participants are unchanged after payment',
      D1participants?.buyer_id === buyer.user.id && D1participants?.seller_id === sellerId,
      toText(D1participants),
    )
    const stockAfterSubmit = await listingQuantity(seller.c, LD.id)
    check('payment submission does not change inventory', stockAfterSubmit === stockD1, toText(stockAfterSubmit))

    // The submit_payment signature has no amount parameter: a client cannot
    // inject a preferred amount (the order total is always authoritative).
    const amountSpoof = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'manual_transfer',
      p_proof_path: proofOkPath,
      p_amount: 1,
      ...deliverySnapshot,
    })
    check('client cannot pass a payment amount to submit_payment', amountSpoof.error != null, amountSpoof.error?.message)

    const isOpenD1 = await runRpc(buyer.c, 'payment_is_open', { p_order_id: D1.id })
    check('payment_is_open is true while submitted', isOpenD1.data === true, toText(isOpenD1.data))

    // Delivery snapshot persisted into fulfillment_details.
    const { data: D1fulfillment } = await buyer.c
      .from('fulfillment_details')
      .select('*')
      .eq('order_id', D1.id)
      .single()
    check(
      'delivery destination is snapshotted',
      D1fulfillment?.fulfillment_type === 'delivery' &&
        D1fulfillment?.recipient_name === 'Ana Test' &&
        D1fulfillment?.address === '123 Sesame Street' &&
        D1fulfillment?.city === 'Cebu City' &&
        D1fulfillment?.province === 'Cebu' &&
        D1fulfillment?.postal_code === '6000' &&
        D1fulfillment?.notes === 'Ring once.',
      toText(D1fulfillment),
    )

    const buyerSeesOwnPayment = await buyer.c.from('payments').select('id').eq('order_id', D1.id)
    check('buyer can read their own payment row', (buyerSeesOwnPayment.data ?? []).length === 1)
    const strangerSeesPayment = await stranger.c.from('payments').select('id').eq('order_id', D1.id)
    check('stranger cannot read the payment row', (strangerSeesPayment.data ?? []).length === 0)
    const strangerSeesFulfillment = await stranger.c
      .from('fulfillment_details')
      .select('id')
      .eq('order_id', D1.id)
    check('stranger cannot read fulfillment details', (strangerSeesFulfillment.data ?? []).length === 0)
    const strangerSeesOrder = await stranger.c.from('orders').select('id').eq('id', D1.id)
    check('stranger cannot read the order', (strangerSeesOrder.data ?? []).length === 0)

    // ----------------------------------------------------------------------
    // Storage policies for payment proofs (D1 is still confirmed + open).
    // ----------------------------------------------------------------------
    console.log('\n-- B2. Payment proof storage --')
    const uploadOk = await buyer.c.storage.from(PROOF_BUCKET).upload(proofOkPath, ONE_PIXEL_PNG, {
      contentType: 'image/png',
      upsert: true,
    })
    check('buyer uploads proof into their own order folder', uploadOk.error == null, uploadOk.error?.message)

    // The upload path must match the RLS contract exactly: {buyer}/{order}/{file}.
    const pathSegments = proofOkPath.split('/')
    check(
      'proof path follows {buyer}/{order}/{file}',
      pathSegments.length === 3
        && pathSegments[0] === buyer.user.id
        && pathSegments[1] === D1.id
        && pathSegments[2].startsWith('proof-'),
      proofOkPath,
    )

    const uploadDenied = await buyer.c.storage
      .from(PROOF_BUCKET)
      .upload(`${buyer.user.id}/00000000-0000-0000-0000-000000000000/proof-x.png`, ONE_PIXEL_PNG, {
        contentType: 'image/png',
      })
    check('buyer cannot upload proof for an order they do not own', uploadDenied.error != null, uploadDenied.error?.message)

    const uploadPendingDenied = await buyer.c.storage
      .from(PROOF_BUCKET)
      .upload(`${buyer.user.id}/${C1.id}/proof-x.png`, ONE_PIXEL_PNG, { contentType: 'image/png' })
    check('buyer cannot upload proof for a pending order', uploadPendingDenied.error != null, uploadPendingDenied.error?.message)

    // A cancelled order is no longer payable: uploads to its folder are denied
    // just like a pending one (cancelled orders are cleaned up at the end).
    const cancelledRes = await buyer.c.rpc('create_marketplace_order', {
      p_listing_id: LC.id,
      p_quantity: 1,
      p_fulfillment_type: 'delivery',
    })
    if (cancelledRes.error == null && cancelledRes.data?.id != null) {
      const cancelledOrderId = cancelledRes.data.id
      await buyer.c.rpc('cancel_marketplace_order', { p_order_id: cancelledOrderId })
      const uploadCancelledDenied = await buyer.c.storage
        .from(PROOF_BUCKET)
        .upload(`${buyer.user.id}/${cancelledOrderId}/proof-x.png`, ONE_PIXEL_PNG, { contentType: 'image/png' })
      check('buyer cannot upload proof for a cancelled order', uploadCancelledDenied.error != null, uploadCancelledDenied.error?.message)
      pendingOrders.push({ orderId: cancelledOrderId, buyerClient: buyer.c })
    } else {
      skip('cancelled-order upload denial (order creation failed)')
    }

    const strangerUploadDenied = await stranger.c.storage
      .from(PROOF_BUCKET)
      .upload(`${stranger.user.id}/${D1.id}/proof-x.png`, ONE_PIXEL_PNG, { contentType: 'image/png' })
    check('stranger cannot upload proof for another buyer order', strangerUploadDenied.error != null, strangerUploadDenied.error?.message)

    const sellerSigned = await seller.c.storage.from(PROOF_BUCKET).createSignedUrl(proofOkPath, 60)
    check('seller can view the buyer proof', sellerSigned.error == null && sellerSigned.data?.signedUrl != null, sellerSigned.error?.message)

    const buyerSigned = await buyer.c.storage.from(PROOF_BUCKET).createSignedUrl(proofOkPath, 60)
    check('buyer can read their own proof', buyerSigned.error == null && buyerSigned.data?.signedUrl != null, buyerSigned.error?.message)

    if (hasBuyerB && buyerB != null) {
      const buyerBSigned = await buyerB.c.storage.from(PROOF_BUCKET).createSignedUrl(proofOkPath, 60)
      check('Buyer B cannot view Buyer A proof', buyerBSigned.error != null, buyerBSigned.error?.message ?? 'unexpected access')
    } else {
      skip('Buyer B proof denial (requires PHASE8_TEST_BUYER_B_*)')
    }

    if (hasSellerB && sellerB != null) {
      const sellerBSigned = await sellerB.c.storage.from(PROOF_BUCKET).createSignedUrl(proofOkPath, 60)
      check('Seller B cannot view Seller A order proof', sellerBSigned.error != null, sellerBSigned.error?.message ?? 'unexpected access')
    } else {
      skip('Seller B proof denial (requires PHASE8_TEST_SELLER_B_*)')
    }

    const anonSigned = await anonClient.storage.from(PROOF_BUCKET).createSignedUrl(proofOkPath, 60)
    check('public unauthenticated access denied', anonSigned.error != null, anonSigned.error?.message ?? 'unexpected access')

    const strangerSigned = await stranger.c.storage.from(PROOF_BUCKET).createSignedUrl(proofOkPath, 60)
    check('stranger cannot view the buyer proof', strangerSigned.error != null, strangerSigned.error?.message)

    // The buyer may remove/replace their proof while the payment is open.
    const deleteWhileOpen = await buyer.c.storage.from(PROOF_BUCKET).remove([proofOkPath])
    check('buyer can delete their proof while the payment is open', deleteWhileOpen.error == null, deleteWhileOpen.error?.message)

    // Review guards.
    const badDecision = await runRpc(seller.c, 'review_payment', {
      p_payment_id: D1submit.data.id,
      p_decision: 'maybe',
    })
    expectRpcCode('invalid review decision is rejected', badDecision, 'INVALID_DECISION')

    const buyerReview = await runRpc(buyer.c, 'review_payment', {
      p_payment_id: D1submit.data.id,
      p_decision: 'approve',
    })
    expectRpcCode('buyer cannot review their own payment', buyerReview, 'FORBIDDEN')

    const noReason = await runRpc(seller.c, 'review_payment', {
      p_payment_id: D1submit.data.id,
      p_decision: 'reject',
    })
    expectRpcCode('rejecting without a reason fails', noReason, 'REJECTION_REASON_REQUIRED')

    const reject = await runRpc(seller.c, 'review_payment', {
      p_payment_id: D1submit.data.id,
      p_decision: 'reject',
      p_rejection_reason: 'Proof image is unreadable — please re-upload.',
    })
    check(
      'seller rejects the proof with a reason',
      reject.data?.status === 'rejected' && reject.data?.rejection_reason?.includes('unreadable'),
      toText(reject.data),
    )
    const { data: afterReject } = await buyer.c
      .from('orders')
      .select('status')
      .eq('id', D1.id)
      .single()
    check('order stays confirmed after a rejection', afterReject?.status === 'confirmed', toText(afterReject?.status))

    // Payment not yet verified → cannot prepare.
    const prepBeforePaid = await runRpc(seller.c, 'start_order_preparation', { p_order_id: D1.id })
    expectRpcCode('preparation blocked before payment is verified', prepBeforePaid, 'PAYMENT_NOT_PAID')

    const shipBeforePreparing = await runRpc(seller.c, 'mark_order_shipped', {
      p_order_id: D1.id,
      p_courier: 'J&T',
      p_tracking_number: 'JT9-X',
    })
    expectRpcCode('shipping before preparation fails', shipBeforePreparing, 'ORDER_NOT_SHIPPABLE')

    // Buyer resubmits after correction.
    const D1resubmit = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'manual_transfer',
      p_proof_path: proofOkPath,
      p_reference: 'GCASH-RUN-2',
      ...deliverySnapshot,
    })
    check('buyer resubmits after a rejection', D1resubmit.data?.status === 'submitted', toText(D1resubmit.data))

    const strangerReview = await runRpc(stranger.c, 'review_payment', {
      p_payment_id: D1resubmit.data.id,
      p_decision: 'approve',
    })
    expectRpcCode('stranger cannot approve a payment', strangerReview, 'FORBIDDEN')

    const approve = await runRpc(seller.c, 'review_payment', {
      p_payment_id: D1resubmit.data.id,
      p_decision: 'approve',
    })
    check(
      'seller approves the payment',
      approve.data?.status === 'paid' && approve.data?.paid_at != null,
      toText(approve.data),
    )
    const stockAfterApprove = await listingQuantity(seller.c, LD.id)
    check('approval does not change inventory', stockAfterApprove === stockD1, toText(stockAfterApprove))
    const approveAgain = await runRpc(seller.c, 'review_payment', {
      p_payment_id: D1resubmit.data.id,
      p_decision: 'approve',
    })
    expectRpcCode('double approval is rejected', approveAgain, 'PAYMENT_NOT_SUBMITTED')
    const { data: D1afterApprove } = await buyer.c
      .from('orders')
      .select('status, paid_at')
      .eq('id', D1.id)
      .single()
    check(
      'order moves to paid with a trusted paid_at',
      D1afterApprove?.status === 'paid' && D1afterApprove?.paid_at != null,
      toText(D1afterApprove),
    )
    const isOpenD1after = await runRpc(buyer.c, 'payment_is_open', { p_order_id: D1.id })
    check('payment_is_open is false once verified', isOpenD1after.data === false, toText(isOpenD1after.data))

    // Prepare → ship.
    const buyerPrepD1 = await runRpc(buyer.c, 'start_order_preparation', { p_order_id: D1.id })
    expectRpcCode('buyer cannot start preparation', buyerPrepD1, 'FORBIDDEN')
    const strangerPrepD1 = await runRpc(stranger.c, 'start_order_preparation', { p_order_id: D1.id })
    expectRpcCode('stranger cannot start preparation', strangerPrepD1, 'FORBIDDEN')

    const prep = await runRpc(seller.c, 'start_order_preparation', { p_order_id: D1.id })
    check('seller starts preparation', prep.data?.status === 'preparing' && prep.data?.preparing_at != null, toText(prep.data))
    const stockAfterPrep = await listingQuantity(seller.c, LD.id)
    check('preparing does not change inventory', stockAfterPrep === stockD1, toText(stockAfterPrep))
    const dupPrep = await runRpc(seller.c, 'start_order_preparation', { p_order_id: D1.id })
    expectRpcCode('duplicate preparation is rejected', dupPrep, 'ORDER_NOT_PREPARABLE')

    const noTracking = await runRpc(seller.c, 'mark_order_shipped', {
      p_order_id: D1.id,
      p_courier: '',
      p_tracking_number: '',
    })
    expectRpcCode('shipping without tracking fails', noTracking, 'TRACKING_REQUIRED')

    const shipPickupOrder = await runRpc(seller.c, 'mark_order_ready_for_pickup', { p_order_id: D1.id })
    expectRpcCode('marking a delivery order ready for pickup fails', shipPickupOrder, 'WRONG_FULFILLMENT_TYPE')

    const ship = await runRpc(seller.c, 'mark_order_shipped', {
      p_order_id: D1.id,
      p_courier: 'J&T Express',
      p_tracking_number: 'JT9-RUN-0001',
    })
    check('seller marks the order shipped', ship.data?.status === 'shipped' && ship.data?.shipped_at != null, toText(ship.data))
    const { data: D1fulfillmentAfter } = await buyer.c
      .from('fulfillment_details')
      .select('courier, tracking_number')
      .eq('order_id', D1.id)
      .single()
    check(
      'tracking details are stored',
      D1fulfillmentAfter?.courier === 'J&T Express' && D1fulfillmentAfter?.tracking_number === 'JT9-RUN-0001',
      toText(D1fulfillmentAfter),
    )
    const stockAfterShip = await listingQuantity(seller.c, LD.id)
    check('shipped does not change inventory', stockAfterShip === stockD1, toText(stockAfterShip))

    const sellerCompleteD1 = await runRpc(seller.c, 'confirm_order_received', { p_order_id: D1.id })
    expectRpcCode('seller cannot complete on behalf of the buyer', sellerCompleteD1, 'FORBIDDEN')

    const strangerConfirm = await runRpc(stranger.c, 'confirm_order_received', { p_order_id: D1.id })
    expectRpcCode('stranger cannot confirm receipt', strangerConfirm, 'FORBIDDEN')

    const completeD1 = await runRpc(buyer.c, 'confirm_order_received', { p_order_id: D1.id })
    check(
      'buyer confirms receipt and completes the order',
      completeD1.data?.status === 'completed' && completeD1.data?.completed_at != null,
      toText(completeD1.data),
    )
    const stockAfterComplete = await listingQuantity(seller.c, LD.id)
    check('completion does not change inventory', stockAfterComplete === stockD1, toText(stockAfterComplete))
    const completeD1Again = await runRpc(buyer.c, 'confirm_order_received', { p_order_id: D1.id })
    expectRpcCode('duplicate completion is rejected', completeD1Again, 'ORDER_NOT_COMPLETABLE')

    // ----------------------------------------------------------------------
    // SECTION C — pickup + cash: cash handoff lifecycle
    // ----------------------------------------------------------------------
    console.log('\n-- C. Pickup + cash happy path --')
    const P1 = await orderByBuyer(LP.id, 'pickup')
    check('buyer created a pickup order', P1.status === 'pending', toText(P1.status))
    const stockP1 = await listingQuantity(seller.c, LD.id)
    check('pickup order stock baseline captured', Number.isInteger(stockP1), toText(stockP1))
    const P1c = await confirmOrder(P1.id)
    check('seller confirmed the pickup order', P1c.status === 'confirmed' && P1c.confirmed_at != null, toText(P1c.status))

    const cashWrongFulfillment = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: P1.id,
      p_payment_method: 'cash_on_delivery',
    })
    expectRpcCode('cash on delivery is invalid for a pickup order', cashWrongFulfillment, 'INVALID_PAYMENT_METHOD')

    const cashWithProof = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: P1.id,
      p_payment_method: 'cash_on_pickup',
      p_proof_path: `${buyer.user.id}/P1/proof.png`,
    })
    expectRpcCode('cash payments cannot carry a proof upload', cashWithProof, 'INVALID_PAYMENT_PROOF')

    const P1submit = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: P1.id,
      p_payment_method: 'cash_on_pickup',
    })
    check(
      'buyer selects cash on pickup',
      P1submit.data != null &&
        P1submit.data.status === 'pending' &&
        P1submit.data.payment_method === 'cash_on_pickup' &&
        P1submit.data.proof_path == null &&
        P1submit.data.amount === P1.total,
      toText(P1submit.data),
    )
    const stockAfterCashSubmit = await listingQuantity(seller.c, LD.id)
    check('cash submission does not change inventory', stockAfterCashSubmit === stockP1, toText(stockAfterCashSubmit))

    // Seller pickup instructions copied from the seller profile.
    const { data: P1fulfillment } = await buyer.c
      .from('fulfillment_details')
      .select('pickup_location, pickup_instructions, fulfillment_type')
      .eq('order_id', P1.id)
      .single()
    const { data: sellerProfile } = await seller.c
      .from('seller_profiles')
      .select('pickup_location, pickup_instructions')
      .eq('id', sellerId)
      .single()
    check(
      'pickup snapshot is copied from the seller profile',
      P1fulfillment?.fulfillment_type === 'pickup' &&
        P1fulfillment?.pickup_location === sellerProfile?.pickup_location &&
        P1fulfillment?.pickup_instructions === sellerProfile?.pickup_instructions,
      toText(P1fulfillment),
    )

    const cashTooEarly = await runRpc(seller.c, 'mark_cash_received', { p_payment_id: P1submit.data.id })
    expectRpcCode('cash cannot be collected before the handoff', cashTooEarly, 'CASH_NOT_READY')

    const shipPickup = await runRpc(seller.c, 'mark_order_shipped', {
      p_order_id: P1.id,
      p_courier: 'LBC',
      p_tracking_number: 'LBC-RUN-1',
    })
    expectRpcCode('shipping a pickup order fails', shipPickup, 'WRONG_FULFILLMENT_TYPE')

    const readyNotYet = await runRpc(seller.c, 'mark_order_ready_for_pickup', { p_order_id: P1.id })
    expectRpcCode('marking a confirmed order ready fails', readyNotYet, 'ORDER_NOT_READYABLE')

    // Cash start: confirmed + pending cash payment → preparing.
    const prepP1 = await runRpc(seller.c, 'start_order_preparation', { p_order_id: P1.id })
    check('seller starts preparation on the cash order', prepP1.data?.status === 'preparing', toText(prepP1.data))
    const stockAfterCashPrep = await listingQuantity(seller.c, LD.id)
    check('cash preparation does not change inventory', stockAfterCashPrep === stockP1, toText(stockAfterCashPrep))

    const readyP1 = await runRpc(seller.c, 'mark_order_ready_for_pickup', { p_order_id: P1.id })
    check('seller marks the order ready for pickup', readyP1.data?.status === 'ready_for_pickup' && readyP1.data?.ready_for_pickup_at != null, toText(readyP1.data))
    const stockAfterReady = await listingQuantity(seller.c, LD.id)
    check('ready-for-pickup does not change inventory', stockAfterReady === stockP1, toText(stockAfterReady))

    const completeBeforePaid = await runRpc(buyer.c, 'confirm_order_received', { p_order_id: P1.id })
    expectRpcCode('completion blocked while the payment is pending', completeBeforePaid, 'PAYMENT_NOT_PAID')

    const collectCash = await runRpc(seller.c, 'mark_cash_received', { p_payment_id: P1submit.data.id })
    check(
      'seller records the collected cash',
      collectCash.data?.status === 'paid' && collectCash.data?.paid_at != null,
      toText(collectCash.data),
    )
    const stockAfterCash = await listingQuantity(seller.c, LD.id)
    check('cash collection does not change inventory', stockAfterCash === stockP1, toText(stockAfterCash))

    const collectTwice = await runRpc(seller.c, 'mark_cash_received', { p_payment_id: P1submit.data.id })
    expectRpcCode('cash cannot be collected twice', collectTwice, 'PAYMENT_NOT_COLLECTABLE')

    const completeP1 = await runRpc(buyer.c, 'confirm_order_received', { p_order_id: P1.id })
    check(
      'buyer confirms receipt and completes the cash order',
      completeP1.data?.status === 'completed' && completeP1.data?.completed_at != null,
      toText(completeP1.data),
    )
    const finalStock = await listingQuantity(seller.c, LD.id)
    check('final stock equals stock immediately after Phase 8 checkout', finalStock === stockP1, toText(finalStock))

    // ----------------------------------------------------------------------
    // SECTION D — disabled-method self-service is restored after the run
    // ----------------------------------------------------------------------
    console.log('\n-- D. Payment method self-service --')
    const { data: buyerMethodsFinal } = await buyer.c
      .from('seller_payment_methods')
      .select('method, is_enabled')
      .eq('seller_id', sellerId)
    check(
      'all seller methods are enabled again',
      (buyerMethodsFinal ?? []).length === 3 && (buyerMethodsFinal ?? []).every((m) => m.is_enabled),
      toText(buyerMethodsFinal),
    )

    // ----------------------------------------------------------------------
    // SECTION E — direct attack / permission hardening
    // ----------------------------------------------------------------------
    console.log('\n-- E. Direct attack / permission hardening --')
    const directPayInsert = await buyer.c.from('payments').insert({
      order_id: C1.id,
      amount: 1,
      payment_method: 'manual_transfer',
      status: 'paid',
    })
    check('direct payment INSERT denied for the buyer', directPayInsert.error != null, directPayInsert.error?.message ?? 'unexpected success')

    const strangerPayInsert = await stranger.c.from('payments').insert({
      order_id: C1.id,
      amount: 1,
      payment_method: 'manual_transfer',
      status: 'paid',
    })
    check('direct payment INSERT denied for the stranger', strangerPayInsert.error != null, strangerPayInsert.error?.message ?? 'unexpected success')

    const anonPayInsert = await anonClient.from('payments').insert({
      order_id: C1.id,
      amount: 1,
      payment_method: 'manual_transfer',
      status: 'paid',
    })
    check('direct payment INSERT denied for anon', anonPayInsert.error != null, anonPayInsert.error?.message ?? 'unexpected success')

    const directPayStatus = await buyer.c.from('payments').update({ status: 'paid' }).eq('order_id', C1.id)
    check('direct payment status = paid denied for the buyer', directPayStatus.error != null, directPayStatus.error?.message ?? 'unexpected success')

    const directPayAmount = await buyer.c.from('payments').update({ amount: 1 }).eq('order_id', C1.id)
    check('direct payment amount modification denied for the buyer', directPayAmount.error != null, directPayAmount.error?.message ?? 'unexpected success')

    const directOrderStatus = await buyer.c.from('orders').update({ status: 'completed' }).eq('id', C1.id)
    check('direct order status = completed denied for the buyer', directOrderStatus.error != null, directOrderStatus.error?.message ?? 'unexpected success')
    const { data: c1AfterAttack } = await buyer.c.from('orders').select('status').eq('id', C1.id).single()
    check('order status unchanged after the direct attack', c1AfterAttack?.status === 'pending', toText(c1AfterAttack?.status))

    const directTracking = await buyer.c.from('fulfillment_details').update({ tracking_number: 'HACKED' }).eq('order_id', D1.id)
    check('unauthorized fulfillment tracking update denied', directTracking.error != null, directTracking.error?.message ?? 'unexpected success')

    const directFulfillmentInsert = await buyer.c.from('fulfillment_details').insert({
      order_id: D1.id,
      fulfillment_type: 'delivery',
      recipient_name: 'Hacker',
    })
    check('direct fulfillment_details INSERT denied', directFulfillmentInsert.error != null, directFulfillmentInsert.error?.message ?? 'unexpected success')

    // ----------------------------------------------------------------------
    // SECTION F — cross-user / cross-seller access denial
    // ----------------------------------------------------------------------
    console.log('\n-- F. Cross-user / cross-seller access denial --')
    const sellerSeesPayment = await seller.c.from('payments').select('id').eq('order_id', D1.id)
    check('owning seller reads the payment row', (sellerSeesPayment.data ?? []).length === 1, toText(sellerSeesPayment.data))

    if (hasSellerB && sellerB != null) {
      const sBpay = await sellerB.c.from('payments').select('id').eq('order_id', D1.id)
      check('Seller B cannot read Seller A payment', (sBpay.data ?? []).length === 0, toText(sBpay.data))
      const sBful = await sellerB.c.from('fulfillment_details').select('id').eq('order_id', D1.id)
      check('Seller B cannot read Seller A fulfillment', (sBful.data ?? []).length === 0, toText(sBful.data))
      const sBord = await sellerB.c.from('orders').select('id').eq('id', D1.id)
      check('Seller B cannot read Seller A order', (sBord.data ?? []).length === 0, toText(sBord.data))
      const sBrev = await runRpc(sellerB.c, 'review_payment', { p_payment_id: D1resubmit.data.id, p_decision: 'approve' })
      expectRpcCode('Seller B cannot approve Seller A payment', sBrev, 'FORBIDDEN')
      const sBprep = await runRpc(sellerB.c, 'start_order_preparation', { p_order_id: D1.id })
      expectRpcCode('Seller B cannot prepare Seller A order', sBprep, 'FORBIDDEN')
    } else {
      skip('cross-seller denials (requires PHASE8_TEST_SELLER_B_*)')
    }

    if (hasBuyerB && buyerB != null) {
      const bBpay = await buyerB.c.from('payments').select('id').eq('order_id', D1.id)
      check('Buyer B cannot read Buyer A payment', (bBpay.data ?? []).length === 0, toText(bBpay.data))
      const bBful = await buyerB.c.from('fulfillment_details').select('id').eq('order_id', D1.id)
      check('Buyer B cannot read Buyer A fulfillment', (bBful.data ?? []).length === 0, toText(bBful.data))
      const bBord = await buyerB.c.from('orders').select('id').eq('id', D1.id)
      check('Buyer B cannot read Buyer A order', (bBord.data ?? []).length === 0, toText(bBord.data))
      const bBsub = await runRpc(buyerB.c, 'submit_payment', {
        p_order_id: D1.id,
        p_payment_method: 'manual_transfer',
        ...deliverySnapshot,
      })
      expectRpcCode('Buyer B cannot submit payment on Buyer A order', bBsub, 'FORBIDDEN')
      const bBcomp = await runRpc(buyerB.c, 'confirm_order_received', { p_order_id: D1.id })
      expectRpcCode('Buyer B cannot complete Buyer A order', bBcomp, 'FORBIDDEN')
    } else {
      skip('cross-buyer denials (requires PHASE8_TEST_BUYER_B_*)')
    }

    // ----------------------------------------------------------------------
    // SECTION G — multi-seller independence (gated on an active Seller B)
    // ----------------------------------------------------------------------
    console.log('\n-- G. Multi-seller independence --')
    if (hasSellerB && sellerB != null) {
      const { data: sBprofile } = await sellerB.c
        .from('seller_profiles')
        .select('id, seller_status')
        .eq('user_id', sellerB.user.id)
        .maybeSingle()
      if (sBprofile?.id != null && sBprofile.seller_status === 'active') {
        // Seller B creates their own active listing (their own RLS allows it).
        const { data: LB, error: LBer } = await sellerB.c
          .from('listings')
          .insert({
            seller_id: sBprofile.id,
            category_id: category.id,
            brand_id: brand?.id ?? null,
            title: `Phase 9 multi-seller B ${runId}`,
            description: 'Isolated Phase 9 Seller B verification listing.',
            listing_condition: 'like_new',
            price: 1500,
            quantity: 3,
            listing_status: 'active',
            pickup_available: true,
            delivery_available: true,
          })
          .select('id, title, listing_status, quantity, price, seller_id')
          .single()
        if (LBer != null) {
          console.error(`  BLOCKED  multi-seller independence could not create Seller B listing: ${LBer.message}`)
        } else {
          check('Seller B owns an active test listing', LB?.listing_status === 'active', toText(LB))
          retainedListings.push(LB.id)

          // Seller A order (delivery) advanced only to preparing.
          const A2 = await orderByBuyer(LD.id, 'delivery')
          const A2c = await confirmOrder(A2.id)
          check('Seller A order confirmed for the independence run', A2c.status === 'confirmed', toText(A2c.status))
          const A2submit = await runRpc(buyer.c, 'submit_payment', {
            p_order_id: A2.id,
            p_payment_method: 'manual_transfer',
            p_proof_path: `${buyer.user.id}/${A2.id}/proof.png`,
            p_reference: 'A2-RUN',
            ...deliverySnapshot,
          })
          check('Seller A payment submitted', A2submit.data?.status === 'submitted', toText(A2submit.data))
          const A2approve = await runRpc(seller.c, 'review_payment', {
            p_payment_id: A2submit.data.id,
            p_decision: 'approve',
          })
          check('Seller A payment approved', A2approve.data?.status === 'paid', toText(A2approve.data))
          const A2prep = await runRpc(seller.c, 'start_order_preparation', { p_order_id: A2.id })
          check('Seller A order advanced to preparing', A2prep.data?.status === 'preparing', toText(A2prep.data))

          // Seller B order (delivery) left awaiting payment approval.
          const B2 = await orderByBuyer(LB.id, 'delivery')
          check('Seller B order created using the Phase 8 flow', B2.status === 'pending', toText(B2.status))
          const B2c = await runRpc(sellerB.c, 'confirm_marketplace_order', { p_order_id: B2.id })
          check('Seller B confirmed their order', B2c.data?.status === 'confirmed', toText(B2c.data))
          const B2submit = await runRpc(buyer.c, 'submit_payment', {
            p_order_id: B2.id,
            p_payment_method: 'manual_transfer',
            p_proof_path: `${buyer.user.id}/${B2.id}/proof.png`,
            p_reference: 'B2-RUN',
            ...deliverySnapshot,
          })
          check('Seller B payment is awaiting approval', B2submit.data?.status === 'submitted', toText(B2submit.data))

          // While Seller A is preparing, Seller B must be untouched.
          const { data: bStat, error: bStatErr } = await buyer.c.from('orders').select('status, total').eq('id', B2.id).single()
          const { data: bPay, error: bPayErr } = await buyer.c.from('payments').select('status, amount').eq('order_id', B2.id).single()
          const { data: bFul, error: bFulErr } = await buyer.c.from('fulfillment_details').select('recipient_name, city, province').eq('order_id', B2.id).single()
          check('Seller B order status unchanged while Seller A prepares', bStatErr == null && bStat?.status === 'confirmed', toText(bStat))
          check('Seller B payment unchanged while Seller A prepares', bPayErr == null && bPay?.status === 'submitted' && bPay?.amount === B2.total, toText(bPay))
          check('Seller B fulfillment unchanged while Seller A prepares', bFulErr == null && bFul?.recipient_name === 'Ana Test' && bFul?.city === 'Cebu City', toText(bFul))

          const sBreviewA2 = await runRpc(sellerB.c, 'review_payment', { p_payment_id: A2submit.data.id, p_decision: 'approve' })
          expectRpcCode('Seller B cannot review Seller A payment', sBreviewA2, 'FORBIDDEN')
          const sBprepA2 = await runRpc(sellerB.c, 'start_order_preparation', { p_order_id: A2.id })
          expectRpcCode('Seller B cannot prepare Seller A order', sBprepA2, 'FORBIDDEN')

          // Progress Seller B independently to completion.
          const B2approve = await runRpc(sellerB.c, 'review_payment', { p_payment_id: B2submit.data.id, p_decision: 'approve' })
          check('Seller B approves their payment', B2approve.data?.status === 'paid', toText(B2approve.data))
          const B2prep = await runRpc(sellerB.c, 'start_order_preparation', { p_order_id: B2.id })
          check('Seller B starts preparation', B2prep.data?.status === 'preparing', toText(B2prep.data))
          const B2ship = await runRpc(sellerB.c, 'mark_order_shipped', {
            p_order_id: B2.id,
            p_courier: 'J&T B',
            p_tracking_number: 'JT-B-0001',
          })
          check('Seller B ships their order', B2ship.data?.status === 'shipped', toText(B2ship.data))
          const B2complete = await runRpc(buyer.c, 'confirm_order_received', { p_order_id: B2.id })
          check('Seller B order completes independently', B2complete.data?.status === 'completed', toText(B2complete.data))

          // While Seller B completed, Seller A must be untouched.
          const { data: aStat, error: aStatErr } = await buyer.c.from('orders').select('status').eq('id', A2.id).single()
          const { data: aPay, error: aPayErr } = await buyer.c.from('payments').select('status, amount').eq('order_id', A2.id).single()
          const { data: aFul, error: aFulErr } = await buyer.c.from('fulfillment_details').select('recipient_name, city, province').eq('order_id', A2.id).single()
          check('Seller A order unchanged while Seller B progresses', aStatErr == null && aStat?.status === 'preparing', toText(aStat))
          check('Seller A payment unchanged while Seller B progresses', aPayErr == null && aPay?.status === 'paid' && aPay?.amount === A2.total, toText(aPay))
          check('Seller A fulfillment unchanged while Seller B progresses', aFulErr == null && aFul?.recipient_name === 'Ana Test' && aFul?.city === 'Cebu City', toText(aFul))

          const sAreviewB2 = await runRpc(seller.c, 'review_payment', { p_payment_id: B2submit.data.id, p_decision: 'approve' })
          expectRpcCode('Seller A cannot review Seller B payment', sAreviewB2, 'FORBIDDEN')
        }
      } else {
        console.error('  BLOCKED  multi-seller independence skipped — Seller B seller profile is not active.')
      }
    } else {
      skip('multi-seller independence (requires PHASE8_TEST_SELLER_B_*)')
    }

    // ----------------------------------------------------------------------
    // Cleanup (in main so we can assert it)
    // ----------------------------------------------------------------------
    console.log('\n-- Cleanup --')
    for (const { orderId, buyerClient } of pendingOrders) {
      await cancelAndDelete(buyerClient, orderId)
      const stillThere = await buyerClient.from('orders').select('id').eq('id', orderId)
      check('pending order cleaned up', (stillThere.data ?? []).length === 0)
    }
    for (const listingId of deletableListings) {
      if (!retainedListings.includes(listingId)) await cleanupListing(seller.c, listingId)
    }
  } finally {
    // Best-effort cleanup even on failure: re-enable any disabled methods,
    // cancel+delete pending orders, delete proof objects the buyer can still
    // delete, remove listings that no longer back a retained order, sign out.
    try {
      if (seller != null && sellerId != null) {
        for (const method of disabledMethods) {
          await seller.c
            .from('seller_payment_methods')
            .update({ is_enabled: true })
            .eq('seller_id', sellerId)
            .eq('method', method)
        }
      }
    } catch {
      // best-effort
    }
    try {
      if (buyer != null) {
        for (const { orderId, buyerClient } of pendingOrders) {
          await cancelAndDelete(buyerClient, orderId)
        }
        for (const path of proofPaths) {
          await buyer.c.storage.from(PROOF_BUCKET).remove([path])
        }
      }
    } catch {
      // best-effort
    }
    try {
      if (seller != null) {
        for (const listingId of deletableListings) {
          if (!retainedListings.includes(listingId)) await cleanupListing(seller.c, listingId)
        }
      }
    } catch {
      // best-effort
    }
    await signOutAll([seller?.c, buyer?.c, stranger?.c, buyerB?.c, sellerB?.c, anonClient])
  }

  console.log('')
  if (failures === 0) {
    console.log('== Result: ALL PASS ==')
  } else {
    console.error(`== Result: FAIL — ${failures} failure(s) ==`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`FAIL: Phase 9 hosted verification crashed: ${err.stack ?? err.message}`)
  process.exitCode = 1
})
