import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Hosted Phase 14 verification uses only the public anon key and reusable,
// confirmed accounts. It never signs users up, never uses a service-role key,
// and never promotes accounts to admin. Seller-side analytics are the primary
// focus; the admin-credential sections SKIP (never fabricate PASS) when the
// optional admin credential is absent or currently invalid, so the seller
// checks still run. Reruns never collide: run-scoped listings are archived in
// cleanup and real data is left untouched.

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
  console.error('SKIPPED: hosted Phase 14 verification requires confirmed reusable accounts.')
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

async function expectDenied(name, promise) {
  const result = await promise
  check(name, result.error != null, result.error == null ? 'unexpectedly succeeded' : '')
  return result
}

// Seller analytics RPCs are called without any seller id — the seller is
// always derived from auth.uid() server-side.
async function main() {
  console.log('== Phase 14 hosted verification (reporting + analytics) ==')
  console.log(`Run id: ${runId}`)

  let buyer = null
  let seller = null
  let stranger = null
  let sellerB = null
  let admin = null
  let adminConfirmed = false
  let sellerId = null
  const listingIds = []
  let listingId = null

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

    if (env.PHASE8_TEST_SELLER_B_EMAIL && env.PHASE8_TEST_SELLER_B_PASSWORD) {
      try {
        sellerB = await signIn('seller B', env.PHASE8_TEST_SELLER_B_EMAIL, env.PHASE8_TEST_SELLER_B_PASSWORD)
      } catch (error) {
        skip('seller B signs in', error.message)
      }
    }

    const adminEmail = env.PHASE14_TEST_ADMIN_EMAIL || env.PHASE13_TEST_ADMIN_EMAIL
    const adminPassword = env.PHASE14_TEST_ADMIN_PASSWORD || env.PHASE13_TEST_ADMIN_PASSWORD
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
      skip('admin signs in', 'PHASE14/PHASE13_TEST_ADMIN_* is not configured')
    }

    const sellerProfile = await seller.c
      .from('seller_profiles')
      .select('id, seller_status')
      .eq('user_id', seller.user.id)
      .single()
    sellerId = sellerProfile.data?.id
    check('seller profile exists and is active', sellerId != null && sellerProfile.data?.seller_status === 'active', detail(sellerProfile.error ?? sellerProfile.data))
    if (!sellerId) throw new Error('an active seller profile is required')

    const category = await buyer.c.from('categories').select('id').limit(1).single()
    const categoryId = category.data?.id
    if (!categoryId) throw new Error('at least one category is required')

    // ------------------------------------------------------------------
    // SETUP — a run-scoped listing so time-windowed ranking rows exist.
    // ------------------------------------------------------------------
    console.log('\n-- SETUP (run-scoped listing) --')
    const listing = await seller.c
      .from('listings')
      .insert({
        seller_id: sellerId,
        category_id: categoryId,
        title: `Phase 14 analytics verification ${runId}`,
        description: 'Hosted Phase 14 reporting and analytics verification listing.',
        listing_condition: 'like_new',
        price: 1250,
        quantity: 5,
        listing_status: 'active',
        pickup_available: true,
        delivery_available: false,
      })
      .select('id, listing_status, title')
      .single()
    if (listing.error != null || listing.data == null) throw new Error(`could not create listing: ${listing.error?.message}`)
    listingId = listing.data.id
    listingIds.push(listingId)
    check('run-scoped listing is active', listing.data.listing_status === 'active')

    // Use a wide window (up to 2190 days) so the run listing falls inside.
    const wideEnd = new Date().toISOString().slice(0, 10)
    const wideStart = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const monthStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // ------------------------------------------------------------------
    // MARKETPLACE ANALYTICS (admin; optional credential)
    // ------------------------------------------------------------------
    console.log('\n-- MARKETPLACE ANALYTICS (admin) --')
    if (adminConfirmed && admin != null) {
      const overview = await admin.c.rpc('admin_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd })
      check('1. Admin can read marketplace overview (admin_analytics_overview)', overview.error == null && Array.isArray(overview.data) && overview.data.length === 1, detail(overview.error ?? overview.data))

      const timeseries = await admin.c.rpc('admin_analytics_timeseries', { p_start_date: monthStart, p_end_date: wideEnd, p_bucket: 'week' })
      check('2. Admin can read weekly marketplace timeseries', timeseries.error == null && Array.isArray(timeseries.data) && timeseries.data.length > 0, detail(timeseries.error ?? timeseries.data))

      const categories = await admin.c.rpc('admin_analytics_categories', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'gross_sales_desc', p_page: 1, p_page_size: 25 })
      check('3. Admin can rank categories (admin_analytics_categories)', categories.error == null && Array.isArray(categories.data), detail(categories.error ?? categories.data))

      const topListings = await admin.c.rpc('admin_analytics_top_listings', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'newest', p_page: 1, p_page_size: 25 })
      check('4. Admin can read top listings (admin_analytics_top_listings)', topListings.error == null && Array.isArray(topListings.data) && topListings.data.some((r) => r.listing_id === listingId), detail(topListings.error ?? topListings.data))

      const topSellers = await admin.c.rpc('admin_analytics_top_sellers', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'gross_sales_desc', p_page: 1, p_page_size: 25 })
      check('5. Admin can read top sellers (admin_analytics_top_sellers)', topSellers.error == null && Array.isArray(topSellers.data) && topSellers.data.some((r) => r.seller_id === sellerId), detail(topSellers.error ?? topSellers.data))
    } else {
      for (const name of [
        '1. Admin can read marketplace overview (admin_analytics_overview)',
        '2. Admin can read weekly marketplace timeseries',
        '3. Admin can rank categories (admin_analytics_categories)',
        '4. Admin can read top listings (admin_analytics_top_listings)',
        '5. Admin can read top sellers (admin_analytics_top_sellers)',
      ]) {
        skip(name, 'admin credential not confirmed')
      }
    }

    // Denial is independent of the credential: non-admins must be refused.
    console.log('\n-- MARKETPLACE ANALYTICS (denial) --')
    await expectDenied('6. Buyer denied from admin_analytics_overview', buyer.c.rpc('admin_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd }))
    const anon = client()
    await expectDenied('7. Anonymous denied from admin_analytics_overview', anon.rpc('admin_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd }))
    await expectDenied('8. Seller denied from admin_analytics_timeseries', seller.c.rpc('admin_analytics_timeseries', { p_start_date: monthStart, p_end_date: wideEnd, p_bucket: 'week' }))

    // ------------------------------------------------------------------
    // SELLER ANALYTICS (primary; requires no admin)
    // ------------------------------------------------------------------
    console.log('\n-- SELLER ANALYTICS --')
    const sellerOverview = await seller.c.rpc('my_seller_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd })
    check('9. Seller can read own analytics overview', sellerOverview.error == null && Array.isArray(sellerOverview.data) && sellerOverview.data.length === 1, detail(sellerOverview.error ?? sellerOverview.data))

    const sellerTimeseries = await seller.c.rpc('my_seller_analytics_timeseries', { p_start_date: monthStart, p_end_date: wideEnd, p_bucket: 'week' })
    check('10. Seller can read weekly own-analytics timeseries', sellerTimeseries.error == null && Array.isArray(sellerTimeseries.data) && sellerTimeseries.data.length > 0, detail(sellerTimeseries.error ?? sellerTimeseries.data))

    const sellerMonthly = await seller.c.rpc('my_seller_analytics_timeseries', { p_start_date: wideStart, p_end_date: wideEnd, p_bucket: 'month' })
    const monthRows = (sellerMonthly.data ?? [])
    const monthTransacted = monthRows.reduce((sum, r) => sum + Number(r.transacted_orders ?? 0), 0)
    const monthGross = monthRows.reduce((sum, r) => sum + Number(r.gross_sales ?? 0), 0)
    const overviewRow = sellerOverview.data?.[0]
    check(
      '10a. Month-bucket totals match the overview (boundary-spanning window regression)',
      sellerMonthly.error == null && monthRows.length > 0 && overviewRow != null &&
        monthTransacted === Number(overviewRow.transacted_orders ?? 0) &&
        monthGross === Number(overviewRow.gross_sales ?? 0),
      detail(sellerMonthly.error ?? `month total ${monthTransacted}/${monthGross} vs overview ${overviewRow?.transacted_orders}/${overviewRow?.gross_sales}`),
    )

    const sellerListings = await seller.c.rpc('my_seller_analytics_listings', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'newest', p_page: 1, p_page_size: 50 })
    check('11. Seller can read own listing analytics (my_seller_analytics_listings)', sellerListings.error == null && Array.isArray(sellerListings.data) && sellerListings.data.some((r) => r.listing_id === listingId), detail(sellerListings.error ?? sellerListings.data))

    await expectDenied('12. Buyer (non-seller) denied from my_seller_analytics_overview', buyer.c.rpc('my_seller_analytics_overview', { p_start_date: wideStart, p_end_date: wideEnd }))
    await expectDenied('13. Buyer denied from my_seller_analytics_listings', buyer.c.rpc('my_seller_analytics_listings', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'newest', p_page: 1, p_page_size: 10 }))

    // ------------------------------------------------------------------
    // VALIDATION
    // ------------------------------------------------------------------
    console.log('\n-- VALIDATION --')
    const badRange = await seller.c.rpc('my_seller_analytics_overview', { p_start_date: wideEnd, p_end_date: wideStart })
    check('14. Reversed date range raises INVALID_DATE_RANGE', badRange.error != null && /INVALID_DATE_RANGE/.test(badRange.error.message), detail(badRange.error))

    const tooWide = await seller.c.rpc('my_seller_analytics_timeseries', { p_start_date: wideStart, p_end_date: wideEnd, p_bucket: 'day' })
    check('15. Day bucket beyond 92-day span raises INVALID_DATE_RANGE', tooWide.error != null && /INVALID_DATE_RANGE/.test(tooWide.error.message), detail(tooWide.error))

    const badBucket = await seller.c.rpc('my_seller_analytics_timeseries', { p_start_date: monthStart, p_end_date: wideEnd, p_bucket: 'yearly' })
    check('16. Invalid bucket raises INVALID_BUCKET', badBucket.error != null && /INVALID_BUCKET/.test(badBucket.error.message), detail(badBucket.error))

    const badSort = await seller.c.rpc('my_seller_analytics_listings', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'bogus', p_page: 1, p_page_size: 10 })
    check('17. Invalid sort raises INVALID_SORT', badSort.error != null && /INVALID_SORT/.test(badSort.error.message), detail(badSort.error))

    const zeroPage = await seller.c.rpc('my_seller_analytics_listings', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'newest', p_page: 0, p_page_size: 10 })
    check('18. Page below 1 raises INVALID_PAGINATION', zeroPage.error != null && /INVALID_PAGINATION/.test(zeroPage.error.message), detail(zeroPage.error))

    // ------------------------------------------------------------------
    // MULTI-SELLER ISOLATION (optional)
    // ------------------------------------------------------------------
    console.log('\n-- MULTI-SELLER ISOLATION --')
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
            title: `Phase 14 seller B ${runId}`,
            description: 'Second-seller analytics isolation listing.',
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

        const sellerOwn = await seller.c.rpc('my_seller_analytics_listings', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'newest', p_page: 1, p_page_size: 50 })
        check('19. Seller listing analytics are isolated to own listings only', sellerOwn.error == null && !(sellerOwn.data ?? []).some((r) => r.listing_id === listingB.data.id), detail(sellerOwn.error ?? sellerOwn.data))

        const sellerBFromA = await buyer.c.rpc('my_seller_analytics_listings', { p_start_date: wideStart, p_end_date: wideEnd, p_sort: 'newest', p_page: 1, p_page_size: 10 })
        check('20. Buyer cannot read seller analytics on behalf of seller B', sellerBFromA.error != null, detail(sellerBFromA.error))
      } else {
        skip('19-20. multi-seller analytics isolation', 'configured seller B is not active')
      }
    } else {
      skip('19-20. multi-seller analytics isolation', 'PHASE8_TEST_SELLER_B_* is not configured')
    }

    // ------------------------------------------------------------------
    // SUMMARY + CLEANUP
    // ------------------------------------------------------------------
    console.log('\n-- CLEANUP --')
    const listingNow = await seller.c.from('listings').select('listing_status').eq('id', listingId).single()
    check('run listing still active during the run', listingNow.data?.listing_status === 'active', detail(listingNow.error ?? listingNow.data))

    if (skipped > 0) console.log(`\nExplicit skips: ${skipped}`)
    console.log(failures === 0 ? '== Result: ALL PASS ==' : `== Result: FAIL (${failures} failures) ==`)
  } finally {
    // Best-effort cleanup: archive run listings, sign out.
    await Promise.allSettled(
      listingIds.map((id) =>
        Promise.resolve((async () => {
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