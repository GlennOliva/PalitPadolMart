import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Hosted Phase 13 verification uses only the public anon key and reusable,
// confirmed accounts. It never signs users up, never uses a service-role key,
// and never promotes accounts to admin. Every administrative mutation performed
// here is undone through the supported production RPCs (or a run-scoped test
// row is archived) so reruns never collide and real data is left untouched.

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
  'PHASE13_TEST_ADMIN_EMAIL',
  'PHASE13_TEST_ADMIN_PASSWORD',
  'PHASE7_TEST_SELLER_EMAIL',
  'PHASE7_TEST_SELLER_PASSWORD',
  'PHASE7_TEST_BUYER_EMAIL',
  'PHASE7_TEST_BUYER_PASSWORD',
  'PHASE7_TEST_STRANGER_EMAIL',
  'PHASE7_TEST_STRANGER_PASSWORD',
]
const missing = REQUIRED_CREDS.filter((name) => !env[name])
if (missing.length > 0) {
  console.error('SKIPPED: hosted Phase 13 verification requires confirmed reusable accounts.')
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

// Denial tests: authenticate as the non-admin, attempt the admin RPC, expect
// the server-side is_admin() guard to raise (or the grant to deny).
async function expectDenied(name, promise) {
  const result = await promise
  check(name, result.error != null, result.error == null ? 'unexpectedly succeeded' : '')
  return result
}

// List RPCs return an array (possibly empty) whose rows carry total_count.
function checkList(name, result, opts = {}) {
  const minRows = opts.minRows ?? 1
  const rows = Array.isArray(result.data) ? result.data : []
  const hasCount = opts.count === false || rows.length === 0 || rows[0]?.total_count != null
  check(
    name,
    result.error == null && rows.length >= minRows && hasCount,
    detail(result.error ?? { count: rows.length }),
  )
  return rows
}

async function main() {
  console.log('== Phase 13 hosted verification (administration) ==')
  console.log(`Run id: ${runId}`)

  let admin = null
  let seller = null
  let buyer = null
  let stranger = null
  let sellerB = null
  let sellerId = null
  let categoryId = null
  const listingIds = []
  let listingId = null
  let orderId = null
  let reviewId = null
  let reportId = null
  let disputeId = null
  let refundId = null

  try {
    // ------------------------------------------------------------------
    // ADMIN AUTH
    // ------------------------------------------------------------------
    console.log('\n-- ADMIN AUTH --')
    admin = await signIn('admin', env.PHASE13_TEST_ADMIN_EMAIL, env.PHASE13_TEST_ADMIN_PASSWORD)
    buyer = await signIn('buyer', env.PHASE7_TEST_BUYER_EMAIL, env.PHASE7_TEST_BUYER_PASSWORD)
    seller = await signIn('seller', env.PHASE7_TEST_SELLER_EMAIL, env.PHASE7_TEST_SELLER_PASSWORD)
    stranger = await signIn('stranger', env.PHASE7_TEST_STRANGER_EMAIL, env.PHASE7_TEST_STRANGER_PASSWORD)
    if (env.PHASE8_TEST_SELLER_B_EMAIL && env.PHASE8_TEST_SELLER_B_PASSWORD) {
      sellerB = await signIn('seller B', env.PHASE8_TEST_SELLER_B_EMAIL, env.PHASE8_TEST_SELLER_B_PASSWORD)
    }

    check('1. Admin signs in with email/password', admin.user != null)
    const adminProfile = await admin.c.from('profiles').select('role, account_status').eq('id', admin.user.id).single()
    check('2. Admin role derived from DB (profiles.role = admin)', adminProfile.data?.role === 'admin', detail(adminProfile.error ?? adminProfile.data))
    const buyerProfile = await buyer.c.from('profiles').select('role').eq('id', buyer.user.id).single()
    check('3. Buyer is NOT admin', buyerProfile.data?.role !== 'admin', detail(buyerProfile.error ?? buyerProfile.data))
    const sellerProfileRow = await seller.c.from('profiles').select('role').eq('id', seller.user.id).single()
    check('4. Seller is NOT admin', sellerProfileRow.data?.role !== 'admin', detail(sellerProfileRow.error ?? sellerProfileRow.data))
    const strangerProfile = await stranger.c.from('profiles').select('role').eq('id', stranger.user.id).single()
    check('5. Stranger is NOT admin', strangerProfile.data?.role !== 'admin', detail(strangerProfile.error ?? strangerProfile.data))
    if (adminProfile.data?.role !== 'admin') {
      throw new Error('the configured admin account is not an active admin; refusing to continue')
    }

    // ------------------------------------------------------------------
    // SETUP — run-scoped listing + real order/review/report/dispute/refund
    // rows so the admin read RPCs operate on real data.
    // ------------------------------------------------------------------
    console.log('\n-- SETUP (run-scoped test data through the real workflows) --')
    const sellerProfile = await seller.c
      .from('seller_profiles')
      .select('id, seller_status')
      .eq('user_id', seller.user.id)
      .single()
    sellerId = sellerProfile.data?.id
    check('seller profile exists and is active for test-data setup', sellerId != null && sellerProfile.data?.seller_status === 'active', detail(sellerProfile.error ?? sellerProfile.data))
    if (!sellerId) throw new Error('an active seller profile is required')

    const category = await buyer.c.from('categories').select('id').limit(1).single()
    categoryId = category.data?.id
    if (!categoryId) throw new Error('at least one category is required')

    const listing = await seller.c
      .from('listings')
      .insert({
        seller_id: sellerId,
        category_id: categoryId,
        title: `Phase 13 admin verification ${runId}`,
        description: 'Hosted Phase 13 administration verification listing.',
        listing_condition: 'like_new',
        price: 1200,
        quantity: 10,
        listing_status: 'active',
        pickup_available: true,
        delivery_available: true,
      })
      .select('id, price, listing_status')
      .single()
    if (listing.error != null || listing.data == null) throw new Error(`could not create listing: ${listing.error?.message}`)
    listingId = listing.data.id
    listingIds.push(listingId)
    check('test listing is active', listing.data.listing_status === 'active')

    const order = await buyer.c.rpc('create_marketplace_order', {
      p_listing_id: listingId,
      p_quantity: 1,
      p_fulfillment_type: 'pickup',
      p_expected_unit_price: listing.data.price,
    })
    if (order.error != null || order.data == null) throw new Error(`could not create order: ${order.error?.message}`)
    orderId = order.data.id
    const confirmOrder = await seller.c.rpc('confirm_marketplace_order', { p_order_id: orderId })
    if (confirmOrder.error != null) throw new Error(`could not confirm order: ${confirmOrder.error.message}`)
    const payment = await buyer.c.rpc('submit_payment', {
      p_order_id: orderId,
      p_payment_method: 'cash_on_pickup',
    })
    if (payment.error != null || payment.data == null) throw new Error(`could not submit payment: ${payment.error?.message}`)
    const preparing = await seller.c.rpc('start_order_preparation', { p_order_id: orderId })
    if (preparing.error != null) throw new Error(`could not prepare order: ${preparing.error.message}`)
    const ready = await seller.c.rpc('mark_order_ready_for_pickup', { p_order_id: orderId })
    if (ready.error != null) throw new Error(`could not mark pickup ready: ${ready.error.message}`)
    const paid = await seller.c.rpc('mark_cash_received', { p_payment_id: payment.data.id })
    if (paid.error != null) throw new Error(`could not record cash: ${paid.error.message}`)
    const completed = await buyer.c.rpc('confirm_order_received', { p_order_id: orderId })
    if (completed.error != null) throw new Error(`could not complete order: ${completed.error.message}`)
    check('completed order drives the admin verification data', completed.data?.status === 'completed', detail(completed.error ?? completed.data))

    const orderItem = await buyer.c.from('order_items').select('id').eq('order_id', orderId).limit(1).single()
    if (orderItem.error != null || orderItem.data == null) throw new Error(`could not load order item: ${orderItem.error?.message}`)
    const review = await buyer.c.rpc('submit_review', {
      p_order_item_id: orderItem.data.id,
      p_rating: 5,
      p_seller_rating: 5,
      p_comment: `Phase 13 admin verification review ${runId}`,
    })
    if (review.error != null || review.data == null) throw new Error(`could not submit review: ${review.error?.message}`)
    reviewId = review.data.id
    check('review published for admin verification', review.data?.status === 'approved')

    const report = await buyer.c.rpc('submit_listing_report', {
      p_listing_id: listingId,
      p_reason: 'other',
      p_description: `Phase 13 admin verification report ${runId}`,
    })
    if (report.error != null || report.data == null) throw new Error(`could not submit report: ${report.error?.message}`)
    reportId = report.data.id

    const dispute = await buyer.c.rpc('open_order_dispute', {
      p_order_id: orderId,
      p_reason: 'other',
      p_description: `Phase 13 admin verification dispute ${runId}`,
    })
    if (dispute.error != null || dispute.data == null) throw new Error(`could not open dispute: ${dispute.error?.message}`)
    disputeId = dispute.data.id

    const refund = await buyer.c.rpc('request_refund', {
      p_dispute_id: disputeId,
      p_requested_amount: payment.data?.amount ?? order.data?.total,
      p_reason: `Phase 13 admin verification refund ${runId}`,
    })
    if (refund.error != null || refund.data == null) throw new Error(`could not request refund: ${refund.error?.message}`)
    refundId = refund.data.id

    // ------------------------------------------------------------------
    // USER ADMIN
    // ------------------------------------------------------------------
    console.log('\n-- USER ADMIN --')
    const users = checkList('6. Admin can list users (admin_list_users)', await admin.c.rpc('admin_list_users', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    await expectDenied('7. Non-admin buyer denied from admin_list_users', buyer.c.rpc('admin_list_users', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))

    const suspend = await admin.c.rpc('admin_suspend_user', {
      p_user_id: stranger.user.id,
      p_reason: `Phase 13 user suspension verification ${runId}`,
    })
    check('8. Admin can suspend a user (admin_suspend_user)', suspend.error == null && suspend.data?.[0]?.account_status === 'suspended', detail(suspend.error ?? suspend.data))
    const reactivate = await admin.c.rpc('admin_reactivate_user', {
      p_user_id: stranger.user.id,
      p_reason: `Phase 13 user reactivation verification ${runId}`,
    })
    check('9. Admin can reactivate the same user (admin_reactivate_user)', reactivate.error == null && reactivate.data?.[0]?.account_status === 'active', detail(reactivate.error ?? reactivate.data))
    const suspendAudit = await admin.c.rpc('admin_list_admin_actions', { p_page: 1, p_page_size: 20, p_sort: 'newest', p_action_type: 'user_suspended' })
    check('10. Audit record created for admin action', (suspendAudit.data ?? []).some((r) => r.entity_id === stranger.user.id), detail(suspendAudit.error ?? suspendAudit.data))
    check('admin user list reflects the reusable accounts', users.length >= 3, detail(users.length))

    // ------------------------------------------------------------------
    // SELLER ADMIN
    // ------------------------------------------------------------------
    console.log('\n-- SELLER ADMIN --')
    checkList('11. Admin can list sellers (admin_list_sellers)', await admin.c.rpc('admin_list_sellers', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    await expectDenied('12. Non-admin denied from admin_list_sellers', buyer.c.rpc('admin_list_sellers', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))

    const pendingSellers = await admin.c.rpc('admin_list_sellers', { p_page: 1, p_page_size: 5, p_sort: 'newest', p_status: 'pending' })
    const pendingSellerId = pendingSellers.error == null ? pendingSellers.data?.[0]?.seller_id : null
    if (pendingSellerId != null) {
      const approve = await admin.c.rpc('admin_approve_seller', {
        p_seller_id: pendingSellerId,
        p_reason: `Phase 13 seller approval verification ${runId}`,
      })
      check('13. Admin can approve a pending seller', approve.error == null && approve.data?.[0]?.seller_status === 'active', detail(approve.error ?? approve.data))
    } else {
      skip('13. Admin can approve a pending seller', 'no pending seller exists')
    }

    const invalidApprove = await admin.c.rpc('admin_approve_seller', {
      p_seller_id: sellerId,
      p_reason: `Phase 13 invalid seller transition verification ${runId}`,
    })
    check('14. Invalid transition denied (approve an already active seller)', invalidApprove.error != null, detail(invalidApprove.error))

    // ------------------------------------------------------------------
    // LISTINGS
    // ------------------------------------------------------------------
    console.log('\n-- LISTINGS --')
    const listings = checkList('15. Admin can list listings (admin_list_listings)', await admin.c.rpc('admin_list_listings', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    check('admin listing list contains the run listing', listings.some((r) => r.listing_id === listingId), detail(listings.length))
    await expectDenied('16. Non-admin denied from admin_list_listings', buyer.c.rpc('admin_list_listings', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))

    const remove = await admin.c.rpc('admin_moderate_listing', {
      p_listing_id: listingId,
      p_action: 'remove',
      p_reason: `Phase 13 listing moderation verification ${runId}`,
    })
    check('17. Admin can moderate a listing (admin_moderate_listing remove)', remove.error == null && remove.data?.[0]?.listing_status === 'removed', detail(remove.error ?? remove.data))
    const listingAudit = await admin.c.rpc('admin_list_admin_actions', { p_page: 1, p_page_size: 20, p_sort: 'newest', p_action_type: 'listing_removed' })
    check('18. Audit record generated for listing moderation', (listingAudit.data ?? []).some((r) => r.entity_id === listingId), detail(listingAudit.error ?? listingAudit.data))
    const restore = await admin.c.rpc('admin_moderate_listing', {
      p_listing_id: listingId,
      p_action: 'restore',
      p_reason: `Phase 13 listing moderation restore ${runId}`,
    })
    check('moderated listing restored to draft', restore.error == null && restore.data?.[0]?.listing_status === 'draft', detail(restore.error ?? restore.data))
    const backActive = await seller.c.from('listings').update({ listing_status: 'active' }).eq('id', listingId).select('listing_status').single()
    check('moderated listing returned to active after restore', backActive.error == null && backActive.data?.listing_status === 'active', detail(backActive.error ?? backActive.data))

    // ------------------------------------------------------------------
    // REPORTS
    // ------------------------------------------------------------------
    console.log('\n-- REPORTS --')
    const reports = checkList('19. Admin can list reports (admin_list_listing_reports)', await admin.c.rpc('admin_list_listing_reports', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    check('admin report list contains the run report', (reports ?? []).some((r) => r.report_id === reportId), detail((reports ?? []).length))
    await expectDenied('20. Non-admin denied from admin_list_listing_reports', buyer.c.rpc('admin_list_listing_reports', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    const reportDetail = await admin.c.rpc('admin_get_listing_report', { p_report_id: reportId })
    check('21. Admin can read report details', reportDetail.error == null && reportDetail.data?.[0]?.report_id === reportId, detail(reportDetail.error ?? reportDetail.data))

    // ------------------------------------------------------------------
    // REVIEWS
    // ------------------------------------------------------------------
    console.log('\n-- REVIEWS --')
    const reviews = checkList('22. Admin can list reviews (admin_list_reviews)', await admin.c.rpc('admin_list_reviews', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    check('admin review list contains the run review', (reviews ?? []).some((r) => r.review_id === reviewId), detail((reviews ?? []).length))
    await expectDenied('23. Non-admin denied from admin_list_reviews', buyer.c.rpc('admin_list_reviews', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    const hide = await admin.c.rpc('admin_moderate_review', {
      p_review_id: reviewId,
      p_action: 'hide',
      p_reason: `Phase 13 review moderation verification ${runId}`,
    })
    check('24. Admin can hide a review (admin_moderate_review hide)', hide.error == null && hide.data?.[0]?.status === 'hidden', detail(hide.error ?? hide.data))
    const show = await admin.c.rpc('admin_moderate_review', {
      p_review_id: reviewId,
      p_action: 'restore',
      p_reason: `Phase 13 review moderation restore ${runId}`,
    })
    check('hidden review restored to approved', show.error == null && show.data?.[0]?.status === 'approved', detail(show.error ?? show.data))

    // ------------------------------------------------------------------
    // ORDERS / PAYMENTS
    // ------------------------------------------------------------------
    console.log('\n-- ORDERS/PAYMENTS --')
    const orders = checkList('25. Admin can list orders (admin_list_orders)', await admin.c.rpc('admin_list_orders', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    check('admin order list contains the run order', (orders ?? []).some((r) => r.order_id === orderId), detail((orders ?? []).length))
    await expectDenied('26. Non-admin denied from admin_list_orders', buyer.c.rpc('admin_list_orders', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))

    // ------------------------------------------------------------------
    // DISPUTES
    // ------------------------------------------------------------------
    console.log('\n-- DISPUTES --')
    const disputes = checkList('27. Admin can list disputes (admin_list_disputes)', await admin.c.rpc('admin_list_disputes', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    check('admin dispute list contains the run dispute', (disputes ?? []).some((r) => r.dispute_id === disputeId), detail((disputes ?? []).length))
    await expectDenied('28. Non-admin denied from admin_list_disputes', buyer.c.rpc('admin_list_disputes', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))

    // ------------------------------------------------------------------
    // REFUNDS
    // ------------------------------------------------------------------
    console.log('\n-- REFUNDS --')
    const refunds = checkList('29. Admin can list refunds (admin_list_refunds)', await admin.c.rpc('admin_list_refunds', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    check('admin refund list contains the run refund', (refunds ?? []).some((r) => r.refund_id === refundId), detail((refunds ?? []).length))
    await expectDenied('30. Non-admin denied from admin_list_refunds', buyer.c.rpc('admin_list_refunds', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))

    // ------------------------------------------------------------------
    // CATEGORIES / BRANDS
    // ------------------------------------------------------------------
    console.log('\n-- CATEGORIES/BRANDS --')
    checkList('31. Admin can list categories (admin_list_categories)', await admin.c.rpc('admin_list_categories', { p_page: 1, p_page_size: 20, p_sort: 'sort_order' }))
    checkList('32. Admin can list brands (admin_list_brands)', await admin.c.rpc('admin_list_brands', { p_page: 1, p_page_size: 20, p_sort: 'name_asc' }))
    await expectDenied('33. Non-admin denied from admin_list_categories', buyer.c.rpc('admin_list_categories', { p_page: 1, p_page_size: 20, p_sort: 'sort_order' }))

    // ------------------------------------------------------------------
    // AUDIT
    // ------------------------------------------------------------------
    console.log('\n-- AUDIT --')
    checkList('34. Admin can list admin actions (admin_list_admin_actions)', await admin.c.rpc('admin_list_admin_actions', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    await expectDenied('35. Non-admin denied from admin_list_admin_actions', buyer.c.rpc('admin_list_admin_actions', { p_page: 1, p_page_size: 20, p_sort: 'newest' }))
    const myActions = await admin.c.rpc('admin_list_admin_actions', { p_page: 1, p_page_size: 50, p_sort: 'newest', p_admin_id: admin.user.id })
    const myActionRows = Array.isArray(myActions.data) ? myActions.data : []
    check(
      '36. Audit records have admin_id matching the authenticated admin',
      myActions.error == null &&
        myActionRows.length > 0 &&
        myActionRows.every((r) => r.admin_id === admin.user.id) &&
        myActionRows.some((r) => r.action_type === 'user_suspended' && r.entity_id === stranger.user.id) &&
        myActionRows.some((r) => r.action_type === 'listing_removed' && r.entity_id === listingId),
      detail(myActions.error ?? myActionRows.length),
    )

    // ------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------
    console.log('\n-- SUMMARY --')
    const summary = await admin.c.rpc('admin_summary')
    check('37. Admin can call admin_summary', summary.error == null && Array.isArray(summary.data) && summary.data.length === 1 && typeof summary.data[0].total_users === 'number', detail(summary.error ?? summary.data))
    await expectDenied('38. Non-admin denied from admin_summary', buyer.c.rpc('admin_summary'))

    // ------------------------------------------------------------------
    // DIRECT ATTACKS
    // ------------------------------------------------------------------
    console.log('\n-- DIRECT ATTACKS --')
    await expectDenied('39. Buyer cannot call admin_suspend_user', buyer.c.rpc('admin_suspend_user', { p_user_id: stranger.user.id, p_reason: `Phase 13 attack attempt ${runId}` }))
    await expectDenied('40. Seller cannot call admin_moderate_listing', seller.c.rpc('admin_moderate_listing', { p_listing_id: listingId, p_action: 'remove', p_reason: `Phase 13 attack attempt ${runId}` }))
    const roleUpdate = await buyer.c.from('profiles').update({ role: 'admin' }).eq('id', buyer.user.id)
    check('41. Buyer cannot update profiles.role directly', roleUpdate.error != null, detail(roleUpdate.error))
    const insertAction = await buyer.c.from('admin_actions').insert({
      admin_id: buyer.user.id,
      action_type: 'user_suspended',
      entity_type: 'user',
      entity_id: stranger.user.id,
      reason: `Phase 13 forged audit ${runId}`,
      created_at: new Date().toISOString(),
    })
    check('42. Buyer cannot insert into admin_actions', insertAction.error != null, detail(insertAction.error))
    const myAuditRow = myActionRows[0]
    const updateAction = myAuditRow != null
      ? await buyer.c.from('admin_actions').update({ reason: `Phase 13 tampered audit ${runId}` }).eq('id', myAuditRow.action_id)
      : { error: null, data: [] }
    check('43. Buyer cannot update admin_actions', updateAction.error != null, detail(updateAction.error))

    // ------------------------------------------------------------------
    // MULTI-SELLER (optional)
    // ------------------------------------------------------------------
    console.log('\n-- MULTI-SELLER --')
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
            title: `Phase 13 seller B ${runId}`,
            description: 'Second-seller administration isolation listing.',
            listing_condition: 'used',
            price: 1750,
            quantity: 2,
            listing_status: 'active',
            pickup_available: true,
            delivery_available: false,
          })
          .select('id, listing_status')
          .single()
        if (listingB.error != null || listingB.data == null) throw new Error(`could not create seller B listing: ${listingB.error?.message}`)
        listingIds.push(listingB.data.id)
        const modA = await admin.c.rpc('admin_moderate_listing', {
          p_listing_id: listingId,
          p_action: 'remove',
          p_reason: `Phase 13 multi-seller isolation check ${runId}`,
        })
        check('44. Action on Seller A listing does not alter Seller B listing', modA.error == null && modA.data?.[0]?.listing_status === 'removed', detail(modA.error ?? modA.data))
        const listingBAfter = await sellerB.c.from('listings').select('listing_status').eq('id', listingB.data.id).single()
        check('Seller B listing remains unchanged', listingBAfter.error == null && listingBAfter.data?.listing_status === 'active', detail(listingBAfter.error ?? listingBAfter.data))
        const restA = await admin.c.rpc('admin_moderate_listing', {
          p_listing_id: listingId,
          p_action: 'restore',
          p_reason: `Phase 13 multi-seller isolation cleanup ${runId}`,
        })
        if (restA.error == null) {
          await seller.c.from('listings').update({ listing_status: 'active' }).eq('id', listingId)
        }
      } else {
        skip('44. multi-seller admin isolation', 'configured seller B is not active')
      }
    } else {
      skip('44. multi-seller admin isolation', 'PHASE8_TEST_SELLER_B_* is not configured')
    }

    // ------------------------------------------------------------------
    // CLEANUP
    // ------------------------------------------------------------------
    console.log('\n-- CLEANUP --')
    const strangerNow = await admin.c.from('profiles').select('account_status').eq('id', stranger.user.id).single()
    check('suspended user restored to active', strangerNow.data?.account_status === 'active', detail(strangerNow.error ?? strangerNow.data))
    const listingNow = await seller.c.from('listings').select('listing_status').eq('id', listingId).single()
    check('moderated listing restored and active', listingNow.data?.listing_status === 'active', detail(listingNow.error ?? listingNow.data))
    const reviewNow = await admin.c.from('reviews').select('status').eq('id', reviewId).single()
    check('hidden review restored to approved', reviewNow.data?.status === 'approved', detail(reviewNow.error ?? reviewNow.data))

    if (skipped > 0) console.log(`\nExplicit skips: ${skipped}`)
    console.log(failures === 0 ? '== Result: ALL PASS ==' : `== Result: FAIL (${failures} failures) ==`)
  } finally {
    // Best-effort cleanup even on failure: restore any suspended user, restore
    // any moderated listing, archive run listings, sign out.
    if (admin != null && stranger != null) {
      try {
        await admin.c.rpc('admin_reactivate_user', {
          p_user_id: stranger.user.id,
          p_reason: 'Phase 13 verification cleanup',
        })
      } catch {
        // Best effort through the supported RPC.
      }
    }
    await Promise.allSettled(
      listingIds.map((id) =>
        Promise.resolve((async () => {
          if (admin != null) {
            try {
              await admin.c.rpc('admin_moderate_listing', { p_listing_id: id, p_action: 'restore', p_reason: 'Phase 13 verification cleanup' })
            } catch {
              // best effort
            }
          }
          for (const c of [seller?.c, sellerB?.c]) {
            if (c != null) {
              try {
                await c.from('listings').update({ listing_status: 'archived' }).eq('id', id)
                break
              } catch {
                // best effort
              }
            }
          }
        })()),
      ),
    )
    await Promise.allSettled([
      admin?.c.auth.signOut(),
      seller?.c.auth.signOut(),
      buyer?.c.auth.signOut(),
      stranger?.c.auth.signOut(),
      sellerB?.c.auth.signOut(),
    ].filter(Boolean))
  }

  if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})