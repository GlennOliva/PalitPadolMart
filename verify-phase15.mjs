import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Hosted Phase 15 verification (admin data visualization + report printing):
// the visualizations consume the same hosted analytics RPCs verified here, and
// the printable reports consume the admin list RPCs used by the distribution
// snapshots. The verifier uses only the public anon key and reusable, confirmed
// accounts; it never signs users up and never uses a service-role key. Seller
// checks always run; admin-positive checks SKIP (never fabricate PASS) when the
// optional admin credential is absent or currently invalid. No data is written.

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
  console.error('SKIPPED: hosted Phase 15 verification requires confirmed reusable accounts.')
  for (const name of missing) console.error(`  ${name}`)
  process.exit(2)
}

let failures = 0
let skipped = 0

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function check(name, ok, detailValue = '') {
  if (ok) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.error(`  FAIL  ${name}${detailValue ? ` - ${detailValue}` : ''}`)
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

async function expectDenied(name, promise) {
  const result = await promise
  check(name, result.error != null, result.error == null ? 'unexpectedly succeeded' : '')
  return result
}

async function main() {
  console.log('== Phase 15 hosted verification (admin data visualization + report printing) ==')

  let seller = null
  let buyer = null
  let stranger = null
  let admin = null
  let adminConfirmed = false

  try {
    // ------------------------------------------------------------------
    // AUTH
    // ------------------------------------------------------------------
    console.log('\n-- AUTH --')
    seller = await signIn('seller', env.PHASE7_TEST_SELLER_EMAIL, env.PHASE7_TEST_SELLER_PASSWORD)
    buyer = await signIn('buyer', env.PHASE7_TEST_BUYER_EMAIL, env.PHASE7_TEST_BUYER_PASSWORD)
    stranger = await signIn('stranger', env.PHASE7_TEST_STRANGER_EMAIL, env.PHASE7_TEST_STRANGER_PASSWORD)
    check('seller signs in with retained password auth', seller.user != null)
    check('buyer signs in with retained password auth', buyer.user != null)
    check('stranger signs in with retained password auth', stranger.user != null)

    const sellerProfile = await seller.c
      .from('seller_profiles')
      .select('id, seller_status')
      .eq('user_id', seller.user.id)
      .single()
    const sellerId = sellerProfile.data?.id
    check('seller profile exists and is active', sellerId != null && sellerProfile.data?.seller_status === 'active', detail(sellerProfile.error ?? sellerProfile.data))
    if (!sellerId) throw new Error('an active seller profile is required')

    const adminEmail = env.PHASE15_TEST_ADMIN_EMAIL || env.PHASE14_TEST_ADMIN_EMAIL || env.PHASE13_TEST_ADMIN_EMAIL
    const adminPassword = env.PHASE15_TEST_ADMIN_PASSWORD || env.PHASE14_TEST_ADMIN_PASSWORD || env.PHASE13_TEST_ADMIN_PASSWORD
    if (adminEmail && adminPassword) {
      try {
        admin = await signIn('admin', adminEmail, adminPassword)
        const adminProfile = await admin.c.from('profiles').select('role, account_status').eq('id', admin.user.id).single()
        if (adminProfile.data?.role === 'admin' && adminProfile.data?.account_status === 'active') {
          adminConfirmed = true
          check('admin signs in and is an active admin', true)
        } else {
          skip('admin signs in', 'configured admin account is not active/admin')
          admin = null
        }
      } catch (error) {
        skip('admin signs in', `${error.message} (admin-positive checks will SKIP; seller checks continue)`)
        admin = null
      }
    } else {
      skip('admin signs in', 'PHASE15/PHASE14/PHASE13_TEST_ADMIN_* is not configured')
    }

    const wideStart = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const wideEnd = new Date().toISOString().slice(0, 10)
    const monthStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // ------------------------------------------------------------------
    // SELLER ANALYTICS (feeds the seller dashboard charts; no admin needed)
    // ------------------------------------------------------------------
    console.log('\n-- SELLER ANALYTICS --')
    const sellerOverview = await seller.c.rpc('my_seller_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd })
    check('1. Seller can read own analytics overview', sellerOverview.error == null && Array.isArray(sellerOverview.data) && sellerOverview.data.length === 1, detail(sellerOverview.error ?? sellerOverview.data))

    const sellerTimeseries = await seller.c.rpc('my_seller_analytics_timeseries', { p_start_date: monthStart, p_end_date: wideEnd, p_bucket: 'week' })
    check('2. Seller can read weekly own-analytics timeseries', sellerTimeseries.error == null && Array.isArray(sellerTimeseries.data) && sellerTimeseries.data.length > 0, detail(sellerTimeseries.error ?? sellerTimeseries.data))

    const sellerListings = await seller.c.rpc('my_seller_analytics_listings', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'newest', p_page: 1, p_page_size: 25 })
    check('3. Seller can read own listing analytics', sellerListings.error == null && Array.isArray(sellerListings.data), detail(sellerListings.error ?? sellerListings.data))

    await expectDenied('4. Buyer (non-seller) denied from my_seller_analytics_overview', buyer.c.rpc('my_seller_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd }))
    await expectDenied('5. Anonymous denied from my_seller_analytics_overview', client().rpc('my_seller_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd }))

    const badRange = await seller.c.rpc('my_seller_analytics_overview', { p_start_date: wideEnd, p_end_date: wideStart })
    check('6. Reversed date range raises INVALID_DATE_RANGE', badRange.error != null && /INVALID_DATE_RANGE/.test(badRange.error.message), detail(badRange.error))

    // ------------------------------------------------------------------
    // ADMIN ANALYTICS + DISTRIBUTION RPC SURFACE (optional credential)
    // ------------------------------------------------------------------
    console.log('\n-- ADMIN ANALYTICS & DISTRIBUTIONS (admin) --')
    const adminChecks = [
      { name: '7. Admin reads marketplace overview (admin_analytics_overview)', invoke: () => admin.c.rpc('admin_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd }), guard: (r) => r.error == null && Array.isArray(r.data) && r.data.length === 1 },
      { name: '8. Admin reads weekly marketplace timeseries', invoke: () => admin.c.rpc('admin_analytics_timeseries', { p_start_date: monthStart, p_end_date: wideEnd, p_bucket: 'week' }), guard: (r) => r.error == null && Array.isArray(r.data) && r.data.length > 0 },
      { name: '9. Admin reads category ranking (admin_analytics_categories)', invoke: () => admin.c.rpc('admin_analytics_categories', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'gross_sales_desc', p_page: 1, p_page_size: 25 }), guard: (r) => r.error == null && Array.isArray(r.data) },
      { name: '10. Admin reads order status slice (admin_list_orders)', invoke: () => admin.c.rpc('admin_list_orders', { p_page: 1, p_page_size: 1, p_search: undefined, p_status: 'pending', p_payment_status: undefined, p_sort: 'newest' }), guard: (r) => r.error == null && typeof (r.data ?? {}).count === 'number' },
      { name: '11. Admin reads payment status slice (admin_list_orders)', invoke: () => admin.c.rpc('admin_list_orders', { p_page: 1, p_page_size: 1, p_search: undefined, p_status: undefined, p_payment_status: 'paid', p_sort: 'newest' }), guard: (r) => r.error == null && typeof (r.data ?? {}).count === 'number' },
      { name: '12. Admin reads dispute status slice (admin_list_disputes)', invoke: () => admin.c.rpc('admin_list_disputes', { p_page: 1, p_page_size: 1, p_search: undefined, p_status: 'open', p_sort: 'newest' }), guard: (r) => r.error == null && typeof (r.data ?? {}).count === 'number' },
      { name: '13. Admin reads refund status slice (admin_list_refunds)', invoke: () => admin.c.rpc('admin_list_refunds', { p_page: 1, p_page_size: 1, p_search: undefined, p_status: 'requested', p_sort: 'newest' }), guard: (r) => r.error == null && typeof (r.data ?? {}).count === 'number' },
      { name: '14. Admin reads review rating slice (admin_list_reviews)', invoke: () => admin.c.rpc('admin_list_reviews', { p_page: 1, p_page_size: 1, p_search: undefined, p_rating: 5, p_status: 'approved', p_sort: 'newest' }), guard: (r) => r.error == null && typeof (r.data ?? {}).count === 'number' },
    ]
    if (adminConfirmed && admin != null) {
      for (const item of adminChecks) {
        const result = await item.invoke()
        check(item.name, item.guard(result), detail(result.error ?? result.data))
      }
    } else {
      for (const item of adminChecks) skip(item.name, 'admin credential not confirmed')
    }

    console.log('\n-- ADMIN ANALYTICS (denial) --')
    await expectDenied('15. Buyer denied from admin_analytics_overview', buyer.c.rpc('admin_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd }))
    await expectDenied('16. Anonymous denied from admin_list_orders', client().rpc('admin_list_orders', { p_page: 1, p_page_size: 1, p_search: undefined, p_status: 'pending', p_payment_status: undefined, p_sort: 'newest' }))
    await expectDenied('17. Seller denied from admin_analytics_categories', seller.c.rpc('admin_analytics_categories', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'gross_sales_desc', p_page: 1, p_page_size: 25 }))

    // ------------------------------------------------------------------
    // VALIDATION
    // ------------------------------------------------------------------
    console.log('\n-- VALIDATION --')
    const badBucket = await seller.c.rpc('my_seller_analytics_timeseries', { p_start_date: monthStart, p_end_date: wideEnd, p_bucket: 'yearly' })
    check('18. Invalid bucket raises INVALID_BUCKET', badBucket.error != null && /INVALID_BUCKET/.test(badBucket.error.message), detail(badBucket.error))

    const zeroPage = await seller.c.rpc('my_seller_analytics_listings', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'newest', p_page: 0, p_page_size: 10 })
    check('19. Page below 1 raises INVALID_PAGINATION', zeroPage.error != null && /INVALID_PAGINATION/.test(zeroPage.error.message), detail(zeroPage.error))

    console.log(`\nExplicit skips: ${skipped}`)
    console.log(failures === 0 ? '== Result: ALL PASS ==' : `== Result: FAIL (${failures} failures) ==`)
  } finally {
    await Promise.allSettled([
      seller?.c.auth.signOut(),
      buyer?.c.auth.signOut(),
      stranger?.c.auth.signOut(),
      admin?.c.auth.signOut(),
    ].filter(Boolean))
  }

  if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})