import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// PHASE 8 HOSTED VERIFICATION
// ============================================================================
// Verifies the Phase 8 order + transaction AND cart + multi-seller checkout
// systems against the hosted Supabase project using REUSABLE, CONFIRMED test
// accounts configured via environment variables. It NEVER creates Auth users:
// it only signs in with the provided credentials, runs the order/cart/RLS/
// atomicity scenarios, cleans up every row it created (through the supported
// production RPCs), and leaves the Auth accounts intact for future runs.
//
// Required credentials (local only — never commit real values):
//   PHASE7_TEST_SELLER_EMAIL / PHASE7_TEST_SELLER_PASSWORD
//   PHASE7_TEST_BUYER_EMAIL  / PHASE7_TEST_BUYER_PASSWORD
//   PHASE7_TEST_STRANGER_EMAIL / PHASE7_TEST_STRANGER_PASSWORD
//   PHASE8_TEST_BUYER_B_EMAIL / PHASE8_TEST_BUYER_B_PASSWORD  (concurrency)
//
// Optional credentials — the multi-seller checkout section runs only when set
// (otherwise it SKIPs):
//   PHASE8_TEST_SELLER_B_EMAIL / PHASE8_TEST_SELLER_B_PASSWORD
//
// If any required credential is missing the script SKIPS safely — it does not
// attempt signup.
//
// Scope boundary: only the Phase 8 statuses are exercised (pending, confirmed,
// cancelled). paid/preparing/shipped/ready_for_pickup/completed/disputed are
// Phase 9 and are intentionally not implemented or tested here.
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
  'PHASE8_TEST_BUYER_B_EMAIL',
  'PHASE8_TEST_BUYER_B_PASSWORD',
]

const missing = REQUIRED_CREDS.filter((name) => !env[name])
if (missing.length > 0) {
  console.error('SKIPPED: hosted Phase 8 verification requires confirmed reusable test accounts.')
  console.error('')
  console.error('Missing (reuses the confirmed Phase 7 accounts where possible):')
  for (const name of missing) console.error(`  ${name}`)
  process.exit(2)
}

const sellerEmail = env.PHASE7_TEST_SELLER_EMAIL
const sellerPassword = env.PHASE7_TEST_SELLER_PASSWORD
const buyerAEmail = env.PHASE7_TEST_BUYER_EMAIL
const buyerAPassword = env.PHASE7_TEST_BUYER_PASSWORD
const strangerEmail = env.PHASE7_TEST_STRANGER_EMAIL
const strangerPassword = env.PHASE7_TEST_STRANGER_PASSWORD
const buyerBEmail = env.PHASE8_TEST_BUYER_B_EMAIL
const buyerBPassword = env.PHASE8_TEST_BUYER_B_PASSWORD

// Unique run id isolates every row created by this run so reruns never collide.
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

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

function toText(v) {
  return JSON.stringify(v)
}

// Classifies a GoTrue sign-in failure so operators can act quickly.
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

async function main() {
  console.log('== Phase 8 hosted verification (orders + transactions + cart + checkout) ==')
  console.log(`Run id: ${runId}`)
  console.log(`Accounts (emails only): ${sellerEmail}, ${buyerAEmail}, ${buyerBEmail}, ${strangerEmail}`)

  let seller = null
  let buyerA = null
  let buyerB = null
  let stranger = null
  let sellerB = null
  let sellerId = null
  let sellerBId = null
  let category = null
  let brand = null

  // Rows this run creates (for cleanup).
  const pendingOrders = [] // { orderId, buyerClient }
  const cancelledOrders = [] // { orderId, buyerClient }
  const deletableListings = []
  const deletableListingsB = [] // listings created by the optional Seller B
  // Cart lines this run creates (removed in cleanup via the owner's RLS path).
  const cartItems = [] // { id, buyerClient }
  // Confirmed order + its listing have no client-side delete path (Phase 8
  // keeps the transaction record); they are intentionally retained and the
  // listing row must survive to satisfy the order_item FK.
  let retainedOrder = null
  let retainedListing = null

  async function createListing({
    title,
    price,
    quantity,
    listingStatus,
    pickupAvailable = true,
    deliveryAvailable = true,
  }) {
    const { data: listing, error } = await seller.c
      .from('listings')
      .insert({
        seller_id: sellerId,
        category_id: category.id,
        brand_id: brand?.id ?? null,
        title,
        description: 'Isolated Phase 8 verification listing.',
        listing_condition: 'like_new',
        price,
        quantity,
        listing_status: listingStatus,
        pickup_available: pickupAvailable,
        delivery_available: deliveryAvailable,
      })
      .select('id, title, listing_status, quantity, price, seller_id')
      .single()
    if (error != null) throw new Error(`could not create test listing: ${error.message}`)
    deletableListings.push(listing.id)
    return listing
  }

  async function listingStock(listingId) {
    const { data } = await seller.c
      .from('listings')
      .select('quantity, listing_status')
      .eq('id', listingId)
      .single()
    return data ?? null
  }

  try {
    // 1. Sign in all four reusable accounts. No signup, no new Auth users.
    seller = await signIn('seller', sellerEmail, sellerPassword)
    buyerA = await signIn('buyer A', buyerAEmail, buyerAPassword)
    buyerB = await signIn('buyer B', buyerBEmail, buyerBPassword)
    stranger = await signIn('stranger', strangerEmail, strangerPassword)
    check('seller signs in', seller.user != null)
    check('buyer A signs in', buyerA.user != null)
    check('buyer B signs in', buyerB.user != null)
    check('stranger signs in', stranger.user != null)

    // 1b. Probe that the Phase 8 RPCs are live on the hosted project.
    const probe = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: '00000000-0000-0000-0000-000000000000',
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    })
    if (probe.error != null && /PGRST202|could not find the function/i.test(String(probe.error.code ?? probe.error.message))) {
      console.error('BLOCKED: Phase 8 order RPCs are not present on the hosted project.')
      console.error('Apply supabase/migrations/20260811000001_phase8_order_transactions.sql first.')
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
    const { data: categoryRow } = await buyerA.c.from('categories').select('id').limit(1).single()
    const { data: brandRow } = await buyerA.c.from('brands').select('id').limit(1).maybeSingle()
    category = categoryRow
    brand = brandRow
    if (category == null) throw new Error('no category found — cannot create test listings')

    // 3. Seller owns an active test listing (quantity 3, price 3000).
    const L1 = await createListing({
      title: `Phase 8 valid order ${runId}`,
      price: 3000,
      quantity: 3,
      listingStatus: 'active',
    })
    check(
      'seller owns an active test listing',
      L1 != null && L1.listing_status === 'active' && L1.seller_id === sellerId,
      toText(L1),
    )
    retainedListing = L1
    // L1 is retained (its confirmed order keeps a transaction record with no
    // client delete path), so it must not be swept by the listing cleanup.
    deletableListings.splice(deletableListings.indexOf(L1.id), 1)

    // ----------------------------------------------------------------------
    // 4. VALID ORDER
    // ----------------------------------------------------------------------
    const order1 = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: L1.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
      p_expected_unit_price: 3000,
    })
    check('buyer places valid order', order1.error == null && order1.data?.id != null, order1.error?.message)
    const O1 = order1.data
    if (O1?.id == null) {
      // Report dependent checks as failed rather than crashing on null.id.
      check('order starts in expected status', false, 'skipped — order creation failed')
      check('order buyer equals authenticated buyer A', false, 'skipped — order creation failed')
      check('order seller derived from listing', false, 'skipped — order creation failed')
      throw new Error('order creation failed — cannot continue verification')
    }
    check('order starts in expected status', O1?.status === 'pending', toText(O1?.status))
    check('order buyer equals authenticated buyer A', O1?.buyer_id === buyerA.user.id, toText(O1?.buyer_id))
    check('order seller derived from listing', O1?.seller_id === L1.seller_id, toText(O1?.seller_id))

    const { data: item1 } = await buyerA.c
      .from('order_items')
      .select('listing_id, product_title, unit_price, quantity')
      .eq('order_id', O1.id)
      .single()
    check('order item exists', item1 != null, toText(item1))
    check('unit price snapshot equals trusted listing price', item1?.unit_price === 3000, toText(item1?.unit_price))
    check('order subtotal correct', O1?.subtotal === 3000, toText(O1?.subtotal))
    check('order total correct', O1?.total === 3000, toText(O1?.total))

    const l1After = await listingStock(L1.id)
    check('listing stock decremented from 3 to 2', l1After?.quantity === 2, toText(l1After))
    pendingOrders.push({ orderId: O1.id, buyerClient: buyerA.c })

    // ----------------------------------------------------------------------
    // 4b. LISTING MANAGEMENT PROTECTION — the order RPC may mutate inventory,
    // but a buyer must NEVER gain direct listing-management access.
    // ----------------------------------------------------------------------
    const directBuyerUpdate = await buyerA.c
      .from('listings')
      .update({ quantity: 99 })
      .eq('id', L1.id)
    check(
      'buyer cannot directly update seller listing',
      (directBuyerUpdate.data ?? []).length === 0,
      toText(directBuyerUpdate.data),
    )

    // ----------------------------------------------------------------------
    // 5. BUYER ACCESS
    // ----------------------------------------------------------------------
    const { data: aReads } = await buyerA.c.from('orders').select('id').eq('id', O1.id)
    check('buyer A reads own order', (aReads ?? []).length === 1, toText(aReads))

    const { data: bReads } = await buyerB.c.from('orders').select('id').eq('id', O1.id)
    check('buyer B denied reading buyer A order', (bReads ?? []).length === 0, toText(bReads))

    const { data: sReads } = await stranger.c.from('orders').select('id').eq('id', O1.id)
    check('stranger denied reading order', (sReads ?? []).length === 0, toText(sReads))

    const { data: sItems } = await stranger.c.from('order_items').select('id').eq('order_id', O1.id)
    check('stranger denied reading order items', (sItems ?? []).length === 0, toText(sItems))

    const { data: bItems } = await buyerB.c.from('order_items').select('id').eq('order_id', O1.id)
    check('buyer B denied reading order items', (bItems ?? []).length === 0, toText(bItems))

    // ----------------------------------------------------------------------
    // 6. SELLER ACCESS
    // ----------------------------------------------------------------------
    const { data: sellerReads } = await seller.c.from('orders').select('id').eq('id', O1.id)
    check('owning seller reads the order', (sellerReads ?? []).length === 1, toText(sellerReads))

    const denyConfirm = async (c, label) => {
      const { data, error } = await c.rpc('confirm_marketplace_order', { p_order_id: O1.id })
      check(`${label} cannot confirm as seller`, error != null, error?.message ?? 'unexpected success')
      return { data, error }
    }
    await denyConfirm(buyerB.c, 'buyer B')
    await denyConfirm(stranger.c, 'stranger')
    await denyConfirm(buyerA.c, 'buyer A (non-seller)')

    // ----------------------------------------------------------------------
    // 7. SELF PURCHASE
    // ----------------------------------------------------------------------
    const selfBuy = await seller.c.rpc('create_marketplace_order', {
      p_listing_id: L1.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    })
    check(
      'self-purchase is rejected',
      selfBuy.error != null && /SELF_PURCHASE_NOT_ALLOWED/.test(selfBuy.error.message),
      selfBuy.error?.message,
    )

    // ----------------------------------------------------------------------
    // 8. DIRECT FORGED INSERTS (anon-key clients, no service role)
    // ----------------------------------------------------------------------
    const forgedOrder = await buyerA.c.from('orders').insert({
      order_number: `FAKE-${runId}`,
      buyer_id: buyerA.user.id,
      seller_id: sellerId,
      status: 'completed',
      fulfillment_type: 'pickup',
      subtotal: 1,
      total: 1,
    })
    check('direct forged order insert rejected', forgedOrder.error != null, forgedOrder.error?.message ?? 'unexpected success')

    const forgedItem = await buyerA.c.from('order_items').insert({
      order_id: O1.id,
      listing_id: L1.id,
      seller_id: sellerId,
      product_title: 'forged',
      unit_price: 1,
      quantity: 1,
    })
    check('direct forged order-item insert rejected', forgedItem.error != null, forgedItem.error?.message ?? 'unexpected success')

    // ----------------------------------------------------------------------
    // 9. STATUS FORGERY (pending → completed via direct update)
    // ----------------------------------------------------------------------
    const forgedStatus = await buyerA.c
      .from('orders')
      .update({ status: 'completed' })
      .eq('id', O1.id)
    check('arbitrary status update rejected', forgedStatus.error != null, forgedStatus.error?.message ?? 'unexpected success')
    const { data: o1Status } = await buyerA.c.from('orders').select('status').eq('id', O1.id).single()
    check('order status unchanged after forgery attempt', o1Status?.status === 'pending', toText(o1Status?.status))

    // ----------------------------------------------------------------------
    // 10. INVALID LISTINGS
    // ----------------------------------------------------------------------
    const Ldraft = await createListing({
      title: `Phase 8 draft ${runId}`,
      price: 1000,
      quantity: 5,
      listingStatus: 'draft',
    })
    const draftBuy = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: Ldraft.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    })
    check('draft listing purchase rejected', draftBuy.error != null, draftBuy.error?.message ?? 'unexpected success')

    const Larch = await createListing({
      title: `Phase 8 archived ${runId}`,
      price: 1000,
      quantity: 5,
      listingStatus: 'archived',
    })
    const archBuy = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: Larch.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    })
    check('archived listing purchase rejected', archBuy.error != null, archBuy.error?.message ?? 'unexpected success')

    // Zero-stock: buy the only unit, then attempt a second purchase.
    const Lzero = await createListing({
      title: `Phase 8 zero stock ${runId}`,
      price: 1200,
      quantity: 1,
      listingStatus: 'active',
    })
    const zeroFirst = await buyerB.c.rpc('create_marketplace_order', {
      p_listing_id: Lzero.id,
      p_quantity: 1,
      p_fulfillment_type: 'delivery',
    })
    check('zero-stock scenario: first purchase succeeds', zeroFirst.error == null, zeroFirst.error?.message)
    const Ozero = zeroFirst.data
    if (Ozero?.id == null) {
      throw new Error('zero-stock order creation failed — cannot continue verification')
    }
    pendingOrders.push({ orderId: Ozero.id, buyerClient: buyerB.c })
    const zeroAfter = await listingStock(Lzero.id)
    check('zero-stock listing drops to zero', zeroAfter?.quantity === 0 && zeroAfter?.listing_status === 'sold', toText(zeroAfter))
    const zeroAgain = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: Lzero.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    })
    check('zero-stock purchase rejected', zeroAgain.error != null, zeroAgain.error?.message ?? 'unexpected success')

    // Phase 4 guard: an active listing can never be set to zero stock directly.
    const zeroUpdate = await seller.c.from('listings').update({ quantity: 0 }).eq('id', L1.id)
    check('active listing cannot be set to zero stock', zeroUpdate.error != null, zeroUpdate.error?.message ?? 'unexpected success')

    // ----------------------------------------------------------------------
    // 11. INVALID QUANTITY
    // ----------------------------------------------------------------------
    const qtyZero = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: L1.id,
      p_quantity: 0,
      p_fulfillment_type: 'pickup',
    })
    check('quantity zero rejected', qtyZero.error != null, qtyZero.error?.message ?? 'unexpected success')

    const qtyNeg = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: L1.id,
      p_quantity: -1,
      p_fulfillment_type: 'pickup',
    })
    check('negative quantity rejected', qtyNeg.error != null, qtyNeg.error?.message ?? 'unexpected success')

    const qtyBig = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: L1.id,
      p_quantity: 10,
      p_fulfillment_type: 'pickup',
    })
    check('quantity greater than stock rejected', qtyBig.error != null, qtyBig.error?.message ?? 'unexpected success')

    // ----------------------------------------------------------------------
    // 12. PRICE SPOOFING (expected price is only a comparison, never trusted)
    // ----------------------------------------------------------------------
    const spoofPrice = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: L1.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
      p_expected_unit_price: 1,
    })
    check(
      'price spoofing rejected with PRICE_CHANGED',
      spoofPrice.error != null && /PRICE_CHANGED/.test(spoofPrice.error.message),
      spoofPrice.error?.message,
    )
    // The trusted DB price (3000) was used for O1 regardless — already verified above.

    // ----------------------------------------------------------------------
    // 13. BUYER / SELLER SPOOFING
    // ----------------------------------------------------------------------
    // create_marketplace_order accepts no buyer_id/seller_id args, so client
    // spoofing is impossible through the RPC signature. Attempt to smuggle
    // extra args: PostgREST either rejects the call, or (if it tolerates
    // unknown args) ignores them — in both cases the persisted buyer/seller
    // must still come from auth.uid() and the listing row.
    const smuggle = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: L1.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
      buyer_id: buyerB.user.id,
      seller_id: '00000000-0000-0000-0000-000000000000',
    })
    if (smuggle.error != null) {
      check('buyer/seller spoof impossible through RPC signature', true)
    } else {
      const identitiesOk =
        smuggle.data?.buyer_id === buyerA.user.id && smuggle.data?.seller_id === L1.seller_id
      check('buyer/seller spoof impossible through RPC signature', identitiesOk, toText(smuggle.data))
      if (smuggle.data?.id != null) {
        pendingOrders.push({ orderId: smuggle.data.id, buyerClient: buyerA.c })
      }
    }
    // Persisted identity correctness was verified in the VALID ORDER section
    // (buyer_id === auth.uid(), seller_id === listing.seller_id).

    // ----------------------------------------------------------------------
    // 14. HISTORICAL PRICE SNAPSHOT
    // ----------------------------------------------------------------------
    const priceChange = await seller.c.from('listings').update({ price: 4500 }).eq('id', L1.id)
    check('seller can change listing price after order', priceChange.error == null, priceChange.error?.message)

    const { data: item1Again } = await buyerA.c
      .from('order_items')
      .select('unit_price, quantity')
      .eq('order_id', O1.id)
      .single()
    check('historical unit price remains 3000 after price change', item1Again?.unit_price === 3000, toText(item1Again?.unit_price))
    const { data: o1Total } = await buyerA.c.from('orders').select('subtotal, total').eq('id', O1.id).single()
    check('historical order total still based on 3000', o1Total?.subtotal === 3000 && o1Total?.total === 3000, toText(o1Total))

    // ----------------------------------------------------------------------
    // 15. SELLER CONFIRMATION (pending → confirmed)
    // ----------------------------------------------------------------------
    const confirm = await seller.c.rpc('confirm_marketplace_order', { p_order_id: O1.id })
    check('owning seller can confirm order', confirm.error == null && confirm.data?.status === 'confirmed', confirm.error?.message)
    retainedOrder = confirm.data?.id ?? O1.id

    const confirmAgain = await seller.c.rpc('confirm_marketplace_order', { p_order_id: O1.id })
    check('double confirm rejected (invalid transition)', confirmAgain.error != null, confirmAgain.error?.message ?? 'unexpected success')

    const cancelConfirmed = await buyerA.c.rpc('cancel_marketplace_order', { p_order_id: O1.id })
    check('cancelling confirmed order rejected', cancelConfirmed.error != null, cancelConfirmed.error?.message ?? 'unexpected success')

    // ----------------------------------------------------------------------
    // 16. CANCELLATION (pending → cancelled, exactly-once inventory restore)
    // ----------------------------------------------------------------------
    const L2 = await createListing({
      title: `Phase 8 cancel ${runId}`,
      price: 1500,
      quantity: 2,
      listingStatus: 'active',
    })
    const order2 = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: L2.id,
      p_quantity: 2,
      p_fulfillment_type: 'pickup',
    })
    check('cancel test: order placed', order2.error == null && order2.data?.id != null, order2.error?.message)
    const O2 = order2.data
    if (O2?.id == null) {
      throw new Error('cancel-order creation failed — cannot continue verification')
    }
    pendingOrders.push({ orderId: O2.id, buyerClient: buyerA.c })
    const l2After = await listingStock(L2.id)
    check('cancel test: stock drained to zero', l2After?.quantity === 0 && l2After?.listing_status === 'sold', toText(l2After))

    const cancel1 = await buyerA.c.rpc('cancel_marketplace_order', { p_order_id: O2.id })
    check('first cancellation succeeds', cancel1.error == null && cancel1.data?.status === 'cancelled', cancel1.error?.message)
    cancelledOrders.push({ orderId: O2.id, buyerClient: buyerA.c })
    const l2Restored = await listingStock(L2.id)
    check('cancellation restores inventory to 2', l2Restored?.quantity === 2 && l2Restored?.listing_status === 'active', toText(l2Restored))

    const cancel2 = await buyerA.c.rpc('cancel_marketplace_order', { p_order_id: O2.id })
    check('second cancellation rejected', cancel2.error != null, cancel2.error?.message ?? 'unexpected success')
    const l2After2 = await listingStock(L2.id)
    check('inventory NOT restored a second time', l2After2?.quantity === 2, toText(l2After2))

    // ----------------------------------------------------------------------
    // 17. CANCELLED ORDER DELETE (buyer-only, cancelled-only, no re-restore)
    // ----------------------------------------------------------------------
    const L5 = await createListing({
      title: `Phase 8 delete ${runId}`,
      price: 800,
      quantity: 1,
      listingStatus: 'active',
    })
    const order5 = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: L5.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    })
    check('delete test: order placed', order5.error == null && order5.data?.id != null, order5.error?.message)
    const O5 = order5.data
    if (O5?.id == null) {
      throw new Error('delete-order creation failed — cannot continue verification')
    }
    pendingOrders.push({ orderId: O5.id, buyerClient: buyerA.c })

    const delStranger = await stranger.c.rpc('delete_my_cancelled_order', { p_order_id: O5.id })
    check('stranger cannot delete order', delStranger.error != null, delStranger.error?.message ?? 'unexpected success')

    const cancelO5 = await buyerA.c.rpc('cancel_marketplace_order', { p_order_id: O5.id })
    check('delete test: cancellation succeeds', cancelO5.error == null, cancelO5.error?.message)
    cancelledOrders.push({ orderId: O5.id, buyerClient: buyerA.c })

    const l5Restored = await listingStock(L5.id)
    check('delete test: stock restored to 1', l5Restored?.quantity === 1, toText(l5Restored))

    const delO5 = await buyerA.c.rpc('delete_my_cancelled_order', { p_order_id: O5.id })
    check('only buyer can delete their cancelled order', delO5.error == null, delO5.error?.message)
    const { data: o5Gone } = await buyerA.c.from('orders').select('id').eq('id', O5.id)
    check('deleted order is gone from buyer history', (o5Gone ?? []).length === 0, toText(o5Gone))
    const l5AfterDelete = await listingStock(L5.id)
    check('deletion does not restore stock again', l5AfterDelete?.quantity === 1, toText(l5AfterDelete))

    const delActive = await buyerA.c.rpc('delete_my_cancelled_order', { p_order_id: O1.id })
    check('non-cancelled order cannot be deleted', delActive.error != null, delActive.error?.message ?? 'unexpected success')

    // ----------------------------------------------------------------------
    // 18. CONCURRENCY — one unit, two buyers, true concurrent promises
    // ----------------------------------------------------------------------
    const L4 = await createListing({
      title: `Phase 8 concurrency ${runId}`,
      price: 1000,
      quantity: 1,
      listingStatus: 'active',
    })
    const race = await Promise.allSettled([
      buyerA.c.rpc('create_marketplace_order', {
        p_listing_id: L4.id,
        p_quantity: 1,
        p_fulfillment_type: 'pickup',
        p_expected_unit_price: 1000,
      }),
      buyerB.c.rpc('create_marketplace_order', {
        p_listing_id: L4.id,
        p_quantity: 1,
        p_fulfillment_type: 'pickup',
        p_expected_unit_price: 1000,
      }),
    ])
    const succeeded = race.filter((r) => r.status === 'fulfilled' && r.value?.error == null)
    const failed = race.filter((r) => r.status === 'rejected' || r.value?.error != null)
    check('concurrent purchase allows exactly one success', succeeded.length === 1 && failed.length === 1, toText(race.map((r) => r.status)))
    const l4After = await listingStock(L4.id)
    check('final concurrent inventory is zero', l4After?.quantity === 0, toText(l4After))

    const { count: l4OrderCount } = await seller.c
      .from('order_items')
      .select('id', { count: 'exact' })
      .eq('listing_id', L4.id)
    check('successful order count is exactly one', l4OrderCount === 1, toText(l4OrderCount))

    const winnerOrder = succeeded[0]?.value?.data
    const winnerClient = winnerOrder?.buyer_id === buyerA.user.id ? buyerA.c : buyerB.c
    if (winnerOrder != null) pendingOrders.push({ orderId: winnerOrder.id, buyerClient: winnerClient })

    const oversell = await buyerA.c.rpc('create_marketplace_order', {
      p_listing_id: L4.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    })
    check('follow-up purchase on empty stock rejected', oversell.error != null, oversell.error?.message ?? 'unexpected success')
    const l4Final = await listingStock(L4.id)
    check('inventory never goes negative', l4Final?.quantity === 0, toText(l4Final?.quantity))

    // ----------------------------------------------------------------------
    // 19. CART RPC PROBE — the cart/checkout RPCs must be live on hosted.
    // ----------------------------------------------------------------------
    const cartProbe = await buyerA.c.rpc('add_to_cart', {
      p_listing_id: '00000000-0000-0000-0000-000000000000',
      p_quantity: 1,
    })
    const cartRpcsLive =
      cartProbe.error == null ||
      !/PGRST202|could not find the function/i.test(String(cartProbe.error.code ?? cartProbe.error.message))
    if (!cartRpcsLive) {
      console.error('BLOCKED: Phase 8 cart RPCs are not present on the hosted project.')
      console.error('Apply supabase/migrations/20260814000000_phase8_cart_and_checkout.sql first.')
      process.exitCode = 3
      return
    }

    // Anonymous client (no session): the RPCs only grant `authenticated`.
    const anon = client()

    // Dedicated listings for the cart scenarios (each is swept by cleanup).
    const Lcart = await createListing({
      title: `Phase 8 cart line ${runId}`,
      price: 2000,
      quantity: 5,
      listingStatus: 'active',
    })
    const Lpickup = await createListing({
      title: `Phase 8 pickup-only ${runId}`,
      price: 900,
      quantity: 2,
      listingStatus: 'active',
      pickupAvailable: true,
      deliveryAvailable: false,
    })
    const Lkeep = await createListing({
      title: `Phase 8 unselected ${runId}`,
      price: 1000,
      quantity: 1,
      listingStatus: 'active',
    })
    const Larch2 = await createListing({
      title: `Phase 8 cart arch ${runId}`,
      price: 600,
      quantity: 4,
      listingStatus: 'active',
    })
    const Lprice = await createListing({
      title: `Phase 8 cart price ${runId}`,
      price: 1800,
      quantity: 1,
      listingStatus: 'active',
    })
    const Lstock = await createListing({
      title: `Phase 8 cart stock ${runId}`,
      price: 700,
      quantity: 2,
      listingStatus: 'active',
    })
    const Lrm = await createListing({
      title: `Phase 8 cart rm ${runId}`,
      price: 400,
      quantity: 1,
      listingStatus: 'active',
    })

    // ----------------------------------------------------------------------
    // 20. add_to_cart — validation, clamping, increment, self-purchase guard
    // ----------------------------------------------------------------------
    const myCart = await buyerA.c.rpc('my_cart')
    check('my_cart returns the buyer cart', myCart.error == null && myCart.data?.buyer_id === buyerA.user.id, myCart.error?.message)
    const myCart2 = await buyerA.c.rpc('my_cart')
    check('my_cart is idempotent (same cart id)', myCart2.data?.id === myCart.data?.id, toText(myCart2.data?.id))

    const anonAdd = await anon.rpc('add_to_cart', { p_listing_id: Lcart.id, p_quantity: 1 })
    check('anonymous add to cart rejected', anonAdd.error != null, anonAdd.error?.message ?? 'unexpected success')

    const selfAdd = await seller.c.rpc('add_to_cart', { p_listing_id: Lcart.id, p_quantity: 1 })
    check(
      'self-purchase add rejected',
      selfAdd.error != null && /SELF_PURCHASE_NOT_ALLOWED/.test(selfAdd.error.message),
      selfAdd.error?.message,
    )

    const missingAdd = await buyerA.c.rpc('add_to_cart', {
      p_listing_id: '00000000-0000-0000-0000-000000000000',
      p_quantity: 1,
    })
    check(
      'missing listing add rejected',
      missingAdd.error != null && /LISTING_NOT_FOUND/.test(missingAdd.error.message),
      missingAdd.error?.message,
    )

    const draftAdd = await buyerA.c.rpc('add_to_cart', { p_listing_id: Ldraft.id, p_quantity: 1 })
    check(
      'draft listing add rejected',
      draftAdd.error != null && /LISTING_UNAVAILABLE/.test(draftAdd.error.message),
      draftAdd.error?.message,
    )

    // ZERO-STOCK ADD CONTRACT: a listing whose stock hit zero automatically
    // becomes `sold` (Phase 4 invariant + both order RPCs), so add_to_cart()
    // reports it as LISTING_UNAVAILABLE — the same canonical code a sold
    // listing returns at purchase time. INSUFFICIENT_STOCK from add_to_cart
    // is unreachable (an active listing always has quantity > 0). Documented in
    // 20260814100000_phase8_fix_cart_checkout_inventory_authorization.sql.
    const zeroAdd = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lzero.id, p_quantity: 1 })
    check(
      'zero-stock add rejected (LISTING_UNAVAILABLE contract)',
      zeroAdd.error != null && /LISTING_UNAVAILABLE/.test(zeroAdd.error.message),
      zeroAdd.error?.message,
    )

    const qty0Add = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lcart.id, p_quantity: 0 })
    check(
      'quantity zero add rejected',
      qty0Add.error != null && /INVALID_QUANTITY/.test(qty0Add.error.message),
      qty0Add.error?.message,
    )

    const add1 = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lcart.id, p_quantity: 3 })
    check('buyer adds listing to cart', add1.error == null && add1.data?.id != null, add1.error?.message)
    const cartLine = add1.data
    if (cartLine?.id == null) {
      throw new Error('add_to_cart failed — cannot continue cart verification')
    }
    check('line quantity equals requested value', cartLine.quantity === 3, toText(cartLine?.quantity))
    check('line maps to the right listing', cartLine.listing_id === Lcart.id, toText(cartLine?.listing_id))
    cartItems.push({ id: cartLine.id, buyerClient: buyerA.c })

    const addClamp = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lcart.id, p_quantity: 5 })
    check(
      're-add increments and clamps to stock',
      addClamp.error == null && addClamp.data?.quantity === 5,
      toText(addClamp.data?.quantity),
    )
    check('re-add reuses the same line', addClamp.data?.id === cartLine.id, toText(addClamp.data?.id))

    // ----------------------------------------------------------------------
    // 21. CART RLS — carts and cart_items are buyer-scoped. Direct writes are
    //     denied except for the owner's own rows (owner delete is the
    //     supported removeCartItem path).
    // ----------------------------------------------------------------------
    const { data: bSeesACart } = await buyerB.c.from('carts').select('id').eq('buyer_id', buyerA.user.id)
    check('buyer B cannot read buyer A cart', (bSeesACart ?? []).length === 0, toText(bSeesACart))

    const forgedCart = await buyerA.c.from('carts').insert({ buyer_id: buyerB.user.id })
    check('direct cart insert for another buyer rejected', forgedCart.error != null, forgedCart.error?.message ?? 'unexpected success')

    const { data: bSeesALines } = await buyerB.c.from('cart_items').select('id').eq('cart_id', cartLine.cart_id)
    check('buyer B cannot read buyer A cart lines', (bSeesALines ?? []).length === 0, toText(bSeesALines))

    const { data: sSeesALines } = await stranger.c.from('cart_items').select('id').eq('cart_id', cartLine.cart_id)
    check('stranger cannot read buyer A cart lines', (sSeesALines ?? []).length === 0, toText(sSeesALines))

    const bUpdateLine = await buyerB.c.from('cart_items').update({ quantity: 9 }).eq('id', cartLine.id)
    check('buyer B cannot update buyer A cart line', (bUpdateLine.data ?? []).length === 0, toText(bUpdateLine.data))

    const bDeleteLine = await buyerB.c.from('cart_items').delete().eq('id', cartLine.id)
    check('buyer B cannot delete buyer A cart line', (bDeleteLine.data ?? []).length === 0, toText(bDeleteLine.data))

    const foreignLine = await buyerA.c.from('cart_items').insert({
      cart_id: '00000000-0000-0000-0000-000000000000',
      listing_id: Lcart.id,
      quantity: 1,
    })
    check('direct cart line insert into foreign cart rejected', foreignLine.error != null, foreignLine.error?.message ?? 'unexpected success')

    const rmLine = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lrm.id, p_quantity: 1 })
    check('owner-delete test: line added', rmLine.error == null && rmLine.data?.id != null, rmLine.error?.message)
    const rmLineId = rmLine.data?.id
    if (rmLineId == null) {
      throw new Error('add_to_cart failed for owner-delete test')
    }
    cartItems.push({ id: rmLineId, buyerClient: buyerA.c })
    // PostgREST returns no deleted representation without .select(); chain it so
    // the RLS delete reports the row it removed. RLS stays untouched — the
    // delete is still scoped to the owner's own cart.
    const rmOwn = await buyerA.c.from('cart_items').delete().eq('id', rmLineId).select('id')
    check('owner deletes own cart line', rmOwn.error == null && (rmOwn.data ?? []).length === 1, rmOwn.error?.message)
    const { data: rmGone } = await buyerA.c.from('cart_items').select('id').eq('id', rmLineId)
    check('deleted cart line is gone', (rmGone ?? []).length === 0, toText(rmGone))

    // ----------------------------------------------------------------------
    // 22. update_cart_item_quantity — ownership + live-stock clamp
    // ----------------------------------------------------------------------
    const updOk = await buyerA.c.rpc('update_cart_item_quantity', { p_cart_item_id: cartLine.id, p_quantity: 2 })
    check('owner updates line quantity', updOk.error == null && updOk.data?.quantity === 2, updOk.error?.message)

    const updClamp = await buyerA.c.rpc('update_cart_item_quantity', { p_cart_item_id: cartLine.id, p_quantity: 999 })
    check('update clamps to stock', updClamp.error == null && updClamp.data?.quantity === 5, toText(updClamp.data?.quantity))

    const updForeign = await buyerB.c.rpc('update_cart_item_quantity', { p_cart_item_id: cartLine.id, p_quantity: 1 })
    check(
      'non-owner update rejected',
      updForeign.error != null && /CART_ITEM_NOT_FOUND/.test(updForeign.error.message),
      updForeign.error?.message,
    )

    const updMissing = await buyerA.c.rpc('update_cart_item_quantity', {
      p_cart_item_id: '00000000-0000-0000-0000-000000000000',
      p_quantity: 1,
    })
    check(
      'unknown line update rejected',
      updMissing.error != null && /CART_ITEM_NOT_FOUND/.test(updMissing.error.message),
      updMissing.error?.message,
    )

    const updQty0 = await buyerA.c.rpc('update_cart_item_quantity', { p_cart_item_id: cartLine.id, p_quantity: 0 })
    check(
      'quantity zero update rejected',
      updQty0.error != null && /INVALID_QUANTITY/.test(updQty0.error.message),
      updQty0.error?.message,
    )

    // A listing archived after it was added to a cart: updates (and checkouts)
    // must re-validate against the live row.
    const arch2Add = await buyerA.c.rpc('add_to_cart', { p_listing_id: Larch2.id, p_quantity: 1 })
    check('archived-cart test: item added', arch2Add.error == null && arch2Add.data?.id != null, arch2Add.error?.message)
    const arch2Line = arch2Add.data
    if (arch2Line?.id == null) {
      throw new Error('add_to_cart failed for archive test')
    }
    cartItems.push({ id: arch2Line.id, buyerClient: buyerA.c })
    const arch2Set = await seller.c.from('listings').update({ listing_status: 'archived' }).eq('id', Larch2.id)
    check('archived-cart test: seller archives listing', arch2Set.error == null, arch2Set.error?.message)
    const arch2Upd = await buyerA.c.rpc('update_cart_item_quantity', { p_cart_item_id: arch2Line.id, p_quantity: 2 })
    check(
      'update on archived listing rejected',
      arch2Upd.error != null && /LISTING_UNAVAILABLE/.test(arch2Upd.error.message),
      arch2Upd.error?.message,
    )

    // ----------------------------------------------------------------------
    // 23. checkout_cart — structured error paths
    // ----------------------------------------------------------------------
    const emptyCheckout = await buyerA.c.rpc('checkout_cart', {
      p_cart_item_ids: null,
      p_fulfillments: { [sellerId]: 'pickup' },
    })
    check(
      'empty selection rejected',
      emptyCheckout.error != null && /NO_ITEMS_SELECTED/.test(emptyCheckout.error.message),
      emptyCheckout.error?.message,
    )

    const tooMany = await buyerA.c.rpc('checkout_cart', {
      p_cart_item_ids: Array(101).fill('00000000-0000-0000-0000-000000000000'),
      p_fulfillments: { [sellerId]: 'pickup' },
    })
    check(
      'over-100-item checkout rejected',
      tooMany.error != null && /TOO_MANY_ITEMS/.test(tooMany.error.message),
      tooMany.error?.message,
    )

    const forgedCheckout = await buyerA.c.rpc('checkout_cart', {
      p_cart_item_ids: ['00000000-0000-0000-0000-000000000001'],
      p_fulfillments: { [sellerId]: 'pickup' },
    })
    check(
      'checkout with unknown lines rejected',
      forgedCheckout.error != null && /FORBIDDEN/.test(forgedCheckout.error.message),
      forgedCheckout.error?.message,
    )

    const noFulfillment = await buyerA.c.rpc('checkout_cart', {
      p_cart_item_ids: [cartLine.id],
      p_fulfillments: null,
    })
    check(
      'missing fulfillment choice rejected',
      noFulfillment.error != null && /INVALID_FULFILLMENT/.test(noFulfillment.error.message),
      noFulfillment.error?.message,
    )

    // Price spoof: the buyer supplies the price they saw; the DB compares it
    // against the locked, trusted price and rejects the whole checkout.
    const priceLine = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lprice.id, p_quantity: 1 })
    check('price-spoof test: line added', priceLine.error == null && priceLine.data?.id != null, priceLine.error?.message)
    const priceLineId = priceLine.data?.id
    if (priceLineId == null) {
      throw new Error('add_to_cart failed for price-spoof test')
    }
    cartItems.push({ id: priceLineId, buyerClient: buyerA.c })
    const priceBump = await seller.c.from('listings').update({ price: 1900 }).eq('id', Lprice.id)
    check('price-spoof test: seller raises price', priceBump.error == null, priceBump.error?.message)
    const spoofCheckout = await buyerA.c.rpc('checkout_cart', {
      p_cart_item_ids: [priceLineId],
      p_fulfillments: { [sellerId]: 'pickup' },
      p_expected_prices: { [priceLineId]: 1800 },
    })
    check(
      'price spoof rejected at checkout',
      spoofCheckout.error != null && /PRICE_CHANGED/.test(spoofCheckout.error.message),
      spoofCheckout.error?.message,
    )
    const priceStock = await listingStock(Lprice.id)
    check('failed checkout leaves inventory untouched', priceStock?.quantity === 1, toText(priceStock))

    // Recovery: re-checking out with the correct current price succeeds and
    // removes only the checked-out line.
    const retryCheckout = await buyerA.c.rpc('checkout_cart', {
      p_cart_item_ids: [priceLineId],
      p_fulfillments: { [sellerId]: 'pickup' },
      p_expected_prices: { [priceLineId]: 1900 },
    })
    check(
      'retry with correct price succeeds',
      retryCheckout.error == null && (retryCheckout.data ?? []).length === 1,
      retryCheckout.error?.message,
    )
    const retryOrder = retryCheckout.data?.[0]
    if (retryOrder?.order_id != null) {
      pendingOrders.push({ orderId: retryOrder.order_id, buyerClient: buyerA.c })
    }
    const { data: priceLineGone } = await buyerA.c.from('cart_items').select('id').eq('id', priceLineId)
    check('checked-out price line removed from cart', (priceLineGone ?? []).length === 0, toText(priceLineGone))

    // Stock revalidation: stock can drop between add and checkout.
    const stockLine = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lstock.id, p_quantity: 2 })
    check('stock-recheck test: line added', stockLine.error == null && stockLine.data?.id != null, stockLine.error?.message)
    const stockLineId = stockLine.data?.id
    if (stockLineId == null) {
      throw new Error('add_to_cart failed for stock-recheck test')
    }
    cartItems.push({ id: stockLineId, buyerClient: buyerA.c })
    const drain = await buyerB.c.rpc('create_marketplace_order', {
      p_listing_id: Lstock.id,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
    })
    check('stock-recheck test: other buyer drains stock to 1', drain.error == null && drain.data?.id != null, drain.error?.message)
    if (drain.data?.id != null) {
      pendingOrders.push({ orderId: drain.data.id, buyerClient: buyerB.c })
    }
    const oversellCheckout = await buyerA.c.rpc('checkout_cart', {
      p_cart_item_ids: [stockLineId],
      p_fulfillments: { [sellerId]: 'pickup' },
    })
    check(
      'stock drop between add and checkout rejected',
      oversellCheckout.error != null && /INSUFFICIENT_STOCK/.test(oversellCheckout.error.message),
      oversellCheckout.error?.message,
    )
    const stockLineStill = await buyerA.c.from('cart_items').select('id').eq('id', stockLineId)
    check('failed checkout keeps the cart line', (stockLineStill.data ?? []).length === 1, toText(stockLineStill.data))

    // A fulfillment the group does not offer must be rejected before any order.
    const pickupLine = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lpickup.id, p_quantity: 1 })
    check('pickup-only test: line added', pickupLine.error == null && pickupLine.data?.id != null, pickupLine.error?.message)
    const pickupLineId = pickupLine.data?.id
    if (pickupLineId == null) {
      throw new Error('add_to_cart failed for pickup-only test')
    }
    cartItems.push({ id: pickupLineId, buyerClient: buyerA.c })
    const badFulfillment = await buyerA.c.rpc('checkout_cart', {
      p_cart_item_ids: [pickupLineId],
      p_fulfillments: { [sellerId]: 'delivery' },
    })
    check(
      'unoffered fulfillment choice rejected',
      badFulfillment.error != null && /INVALID_FULFILLMENT/.test(badFulfillment.error.message),
      badFulfillment.error?.message,
    )

    // ----------------------------------------------------------------------
    // 24. SUCCESSFUL SINGLE-SELLER CHECKOUT — one order per seller, atomic,
    //     removes only the checked-out lines.
    // ----------------------------------------------------------------------
    const keepLine = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lkeep.id, p_quantity: 1 })
    check('unselected-line test: line added', keepLine.error == null && keepLine.data?.id != null, keepLine.error?.message)
    const keepLineId = keepLine.data?.id
    if (keepLineId == null) {
      throw new Error('add_to_cart failed for unselected-line test')
    }
    cartItems.push({ id: keepLineId, buyerClient: buyerA.c })

    // Lcart is at qty 5 (clamped) and Lpickup at qty 1 — same seller, so one
    // fulfillment choice applies to the whole group. Lkeep stays unselected.
    const checkout = await buyerA.c.rpc('checkout_cart', {
      p_cart_item_ids: [cartLine.id, pickupLineId],
      p_fulfillments: { [sellerId]: 'pickup' },
      p_expected_prices: { [cartLine.id]: 2000, [pickupLineId]: 900 },
    })
    check(
      'single-seller checkout succeeds',
      checkout.error == null && (checkout.data ?? []).length === 1,
      checkout.error?.message,
    )
    const CO = checkout.data?.[0]
    if (CO?.order_id == null) {
      throw new Error('checkout_cart failed — cannot continue cart verification')
    }
    check('checkout order seller matches listing seller', CO.seller_id === sellerId, toText(CO?.seller_id))
    check('checkout order total is sum of lines', CO.total === 2000 * 5 + 900 * 1, toText(CO?.total))
    check('checkout order item count', CO.item_count === 2, toText(CO?.item_count))
    check('checkout order uses group fulfillment', CO.fulfillment_type === 'pickup', toText(CO?.fulfillment_type))
    pendingOrders.push({ orderId: CO.order_id, buyerClient: buyerA.c })

    const { data: coRow } = await buyerA.c.from('orders').select('status, subtotal, total').eq('id', CO.order_id).single()
    check('checkout order persisted as pending', coRow?.status === 'pending' && coRow?.subtotal === CO.total, toText(coRow))
    const { data: coItems } = await buyerA.c
      .from('order_items')
      .select('listing_id, product_title, unit_price, quantity')
      .eq('order_id', CO.order_id)
    check('checkout order has both snapshot items', (coItems ?? []).length === 2, toText(coItems))
    const coPrices = (coItems ?? []).map((r) => r.unit_price).sort((a, b) => a - b)
    check(
      'checkout order snapshots trusted DB prices',
      coPrices.length === 2 && coPrices[0] === 900 && coPrices[1] === 2000,
      toText(coPrices),
    )
    const { data: sellerSeesCO } = await seller.c.from('orders').select('id').eq('id', CO.order_id)
    check('seller sees the checkout order', (sellerSeesCO ?? []).length === 1, toText(sellerSeesCO))

    const lcartAfter = await listingStock(Lcart.id)
    check('checkout drains cart listing stock', lcartAfter?.quantity === 0 && lcartAfter?.listing_status === 'sold', toText(lcartAfter))
    const lpickupAfter = await listingStock(Lpickup.id)
    check('checkout drains pickup-only listing stock', lpickupAfter?.quantity === 1, toText(lpickupAfter))

    const { data: cartAfterCheckout } = await buyerA.c.from('cart_items').select('id').eq('cart_id', cartLine.cart_id)
    const remainingIds = (cartAfterCheckout ?? []).map((r) => r.id)
    check('checked-out lines removed from cart', !remainingIds.includes(cartLine.id) && !remainingIds.includes(pickupLineId), toText(remainingIds))
    check('unselected line stays in cart', remainingIds.includes(keepLineId), toText(remainingIds))

    // ----------------------------------------------------------------------
    // 25. MULTI-SELLER CHECKOUT (optional — needs Seller B account)
    // ----------------------------------------------------------------------
    const sellerBEmail = env.PHASE8_TEST_SELLER_B_EMAIL
    const sellerBPassword = env.PHASE8_TEST_SELLER_B_PASSWORD
    if (sellerBEmail != null && sellerBPassword != null) {
      try {
        sellerB = await signIn('seller B', sellerBEmail, sellerBPassword)
      } catch (err) {
        console.log(`  SKIP  multi-seller checkout (seller B sign-in failed: ${err.message})`)
      }
    } else {
      console.log('  SKIP  multi-seller checkout (PHASE8_TEST_SELLER_B_EMAIL/PASSWORD not set)')
    }

    if (sellerB != null) {
      check('seller B signs in', sellerB.user != null)
      const { data: sellerBProfiles } = await sellerB.c
        .from('seller_profiles')
        .select('id, seller_status, store_name')
        .eq('user_id', sellerB.user.id)
      if ((sellerBProfiles ?? []).length > 0) {
        sellerBId = sellerBProfiles[0].id
        check('seller B profile reused', sellerBId != null, toText(sellerBProfiles))
        check('seller B is active', sellerBProfiles[0].seller_status === 'active', toText(sellerBProfiles[0].seller_status))
      } else {
        const { data: sbProf, error: sbErr } = await sellerB.c
          .from('seller_profiles')
          .insert({ user_id: sellerB.user.id, store_name: `B Store ${runId}` })
          .select('id, seller_status')
          .single()
        sellerBId = sbProf?.id ?? null
        check('seller B self-creates a seller profile', sbErr == null && sellerBId != null, sbErr?.message)
        check('seller B is active', sbProf?.seller_status === 'active', toText(sbProf?.seller_status))
      }

      // Self-created profiles start "pending" (enforce_initial_status) and only
      // an admin can flip them (admin_set_seller_status) — the verifier must not
      // bypass that. A non-active Seller B therefore gates off the multi-seller
      // checks with an actionable message instead of a raw throw.
      const sellerBActive =
        sellerBId != null &&
        ((sellerBProfiles ?? [])[0]?.seller_status ?? undefined) === 'active'
      if (!sellerBActive) {
        console.log('  BLOCKED  multi-seller checkout skipped — Seller B seller profile is not active.')
        console.log('           An admin must approve it (admin_set_seller_status) or the Seller B account')
        console.log('           needs an already-active seller profile. Rerun after approval.')
      } else {
        const createBListing = async ({ title, price, quantity, listingStatus }) => {
        const { data: listing, error } = await sellerB.c
          .from('listings')
          .insert({
            seller_id: sellerBId,
            category_id: category.id,
            brand_id: brand?.id ?? null,
            title,
            description: 'Isolated Phase 8 multi-seller verification listing.',
            listing_condition: 'like_new',
            price,
            quantity,
            listing_status: listingStatus,
            pickup_available: true,
            delivery_available: true,
          })
          .select('id, title, listing_status, quantity, price, seller_id')
          .single()
        if (error != null) {
          throw new Error(`could not create Seller B test listing: ${error.message}`)
        }
        deletableListingsB.push(listing.id)
        return listing
      }

      const LB1 = await createBListing({
        title: `Phase 8 seller B ${runId}`,
        price: 500,
        quantity: 3,
        listingStatus: 'active',
      })
      const LB2 = await createBListing({
        title: `Phase 8 seller B 2 ${runId}`,
        price: 800,
        quantity: 2,
        listingStatus: 'active',
      })
      // One more main-seller listing so the multi-seller checkout has items
      // from BOTH sellers (Lkeep stays in the cart as the unselected line).
      const Lkeep2 = await createListing({
        title: `Phase 8 multi main ${runId}`,
        price: 1100,
        quantity: 2,
        listingStatus: 'active',
      })
      const bLine = await buyerA.c.rpc('add_to_cart', { p_listing_id: LB1.id, p_quantity: 1 })
      check('buyer adds second-seller listing to cart', bLine.error == null && bLine.data?.id != null, bLine.error?.message)
      const bLineId = bLine.data?.id
      if (bLineId == null) {
        throw new Error('add_to_cart failed for multi-seller test')
      }
      cartItems.push({ id: bLineId, buyerClient: buyerA.c })

      const bLine2 = await buyerA.c.rpc('add_to_cart', { p_listing_id: LB2.id, p_quantity: 1 })
      check('buyer adds second Seller B product to cart', bLine2.error == null && bLine2.data?.id != null, bLine2.error?.message)
      const bLine2Id = bLine2.data?.id
      if (bLine2Id == null) {
        throw new Error('add_to_cart failed for second Seller B product')
      }
      cartItems.push({ id: bLine2Id, buyerClient: buyerA.c })

      const keep2Line = await buyerA.c.rpc('add_to_cart', { p_listing_id: Lkeep2.id, p_quantity: 1 })
      check('buyer adds main-seller multi item to cart', keep2Line.error == null && keep2Line.data?.id != null, keep2Line.error?.message)
      const keep2LineId = keep2Line.data?.id
      if (keep2LineId == null) {
        throw new Error('add_to_cart failed for main-seller multi item')
      }
      cartItems.push({ id: keep2LineId, buyerClient: buyerA.c })

      // Lkeep2 (main seller, pickup) + LB1 + LB2 (seller B, delivery) in one
      // checkout. Lkeep stays unselected.
      const multi = await buyerA.c.rpc('checkout_cart', {
        p_cart_item_ids: [keep2LineId, bLineId, bLine2Id],
        p_fulfillments: { [sellerId]: 'pickup', [sellerBId]: 'delivery' },
        p_expected_prices: { [keep2LineId]: 1100, [bLineId]: 500, [bLine2Id]: 800 },
      })
      check(
        'multi-seller checkout succeeds',
        multi.error == null && (multi.data ?? []).length === 2,
        multi.error?.message,
      )
      const multiOrders = multi.data ?? []
      if (multiOrders.length !== 2) {
        throw new Error('multi-seller checkout did not return one order per seller')
      }
      const orderForMain = multiOrders.find((o) => o.seller_id === sellerId)
      const orderForB = multiOrders.find((o) => o.seller_id === sellerBId)
      check('one order created per seller', orderForMain != null && orderForB != null, toText(multiOrders))
      check(
        'main-seller order total and fulfillment correct',
        orderForMain?.total === 1100 && orderForMain?.item_count === 1 && orderForMain?.fulfillment_type === 'pickup',
        toText(orderForMain),
      )
      check(
        'seller-B order total and fulfillment correct',
        orderForB?.total === 500 + 800 && orderForB?.item_count === 2 && orderForB?.fulfillment_type === 'delivery',
        toText(orderForB),
      )
      if (orderForMain?.order_id != null) {
        pendingOrders.push({ orderId: orderForMain.order_id, buyerClient: buyerA.c })
      }
      if (orderForB?.order_id != null) {
        pendingOrders.push({ orderId: orderForB.order_id, buyerClient: buyerA.c })
      }

      // Buyer owns every generated order.
      const { data: mainOrderRow } = await buyerA.c.from('orders').select('buyer_id, status').eq('id', orderForMain.order_id).single()
      const { data: bOrderRow } = await buyerA.c.from('orders').select('buyer_id, status').eq('id', orderForB.order_id).single()
      check(
        'buyer owns all generated orders',
        mainOrderRow?.buyer_id === buyerA.user.id && bOrderRow?.buyer_id === buyerA.user.id,
        toText([mainOrderRow, bOrderRow]),
      )
      check('generated orders are pending', mainOrderRow?.status === 'pending' && bOrderRow?.status === 'pending', toText([mainOrderRow, bOrderRow]))

      // Item isolation: each order contains only its own seller's listings.
      const { data: mainOrderItems } = await buyerA.c
        .from('order_items')
        .select('listing_id, seller_id')
        .eq('order_id', orderForMain.order_id)
      const { data: bOrderItems } = await buyerA.c
        .from('order_items')
        .select('listing_id, seller_id')
        .eq('order_id', orderForB.order_id)
      const mainOnly =
        (mainOrderItems ?? []).length === 1 &&
        mainOrderItems[0].seller_id === sellerId &&
        mainOrderItems[0].listing_id === Lkeep2.id
      const bOnly =
        (bOrderItems ?? []).length === 2 &&
        bOrderItems.every((r) => r.seller_id === sellerBId) &&
        bOrderItems.map((r) => r.listing_id).sort().join() === [LB1.id, LB2.id].sort().join()
      check('Seller A order contains only Seller A items', mainOnly, toText(mainOrderItems))
      check('Seller B order contains only Seller B items', bOnly, toText(bOrderItems))
      check('same-seller multiple products stay in one seller order', (bOrderItems ?? []).length === 2, toText(bOrderItems))
      check(
        'no cross-seller order_items',
        (mainOrderItems ?? []).every((r) => r.seller_id === sellerId) &&
          (bOrderItems ?? []).every((r) => r.seller_id === sellerBId),
        toText([mainOrderItems, bOrderItems]),
      )

      // Cross-seller access: neither seller can read the other's order.
      const { data: mainReadsB } = await seller.c.from('orders').select('id').eq('id', orderForB.order_id)
      const { data: bReadsMain } = await sellerB.c.from('orders').select('id').eq('id', orderForMain.order_id)
      check('Seller A cannot access Seller B order', (mainReadsB ?? []).length === 0, toText(mainReadsB))
      check('Seller B cannot access Seller A order', (bReadsMain ?? []).length === 0, toText(bReadsMain))

      // All selected inventory decremented.
      const { data: lb1Stock } = await sellerB.c.from('listings').select('quantity').eq('id', LB1.id).single()
      const { data: lb2Stock } = await sellerB.c.from('listings').select('quantity').eq('id', LB2.id).single()
      const lkeep2After = await listingStock(Lkeep2.id)
      check(
        'all selected inventory decremented',
        lb1Stock?.quantity === 2 && lb2Stock?.quantity === 1 && lkeep2After?.quantity === 1,
        toText([lb1Stock, lb2Stock, lkeep2After]),
      )

      const { data: afterMulti } = await buyerA.c.from('cart_items').select('id').eq('cart_id', cartLine.cart_id)
      const afterMultiIds = (afterMulti ?? []).map((r) => r.id)
      check(
        'multi-seller checkout removes the selected lines',
        !afterMultiIds.includes(keep2LineId) && !afterMultiIds.includes(bLineId) && !afterMultiIds.includes(bLine2Id),
        toText(afterMultiIds),
      )
      check(
        'unselected cart lines remain after multi-seller checkout',
        afterMultiIds.includes(keepLineId) && afterMultiIds.includes(arch2Line.id),
        toText(afterMultiIds),
      )

      // ----------------------------------------------------------------------
      // 25b. ALL-OR-NOTHING — Seller A item valid, Seller B item out of stock.
      //      The whole checkout must reject with zero orders, zero inventory
      //      mutations, and the cart unchanged.
      // ----------------------------------------------------------------------
      const LBstock = await createBListing({
        title: `Phase 8 seller B oos ${runId}`,
        price: 900,
        quantity: 1,
        listingStatus: 'active',
      })
      const bStockLine = await buyerA.c.rpc('add_to_cart', { p_listing_id: LBstock.id, p_quantity: 1 })
      check('all-or-nothing test: Seller B item added', bStockLine.error == null && bStockLine.data?.id != null, bStockLine.error?.message)
      const bStockLineId = bStockLine.data?.id
      if (bStockLineId == null) {
        throw new Error('add_to_cart failed for all-or-nothing test')
      }
      cartItems.push({ id: bStockLineId, buyerClient: buyerA.c })

      // Buyer B drains the Seller B item, so the staged checkout hits a sold
      // listing (LISTING_UNAVAILABLE) before any order is created.
      const drainB = await buyerB.c.rpc('create_marketplace_order', {
        p_listing_id: LBstock.id,
        p_quantity: 1,
        p_fulfillment_type: 'delivery',
      })
      check('all-or-nothing test: Seller B item drained to sold', drainB.error == null && drainB.data?.id != null, drainB.error?.message)
      if (drainB.data?.id != null) {
        pendingOrders.push({ orderId: drainB.data.id, buyerClient: buyerB.c })
      }

      const countBuyerAOrders = async (sellerClient, sellerProfileId) => {
        const { count } = await sellerClient
          .from('orders')
          .select('id', { count: 'exact' })
          .eq('buyer_id', buyerA.user.id)
          .eq('seller_id', sellerProfileId)
        return count ?? 0
      }
      const mainOrdersBefore = await countBuyerAOrders(seller.c, sellerId)
      const bOrdersBefore = await countBuyerAOrders(sellerB.c, sellerBId)

      const atomic = await buyerA.c.rpc('checkout_cart', {
        p_cart_item_ids: [keepLineId, bStockLineId],
        p_fulfillments: { [sellerId]: 'pickup', [sellerBId]: 'delivery' },
        p_expected_prices: { [keepLineId]: 1000, [bStockLineId]: 900 },
      })
      check(
        'all-or-nothing: checkout rejected when one item is unavailable',
        atomic.error != null && /LISTING_UNAVAILABLE/.test(atomic.error.message),
        atomic.error?.message ?? 'unexpected success',
      )

      const mainOrdersAfter = await countBuyerAOrders(seller.c, sellerId)
      const bOrdersAfter = await countBuyerAOrders(sellerB.c, sellerBId)
      check(
        'all-or-nothing: zero orders created',
        mainOrdersAfter === mainOrdersBefore && bOrdersAfter === bOrdersBefore,
        `main ${mainOrdersBefore}→${mainOrdersAfter}, B ${bOrdersBefore}→${bOrdersAfter}`,
      )

      const lkeepAfterAtomic = await listingStock(Lkeep.id)
      check(
        'all-or-nothing: valid item inventory untouched',
        lkeepAfterAtomic?.quantity === 1,
        toText(lkeepAfterAtomic),
      )

      const { data: atomicCart } = await buyerA.c.from('cart_items').select('id').eq('cart_id', cartLine.cart_id)
      const atomicIds = (atomicCart ?? []).map((r) => r.id)
      check(
        'all-or-nothing: cart unchanged after failed checkout',
        atomicIds.includes(keepLineId) && atomicIds.includes(bStockLineId) && atomicIds.includes(arch2Line.id),
        toText(atomicIds),
      )
      }
    }

    console.log(`\n== Result: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`} ==`)
  } catch (err) {
    failures += 1
    console.error(`\nERROR: ${err.message}`)
  } finally {
    // 26. Clean up only the rows this run created; Auth accounts stay intact.
    for (const { orderId, buyerClient } of cancelledOrders) {
      try {
        await buyerClient.rpc('delete_my_cancelled_order', { p_order_id: orderId })
      } catch {
        // best-effort
      }
    }
    for (const { orderId, buyerClient } of pendingOrders) {
      await cancelAndDelete(buyerClient, orderId)
    }
    // Leftover cart lines (checked-out lines are already removed by the RPC;
    // lines tied to deletable listings are removed by the FK cascade). Deletes
    // are RLS-scoped to the owning buyer, so this can never touch other carts.
    for (const { id, buyerClient } of cartItems) {
      try {
        await buyerClient.from('cart_items').delete().eq('id', id)
      } catch {
        // best-effort
      }
    }
    for (const listingId of deletableListings) {
      await cleanupListing(seller?.c ?? null, listingId)
    }
    for (const listingId of deletableListingsB) {
      await cleanupListing(sellerB?.c ?? null, listingId)
    }
    if (retainedOrder != null) {
      console.log('  cleanup: retained confirmed order (no client delete path in Phase 8):')
      console.log(`    order   ${retainedOrder}`)
    }
    if (retainedListing != null) {
      console.log('  cleanup: retained confirmed-order listing (order_item FK):')
      console.log(`    listing ${retainedListing.id}`)
    }
    await signOutAll([seller?.c, buyerA?.c, buyerB?.c, stranger?.c, sellerB?.c])
  }

  process.exitCode = failures === 0 ? 0 : 1
}

main()
