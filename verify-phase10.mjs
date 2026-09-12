import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// PHASE 10 HOSTED VERIFICATION — Ratings & Reviews
// ============================================================================
// Verifies the Phase 10 verified-purchase rating system against the hosted
// Supabase project using REUSABLE, CONFIRMED test accounts configured via
// environment variables. It NEVER creates Auth users: it only signs in with
// the provided credentials, runs reviews against orders completed through the
// real Phase 8/9 workflow, checks the RLS/permission hardening, verifies the
// server-side aggregates, cleans up every row it can (through the supported
// production RPCs), and leaves the Auth accounts intact for future runs.
//
// Required credentials (local only — never commit real values):
//   PHASE7_TEST_SELLER_EMAIL / PHASE7_TEST_SELLER_PASSWORD
//   PHASE7_TEST_BUYER_EMAIL  / PHASE7_TEST_BUYER_PASSWORD
//   PHASE7_TEST_STRANGER_EMAIL / PHASE7_TEST_STRANGER_PASSWORD
//
// Optional credentials (only when set; the script SKIPs those sub-sections):
//   PHASE8_TEST_BUYER_B_EMAIL / PHASE8_TEST_BUYER_B_PASSWORD   (cross-buyer
//     isolation — the reviewer row is public, so cross-buyer assertions target
//     review WRITE attempts and the trusted reviewer attribute)
//   PHASE8_TEST_SELLER_B_EMAIL / PHASE8_TEST_SELLER_B_PASSWORD (cross-seller)
//
// If any required credential is missing the script SKIPs safely — it does not
// attempt signup.
//
// Scope: Phase 10 RPCs — submit_review, listing_review_summary,
// seller_review_summary, listing_reviews, seller_reviews,
// listing_review_distribution — plus the INSERT lockdown on public.reviews,
// per-order-item uniqueness, ORDER_NOT_COMPLETED / FORBIDDEN /
// SELLER_SELF_REVIEW_NOT_ALLOWED guards, and aggregate correctness. Orders are
// brought to `completed` through the real Phase 8 (create/confirm) and Phase 9
// (payment + fulfillment) RPCs — never via service-role or a status UPDATE.
//
// SELLER_SELF_REVIEW_NOT_ALLOWED is defense-in-depth and unreachable through
// the public API: Phase 8 already forbids self-purchase
// (SELF_PURCHASE_NOT_ALLOWED), so no account with a seller profile for an item
// can ever complete a purchase of it. This script asserts the reachable guard
// (a seller account attempting to review a buyer's item is FORBIDDEN) and
// keeps the untestable branch documented in RATINGS_AND_REVIEWS.md.
//
// Retention note: orders that pass 'confirmed' have no client-side delete path
// (the transaction record is intentionally permanent), so the happy-path
// orders end COMPLETED (with the reviews + retained listing) and are kept —
// exactly as Phase 8/9 retained their completed orders. Only the pending
// negative-order is cancelled + deleted, along with its cleanable listing.
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
  console.error('SKIPPED: hosted Phase 10 verification requires confirmed reusable test accounts.')
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
  console.log('== Phase 10 hosted verification (ratings & reviews) ==')
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
        description: 'Isolated Phase 10 verification listing.',
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

  // Grabs the single order_item id of an order through participant RLS.
  async function orderItemId(orderId) {
    const { data, error } = await buyer.c
      .from('order_items')
      .select('id, product_title, seller_id, listing_id')
      .eq('order_id', orderId)
      .single()
    if (error != null) throw new Error(`could not read order item for ${orderId}: ${error.message}`)
    return data
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

    // 1b. Probe that the Phase 10 RPCs are live on the hosted project.
    const probe = await runRpc(buyer.c, 'listing_review_summary', {
      p_listing_id: '00000000-0000-0000-0000-000000000000',
    })
    if (probe.error != null && /PGRST202|could not find the function/i.test(String(probe.error.code ?? probe.error.message))) {
      console.error('BLOCKED: Phase 10 review RPCs are not present on the hosted project.')
      console.error('Apply the Phase 10 migrations (20260907*_phase10_*.sql) first.')
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

    // 3. Test listings.
    const LD = await createListing({ title: `Phase 10 review happy ${runId}`, quantity: 10 })
    const LC = await createListing({ title: `Phase 10 pending negative ${runId}`, quantity: 2 })
    check('seller owns active test listings', LD.listing_status === 'active' && LC.listing_status === 'active')
    retainedListings.push(LD.id)

    // ----------------------------------------------------------------------
    // SECTION A — bring two orders to `completed` through the real Phase 8/9
    //             workflow (one delivery/manual-transfer, one pickup/cash)
    // ----------------------------------------------------------------------
    console.log('\n-- A. Completed orders (real Phase 8/9 workflow) --')
    const D1 = await orderByBuyer(LD.id, 'delivery')
    check('delivery order created (Phase 8)', D1.status === 'pending', toText(D1.status))
    const D1c = await confirmOrder(D1.id)
    check('seller confirmed the delivery order', D1c.status === 'confirmed', toText(D1c.status))

    const d1ProofPath = `${buyer.user.id}/${D1.id}/proof.png`
    proofPaths.push(d1ProofPath)
    const D1submit = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: D1.id,
      p_payment_method: 'manual_transfer',
      p_proof_path: d1ProofPath,
      p_reference: 'P10-RUN',
      ...deliverySnapshot,
    })
    check('buyer submitted a manual-transfer payment (Phase 9)', D1submit.data?.status === 'submitted', toText(D1submit.data))
    const uploadD1 = await buyer.c.storage.from(PROOF_BUCKET).upload(d1ProofPath, ONE_PIXEL_PNG, {
      contentType: 'image/png',
      upsert: true,
    })
    check('proof object uploadable for the happy path', uploadD1.error == null, uploadD1.error?.message)
    const D1approve = await runRpc(seller.c, 'review_payment', {
      p_payment_id: D1submit.data.id,
      p_decision: 'approve',
    })
    check('seller approved the payment', D1approve.data?.status === 'paid', toText(D1approve.data))
    const D1prep = await runRpc(seller.c, 'start_order_preparation', { p_order_id: D1.id })
    check('seller started preparation', D1prep.data?.status === 'preparing', toText(D1prep.data))
    const D1ship = await runRpc(seller.c, 'mark_order_shipped', {
      p_order_id: D1.id,
      p_courier: 'J&T Express',
      p_tracking_number: 'JT10-0001',
    })
    check('seller shipped the order', D1ship.data?.status === 'shipped', toText(D1ship.data))
    const D1done = await runRpc(buyer.c, 'confirm_order_received', { p_order_id: D1.id })
    check('buyer completed the delivery order', D1done.data?.status === 'completed', toText(D1done.data))

    const P1 = await orderByBuyer(LD.id, 'pickup')
    check('pickup order created (Phase 8)', P1.status === 'pending', toText(P1.status))
    const P1c = await confirmOrder(P1.id)
    check('seller confirmed the pickup order', P1c.status === 'confirmed', toText(P1c.status))
    const P1submit = await runRpc(buyer.c, 'submit_payment', {
      p_order_id: P1.id,
      p_payment_method: 'cash_on_pickup',
    })
    check('buyer selected cash on pickup (Phase 9)', P1submit.data?.status === 'pending', toText(P1submit.data))
    const P1prep = await runRpc(seller.c, 'start_order_preparation', { p_order_id: P1.id })
    check('seller started cash preparation', P1prep.data?.status === 'preparing', toText(P1prep.data))
    const P1ready = await runRpc(seller.c, 'mark_order_ready_for_pickup', { p_order_id: P1.id })
    check('seller marked the pickup order ready', P1ready.data?.status === 'ready_for_pickup', toText(P1ready.data))
    const P1cash = await runRpc(seller.c, 'mark_cash_received', { p_payment_id: P1submit.data.id })
    check('seller recorded the collected cash', P1cash.data?.status === 'paid', toText(P1cash.data))
    const P1done = await runRpc(buyer.c, 'confirm_order_received', { p_order_id: P1.id })
    check('buyer completed the pickup order', P1done.data?.status === 'completed', toText(P1done.data))

    // Order items backing the two completed orders.
    const D1item = await orderItemId(D1.id)
    const P1item = await orderItemId(P1.id)
    check('delivery order item bound to the seller + listing', D1item.seller_id === sellerId && D1item.listing_id === LD.id, toText(D1item))
    check('pickup order item bound to the seller + listing', P1item.seller_id === sellerId && P1item.listing_id === LD.id, toText(P1item))

    // Pending order for negative "not completed" + cleanup path.
    const C1 = await orderByBuyer(LC.id, 'pickup')
    pendingOrders.push({ orderId: C1.id, buyerClient: buyer.c })
    const C1item = await orderItemId(C1.id)
    check('buyer created a pending order for the negative checks', C1.status === 'pending', toText(C1.status))

    // ----------------------------------------------------------------------
    // SECTION B — submit_review happy path (delivery item)
    // ----------------------------------------------------------------------
    console.log('\n-- B. Verified review happy path --')
    const rev1 = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 5,
      p_seller_rating: 4,
      p_comment: 'Amazing paddle, exactly as described. Thank you!',
    })
    check('buyer submits a verified review', rev1.error == null && (rev1.data?.id ?? rev1.data?.order_item_id) != null, toText(rev1.error ?? rev1.data))
    check(
      'review is published immediately',
      rev1.data?.status === 'approved',
      toText(rev1.data?.status),
    )
    check(
      'reviewer/seller/listing are derived from the order item',
      rev1.data?.reviewer_id === buyer.user.id &&
        rev1.data?.seller_id === sellerId &&
        rev1.data?.listing_id === LD.id &&
        rev1.data?.order_item_id === D1item.id &&
        rev1.data?.order_id === D1.id,
      toText(rev1.data),
    )
    check(
      'rating and seller rating persisted',
      rev1.data?.rating === 5 && rev1.data?.seller_rating === 4,
      toText({ rating: rev1.data?.rating, seller_rating: rev1.data?.seller_rating }),
    )

    // The client cannot choose the review subject — the reviewer/seller/
    // listing are always derived from the order item. Extra client-supplied
    // subject params are meaningless (PostgREST either rejects the unknown
    // key or the duplicate branch fires); the derived-fields assertion above
    // proves the subject is authoritative.
    const spoof = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 1,
      p_seller_rating: 1,
      p_comment: '',
      p_reviewer_id: stranger.user.id,
      p_seller_id: '00000000-0000-0000-0000-000000000000',
    })
    check('review subject cannot be spoofed by extra params', spoof.error != null, spoof.error?.message ?? 'unexpectedly succeeded')

    const dupe = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 4,
      p_seller_rating: 3,
      p_comment: 'Second attempt',
    })
    expectRpcCode('one review per order item (duplicate rejected)', dupe, 'REVIEW_ALREADY_EXISTS')

    // The buyer can read their own review row (public approved anyway).
    const { data: ownRows } = await buyer.c.from('reviews').select('*').eq('order_item_id', D1item.id)
    check('buyer reads the single published review row', (ownRows ?? []).length === 1 && ownRows[0].status === 'approved', toText(ownRows))
    const { data: strangerSeesReview } = await stranger.c.from('reviews').select('id, comment').eq('order_item_id', D1item.id)
    check('approved review is publicly readable', (strangerSeesReview ?? []).length === 1, toText(strangerSeesReview))
    const { data: anonSeesReview } = await anonClient.from('reviews').select('id').eq('order_item_id', D1item.id)
    check('anonymous visitor reads the published review', (anonSeesReview ?? []).length === 1, toText(anonSeesReview))

    // ----------------------------------------------------------------------
    // SECTION C — second item review + comment normalization
    // ----------------------------------------------------------------------
    console.log('\n-- C. Second order item + comment normalization --')
    const rev2 = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: P1item.id,
      p_rating: 4,
      p_seller_rating: 3,
      p_comment: '   ',
    })
    check('second order item is reviewable independently', rev2.error == null && rev2.data?.order_item_id === P1item.id, toText(rev2.error ?? rev2.data))
    check(
      'blank comment is normalized to NULL',
      rev2.data?.comment == null,
      toText(rev2.data?.comment),
    )
    const allReviews = await buyer.c.from('reviews').select('id, comment').eq('order_id', D1.id)
    check('per-order review count matches order items reviewed', (allReviews.data ?? []).length === 1)
    const emptyCommentReview = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: P1item.id,
      p_rating: 4,
      p_seller_rating: 3,
      p_comment: null,
    })
    expectRpcCode('duplicate rejected for the second item', emptyCommentReview, 'REVIEW_ALREADY_EXISTS')

    // ----------------------------------------------------------------------
    // SECTION D — validation + authorization failures (consume nothing)
    // ----------------------------------------------------------------------
    console.log('\n-- D. Validation and authorization guards --')
    const anonSubmit = await runRpc(anonClient, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 5,
      p_seller_rating: 5,
      p_comment: 'x',
    })
    expectRpcCode('anonymous reviewer is rejected', anonSubmit, 'AUTH_REQUIRED')

    const missingItem = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: '00000000-0000-0000-0000-000000000000',
      p_rating: 5,
      p_seller_rating: 5,
      p_comment: 'x',
    })
    expectRpcCode('unknown order item is rejected', missingItem, 'ORDER_ITEM_NOT_FOUND')

    const notCompleted = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: C1item.id,
      p_rating: 5,
      p_seller_rating: 5,
      p_comment: 'x',
    })
    expectRpcCode('pending order item cannot be reviewed', notCompleted, 'ORDER_NOT_COMPLETED')

    const strangerReview = await runRpc(stranger.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 5,
      p_seller_rating: 5,
      p_comment: 'x',
    })
    expectRpcCode('stranger cannot review another buyer order item', strangerReview, 'FORBIDDEN')

    const sellerReview = await runRpc(seller.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 5,
      p_seller_rating: 5,
      p_comment: 'x',
    })
    expectRpcCode('seller cannot review the buyer order item', sellerReview, 'FORBIDDEN')

    const badRating = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 0,
      p_seller_rating: 5,
      p_comment: 'x',
    })
    expectRpcCode('rating below 1 is rejected', badRating, 'INVALID_RATING')
    const highRating = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 6,
      p_seller_rating: 5,
      p_comment: 'x',
    })
    expectRpcCode('rating above 5 is rejected', highRating, 'INVALID_RATING')
    const nullRating = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: null,
      p_seller_rating: 5,
      p_comment: 'x',
    })
    expectRpcCode('null rating is rejected', nullRating, 'INVALID_RATING')

    const badSellerRating = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 5,
      p_seller_rating: 0,
      p_comment: 'x',
    })
    expectRpcCode('seller rating below 1 is rejected', badSellerRating, 'INVALID_SELLER_RATING')
    const highSellerRating = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 5,
      p_seller_rating: 7,
      p_comment: 'x',
    })
    expectRpcCode('seller rating above 5 is rejected', highSellerRating, 'INVALID_SELLER_RATING')

    const longComment = await runRpc(buyer.c, 'submit_review', {
      p_order_item_id: D1item.id,
      p_rating: 5,
      p_seller_rating: 5,
      p_comment: 'x'.repeat(2001),
    })
    expectRpcCode('comment over 2000 characters is rejected', longComment, 'INVALID_REVIEW_TEXT')

    // ----------------------------------------------------------------------
    // SECTION E — server-side aggregates (listing + seller + distribution)
    // ----------------------------------------------------------------------
    console.log('\n-- E. Server-side aggregates --')
    const { data: ls1 } = await runRpc(buyer.c, 'listing_review_summary', { p_listing_id: LD.id })
    const ls1row = (ls1 ?? [])[0] ?? {}
    check('listing summary reflects both reviews', ls1row.review_count === 2 && Number(ls1row.average_rating) === 4.5, toText(ls1))

    // Seller-level aggregates are cumulative across verifier runs (the seller
    // account is reused and every completed run adds reviews), so the
    // expectation is derived from the underlying public approved rows rather
    // than a fixed count.
    const { data: allSellerReviews } = await buyer.c
      .from('reviews')
      .select('rating, seller_rating')
      .eq('seller_id', sellerId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
    const expectedSellerCount = (allSellerReviews ?? []).length
    const expectedSellerAvg = Math.round(
      ((allSellerReviews ?? []).reduce((sum, r) => sum + Number(r.seller_rating), 0) / expectedSellerCount) * 100,
    ) / 100
    const { data: ss1 } = await runRpc(buyer.c, 'seller_review_summary', { p_seller_id: sellerId })
    const ss1row = (ss1 ?? [])[0] ?? {}
    check(
      'seller summary uses seller_rating and matches the public rows',
      ss1row.review_count === expectedSellerCount && Number(ss1row.average_rating) === expectedSellerAvg,
      toText({ ss1, expectedSellerCount, expectedSellerAvg }),
    )
    const { data: dist } = await runRpc(buyer.c, 'listing_review_distribution', { p_listing_id: LD.id })
    const distMap = Object.fromEntries((dist ?? []).map((row) => [row.rating_value, row.review_count]))
    check(
      'distribution is exact',
      distMap['5'] === 1 && distMap['4'] === 1 && distMap['3'] === undefined,
      toText(dist),
    )

    const { data: list1 } = await runRpc(buyer.c, 'listing_reviews', {
      p_listing_id: LD.id,
      p_page: 1,
      p_page_size: 10,
    })
    check(
      'listing_reviews returns both published reviews without private columns',
      (list1 ?? []).length === 2 &&
        list1.every((r) => r.reviewer_id === undefined && r.order_id === undefined && r.buyer_id === undefined) &&
        list1.every((r) => r.listing_title === LD.title && r.reviewer_name != null),
      toText(list1),
    )
    const sortedList = (list1 ?? []).sort((a, b) => b.rating - a.rating)
    check(
      'listing review rows carry product + seller ratings',
      sortedList[0].rating === 5 && sortedList[0].seller_rating === 4 &&
        sortedList[1].rating === 4 && sortedList[1].seller_rating === 3,
      toText(list1),
    )
    const { data: sList } = await runRpc(buyer.c, 'seller_reviews', {
      p_seller_id: sellerId,
      p_page: 1,
      p_page_size: 20,
    })
    check(
      'seller_reviews lists the seller reviews with listing titles',
      (sList ?? []).length === expectedSellerCount &&
        (sList ?? []).every((r) => r.listing_title != null) &&
        (sList ?? []).some((r) => r.listing_title === LD.title),
      toText(sList),
    )

    // Pagination: page size 1 returns one row at a time, no overlap.
    const { data: p1 } = await runRpc(buyer.c, 'listing_reviews', { p_listing_id: LD.id, p_page: 1, p_page_size: 1 })
    const { data: p2 } = await runRpc(buyer.c, 'listing_reviews', { p_listing_id: LD.id, p_page: 2, p_page_size: 1 })
    const pageIds = [...(p1 ?? []), ...(p2 ?? [])].map((r) => r.id).sort()
    const allIds = (list1 ?? []).map((r) => r.id).sort()
    check('review lists paginate without overlap or loss', p1?.length === 1 && p2?.length === 1 && JSON.stringify(pageIds) === JSON.stringify(allIds), toText({ p1, p2 }))

    const emptyPage = await runRpc(buyer.c, 'listing_reviews', { p_listing_id: LD.id, p_page: 9, p_page_size: 10 })
    check('empty page beyond the data is an empty list', (emptyPage.data ?? []).length === 0, toText(emptyPage.data))

    // ----------------------------------------------------------------------
    // SECTION F — direct-attack / permission hardening
    // ----------------------------------------------------------------------
    console.log('\n-- F. Direct attack / permission hardening --')
    const directInsert = await buyer.c.from('reviews').insert({
      order_item_id: D1item.id,
      order_id: D1.id,
      reviewer_id: buyer.user.id,
      seller_id: sellerId,
      listing_id: LD.id,
      rating: 5,
      seller_rating: 5,
      comment: 'I hacked the rating',
      status: 'approved',
    })
    check('direct reviews INSERT denied for the buyer', directInsert.error != null, directInsert.error?.message ?? 'unexpected success')

    const strangerInsert = await stranger.c.from('reviews').insert({
      order_item_id: P1item.id,
      order_id: D1.id,
      reviewer_id: stranger.user.id,
      seller_id: sellerId,
      listing_id: LD.id,
      rating: 1,
      seller_rating: 1,
      status: 'approved',
    })
    check('direct reviews INSERT denied for the stranger', strangerInsert.error != null, strangerInsert.error?.message ?? 'unexpected success')

    const anonInsert = await anonClient.from('reviews').insert({
      order_item_id: D1item.id,
      order_id: D1.id,
      reviewer_id: null,
      seller_id: sellerId,
      listing_id: LD.id,
      rating: 5,
      seller_rating: 5,
      status: 'approved',
    })
    check('direct reviews INSERT denied for anon', anonInsert.error != null, anonInsert.error?.message ?? 'unexpected success')

    const revRow = await buyer.c.from('reviews').select('id, rating, seller_rating').eq('order_item_id', D1item.id).single()
    const buyerUpdate = await buyer.c.from('reviews').update({ rating: 1, status: 'approved' }).eq('id', revRow.data?.id)
    check('review UPDATE attempt does not error past RLS', buyerUpdate.error == null, buyerUpdate.error?.message)
    const { data: afterBuyerUpdate } = await buyer.c.from('reviews').select('rating, seller_rating, status').eq('order_item_id', D1item.id).single()
    check(
      'review UPDATE denied for the buyer (row unchanged)',
      afterBuyerUpdate?.rating === 5 && afterBuyerUpdate?.seller_rating === 4 && afterBuyerUpdate?.status === 'approved',
      toText(afterBuyerUpdate),
    )
    const buyerDelete = await buyer.c.from('reviews').delete().eq('id', revRow.data?.id)
    check('review DELETE attempt does not error past RLS', buyerDelete.error == null, buyerDelete.error?.message)
    const { data: afterBuyerDelete } = await buyer.c.from('reviews').select('id').eq('order_item_id', D1item.id)
    check('review DELETE denied for the buyer (row survives)', (afterBuyerDelete ?? []).length === 1, toText(afterBuyerDelete))

    // Review submission must not touch the underlying order/fulfillment.
    const { data: d1AfterReview } = await buyer.c.from('orders').select('status, completed_at, total').eq('id', D1.id).single()
    check(
      'order untouched by the review',
      d1AfterReview?.status === 'completed' && d1AfterReview?.total === D1.total && d1AfterReview?.completed_at != null,
      toText(d1AfterReview),
    )

    // ----------------------------------------------------------------------
    // SECTION G — cross-user isolation (public reviews, private writes)
    // ----------------------------------------------------------------------
    console.log('\n-- G. Cross-user isolation --')
    if (hasBuyerB && buyerB != null) {
      const bBwrite = await runRpc(buyerB.c, 'submit_review', {
        p_order_item_id: D1item.id,
        p_rating: 1,
        p_seller_rating: 1,
        p_comment: 'not my order',
      })
      expectRpcCode('Buyer B cannot review Buyer A order item', bBwrite, 'FORBIDDEN')
      const bBread = await buyerB.c.from('reviews').select('id').eq('order_item_id', D1item.id)
      check('Buyer B reads the public review row', (bBread.data ?? []).length === 1, toText(bBread.data))
    } else {
      skip('cross-buyer review deny (requires PHASE8_TEST_BUYER_B_*)')
    }

    if (hasSellerB && sellerB != null) {
      const sBwrite = await runRpc(sellerB.c, 'submit_review', {
        p_order_item_id: D1item.id,
        p_rating: 1,
        p_seller_rating: 1,
        p_comment: 'not my order',
      })
      expectRpcCode('Seller B cannot review Seller A order item', sBwrite, 'FORBIDDEN')
      const { data: sBsum } = await runRpc(sellerB.c, 'seller_review_summary', { p_seller_id: sellerId })
      check(
        'Seller B can query the public seller aggregate',
        ((sBsum ?? [])[0] ?? {})?.review_count === expectedSellerCount,
        toText(sBsum),
      )
    } else {
      skip('cross-seller review deny (requires PHASE8_TEST_SELLER_B_*)')
    }

    // ----------------------------------------------------------------------
    // SECTION H — Seller-side review visibility (Phase 10 extension)
    // ----------------------------------------------------------------------
    console.log('\n-- H. Seller-side review visibility --')

    // H1. The auth-derived seller RPCs are live on the hosted project.
    const sellerList1 = await runRpc(seller.c, 'get_my_seller_reviews', {
      p_page: 1,
      p_page_size: 20,
      p_rating: null,
      p_sort: 'newest',
    })
    check(
      'get_my_seller_reviews is callable by the seller',
      sellerList1.error == null,
      sellerList1.error?.message ?? 'unexpected success',
    )
    const sellerReviews = sellerList1.data ?? []
    check(
      'Seller A reads own approved reviews',
      (sellerReviews ?? []).length === expectedSellerCount,
      toText(sellerReviews),
    )
    check(
      'seller review rows carry the run listing',
      (sellerReviews ?? []).some(
        (r) => r.listing_title === LD.title && r.listing_id === LD.id,
      ),
      toText(sellerReviews),
    )

    // H2. Private data is never exposed to the seller.
    const privateColumns = ['email', 'phone', 'address', 'payment_reference', 'proof_path', 'reviewer_id', 'order_id', 'buyer_id']
    const leakedKey = (sellerReviews ?? []).some((r) =>
      privateColumns.some((col) => r[col] !== undefined && r[col] !== null),
    )
    check('seller review list exposes no private customer fields', !leakedKey, toText(sellerReviews))
    check(
      'seller review list carries only safe identity + product info',
      (sellerReviews ?? []).every(
        (r) => r.reviewer_name != null && r.listing_title != null && r.rating >= 1 && r.rating <= 5,
      ),
      toText(sellerReviews),
    )
    const myRows = (sellerReviews ?? []).filter((r) => r.listing_id === LD.id)
    check(
      'run reviews show safe customer name + product ratings',
      myRows.length >= 1 && myRows.every((r) => r.reviewer_name != null && r.rating >= 1 && r.rating <= 5),
      toText(myRows),
    )
    check(
      'published review text is included when present',
      myRows.some((r) => r.comment != null && r.comment.length > 0),
      toText(myRows),
    )

    // H3. Rating summary matches the public aggregate exactly.
    const mySummary = await runRpc(seller.c, 'get_my_seller_rating_summary', {})
    const mySummaryRow = (mySummary.data ?? [])[0] ?? {}
    check(
      'seller rating summary is authoritative and matches public rows',
      Number(mySummaryRow.review_count) === expectedSellerCount &&
        Number(mySummaryRow.average_rating) === expectedSellerAvg,
      toText(mySummary),
    )

    // H4. Rating distribution is exact for the auth-derived seller.
    const myDist = await runRpc(seller.c, 'get_my_seller_rating_distribution', {})
    const myDistMap = Object.fromEntries((myDist.data ?? []).map((row) => [row.rating_value, row.review_count]))
    check(
      'seller rating distribution is exact',
      Number(myDistMap['4'] ?? 0) === (allSellerReviews ?? []).filter((r) => Number(r.rating) === 4).length &&
        Number(myDistMap['5'] ?? 0) === (allSellerReviews ?? []).filter((r) => Number(r.rating) === 5).length,
      toText({ myDist, expectedSellerCount }),
    )

    // H5. Rating filter + sort are applied database-side.
    const fiveOnly = await runRpc(seller.c, 'get_my_seller_reviews', {
      p_page: 1,
      p_page_size: 20,
      p_rating: 5,
      p_sort: 'newest',
    })
    check(
      'seller review rating filter works (5-star only)',
      (fiveOnly.data ?? []).length > 0 && (fiveOnly.data ?? []).every((r) => r.rating === 5),
      toText(fiveOnly),
    )
    const sortedHigh = await runRpc(seller.c, 'get_my_seller_reviews', {
      p_page: 1,
      p_page_size: 20,
      p_rating: null,
      p_sort: 'highest',
    })
    const ratingsHigh = (sortedHigh.data ?? []).map((r) => Number(r.rating))
    const sortedHighOk =
      ratingsHigh.length > 1
        ? ratingsHigh.every((v, i) => i === 0 || ratingsHigh[i - 1] >= v)
        : true
    check('seller review sort (highest rating) is database-ordered', sortedHighOk, toText(ratingsHigh))

    // H6. Pagination: page size 1 returns one page at a time without loss.
    if (expectedSellerCount >= 2) {
      const sp1 = await runRpc(seller.c, 'get_my_seller_reviews', {
        p_page: 1, p_page_size: 1, p_rating: null, p_sort: 'newest',
      })
      const sp2 = await runRpc(seller.c, 'get_my_seller_reviews', {
        p_page: 2, p_page_size: 1, p_rating: null, p_sort: 'newest',
      })
      const spIds = [...(sp1.data ?? []), ...(sp2.data ?? [])].map((r) => r.id).sort()
      const allSellerIds = (sellerReviews ?? []).map((r) => r.id).sort()
      check(
        'seller review list paginates without overlap or loss',
        (sp1.data ?? []).length === 1 &&
          (sp2.data ?? []).length === 1 &&
          spIds.length === 2 &&
          allSellerIds.includes(spIds[0]) &&
          allSellerIds.includes(spIds[1]) &&
          spIds[0] !== spIds[1],
        toText({ sp1: sp1.data, sp2: sp2.data }),
      )
    } else {
      skip('seller review pagination (needs 2+ reviews for the seller)')
    }

    // H7. Seller READ-ONLY: direct UPDATE and DELETE must be denied.
    const sellerReviewRowId = revRow?.data?.id ?? null
    if (sellerReviewRowId != null) {
      const sUpdate = await seller.c.from('reviews').update({ rating: 1 }).eq('id', sellerReviewRowId)
      check('review UPDATE attempt does not error past RLS for the seller', sUpdate.error == null, sUpdate.error?.message)
      const { data: afterSUpdate } = await seller.c.from('reviews').select('rating, seller_rating, reviewer_id, listing_id').eq('id', sellerReviewRowId).single()
      check(
        'seller cannot edit the review rating (row unchanged)',
        afterSUpdate?.rating === 5 && afterSUpdate?.seller_rating === 4,
        toText(afterSUpdate),
      )
      const sDelete = await seller.c.from('reviews').delete().eq('id', sellerReviewRowId)
      check('review DELETE attempt does not error past RLS for the seller', sDelete.error == null, sDelete.error?.message)
      const { data: afterSDelete } = await seller.c.from('reviews').select('id').eq('id', sellerReviewRowId)
      check('seller cannot delete a customer review (row survives)', (afterSDelete ?? []).length === 1, toText(afterSDelete))

      // Reassignment attacks (change ownership / subject) must no-op.
      const sReassign = await seller.c
        .from('reviews')
        .update({ reviewer_id: stranger.user.id, listing_id: LC.id })
        .eq('id', sellerReviewRowId)
      check('review reassignment attempt does not error past RLS for the seller', sReassign.error == null, sReassign.error?.message)
      const { data: afterSReassign } = await seller.c.from('reviews').select('reviewer_id, listing_id').eq('id', sellerReviewRowId).single()
      check(
        'seller cannot change review ownership or listing',
        afterSReassign?.reviewer_id === buyer.user.id && afterSReassign?.listing_id === LD.id,
        toText(afterSReassign),
      )
    } else {
      skip('seller direct-update/delete/reassign (no review row id available)')
    }

    // H8. Multi-seller review isolation.
    if (hasSellerB && sellerB != null) {
      const sellerBMyReviews = await runRpc(sellerB.c, 'get_my_seller_reviews', {
        p_page: 1,
        p_page_size: 20,
        p_rating: null,
        p_sort: 'newest',
      })
      const sBIds = (sellerBMyReviews.data ?? []).map((r) => r.id)
      const sAIds = (sellerReviews ?? []).map((r) => r.id)
      const overlap = sBIds.filter((id) => sAIds.includes(id))
      check(
        'Seller B does not receive Seller A reviews in the seller dashboard query',
        overlap.length === 0,
        toText({ overlap, sBIds }),
      )
      const { data: sBProfileRow } = await sellerB.c
        .from('seller_profiles')
        .select('id')
        .eq('user_id', sellerB.user.id)
        .maybeSingle()
      const sellerBId = sBProfileRow?.id ?? null
      const sellerBReview = await runRpc(sellerB.c, 'get_my_seller_reviews', {
        p_page: 1,
        p_page_size: 20,
        p_rating: null,
        p_sort: 'newest',
      })
      const sBSummary = await runRpc(sellerB.c, 'get_my_seller_rating_summary', {})
      const sBSumRow = (sBSummary.data ?? [])[0] ?? {}
      const { data: sBPublicCount } = await buyer.c
        .from('reviews')
        .select('id')
        .eq('seller_id', sellerBId)
        .eq('status', 'approved')
      check(
        'Seller B rating summary matches their own public rows',
        Number(sBSumRow.review_count) === (sBPublicCount ?? []).length,
        toText({ sBSumRow, sBPublicCount: (sBPublicCount ?? []).length }),
      )
      check(
        'Seller B review list matches their own public rows',
        (sellerBReview.data ?? []).length === (sBPublicCount ?? []).length,
        toText(sellerBReview.data),
      )
    } else {
      skip('multi-seller review isolation (requires PHASE8_TEST_SELLER_B_*)')
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
    // Best-effort cleanup even on failure: cancel+delete pending orders,
    // delete proof objects the buyer can still delete, remove listings that
    // no longer back a retained order, sign out.
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
  console.error(`FAIL: Phase 10 hosted verification crashed: ${err.stack ?? err.message}`)
  process.exitCode = 1
})