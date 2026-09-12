import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// PHASE 7 HOSTED VERIFICATION
// ============================================================================
// Verifies the favorites + inquiries flows against the hosted Supabase project
// using three REUSABLE, CONFIRMED test accounts configured via environment
// variables. It NEVER creates Auth users: it only signs in with the provided
// credentials, runs the RLS-focused scenarios, cleans up the rows it created,
// and leaves the Auth accounts intact for future runs.
//
// Required credentials (local only — never commit real values):
//   PHASE7_TEST_SELLER_EMAIL / PHASE7_TEST_SELLER_PASSWORD
//   PHASE7_TEST_BUYER_EMAIL  / PHASE7_TEST_BUYER_PASSWORD
//   PHASE7_TEST_STRANGER_EMAIL / PHASE7_TEST_STRANGER_PASSWORD
//
// If any are missing the script SKIPS safely — it does not attempt signup.
// See PHASE7_VERIFICATION.md.
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
  console.error('SKIPPED: hosted Phase 7 verification requires confirmed reusable test accounts.')
  console.error('')
  console.error('Configure:')
  for (const name of REQUIRED_CREDS) console.error(`  ${name}`)
  process.exit(2)
}

const sellerEmail = env.PHASE7_TEST_SELLER_EMAIL
const sellerPassword = env.PHASE7_TEST_SELLER_PASSWORD
const buyerEmail = env.PHASE7_TEST_BUYER_EMAIL
const buyerPassword = env.PHASE7_TEST_BUYER_PASSWORD
const strangerEmail = env.PHASE7_TEST_STRANGER_EMAIL
const strangerPassword = env.PHASE7_TEST_STRANGER_PASSWORD

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

async function signOutAll(clients) {
  await Promise.allSettled(
    clients
      .filter((c) => c != null)
      .map((c) => c.auth.signOut().then(() => null).catch(() => null)),
  )
}

async function main() {
  console.log('== Phase 7 hosted verification (favorites + inquiries) ==')
  console.log(`Run id: ${runId}`)
  console.log(`Accounts (emails only): ${sellerEmail}, ${buyerEmail}, ${strangerEmail}`)

  const listingTitle = `Phase 7 verification ${runId}`

  let seller = null
  let buyer = null
  let stranger = null
  let listingId = null

  try {
    // 1. Sign in all three reusable accounts. No signup, no new Auth users.
    seller = await signIn('seller', sellerEmail, sellerPassword)
    buyer = await signIn('buyer', buyerEmail, buyerPassword)
    stranger = await signIn('stranger', strangerEmail, strangerPassword)
    console.log('  sign-in: OK (reusable confirmed accounts)')

    // 2. Seller profile: reuse an existing one or self-create (forced pending).
    let sellerId
    const { data: existingProfiles } = await seller.c
      .from('seller_profiles')
      .select('id, seller_status')
      .eq('user_id', seller.user.id)
    if ((existingProfiles ?? []).length > 0) {
      sellerId = existingProfiles[0].id
      check('seller profile reused', sellerId != null, toText(existingProfiles))
    } else {
      const { data: createdProfile, error: profileErr } = await seller.c
        .from('seller_profiles')
        .insert({ user_id: seller.user.id, store_name: `Ace Paddles ${runId}` })
        .select('id, seller_status')
        .single()
      check(
        'seller self-creates a seller profile',
        profileErr == null && createdProfile != null,
        profileErr?.message,
      )
      sellerId = createdProfile?.id
    }

    // 3. Seller owns an active, buyer-visible test listing.
    const { data: category } = await buyer.c.from('categories').select('id').limit(1).single()
    const { data: brand } = await buyer.c.from('brands').select('id').limit(1).maybeSingle()
    const { data: listing, error: listingErr } = await seller.c
      .from('listings')
      .insert({
        seller_id: sellerId,
        category_id: category.id,
        brand_id: brand?.id ?? null,
        title: listingTitle,
        description: 'Isolated Phase 7 verification listing.',
        listing_condition: 'like_new',
        price: 5500,
        quantity: 1,
        listing_status: 'active',
        pickup_available: true,
        delivery_available: false,
      })
      .select('id, title, listing_status')
      .single()
    check(
      'seller owns an active test listing',
      listingErr == null && listing != null && listing.listing_status === 'active',
      listingErr?.message,
    )
    listingId = listing?.id ?? null
    if (listingId == null) throw new Error('no listing id — cannot continue verification')

    // 4. Buyer favorites / removes.
    const { error: favAddErr } = await buyer.c
      .from('favorites')
      .insert({ user_id: buyer.user.id, listing_id: listingId })
    check('buyer favorites the listing', favAddErr == null, favAddErr?.message)

    const { data: favRow } = await buyer.c
      .from('favorites')
      .select('listing_id, listing_title')
      .eq('user_id', buyer.user.id)
      .single()
    check('favorite snapshots listing_title', favRow?.listing_title === listing.title, toText(favRow))

    const { error: favRemoveErr } = await buyer.c
      .from('favorites')
      .delete()
      .eq('user_id', buyer.user.id)
      .eq('listing_id', listingId)
    check('buyer removes the favorite', favRemoveErr == null, favRemoveErr?.message)

    const { data: favAfter } = await buyer.c
      .from('favorites')
      .select('id')
      .eq('listing_id', listingId)
    check('favorite is gone after removal', (favAfter ?? []).length === 0, toText(favAfter))

    // 5. Buyer opens an inquiry; snapshot + duplicate prevention.
    const inquiryPayload = {
      listing_id: listingId,
      buyer_id: buyer.user.id,
      seller_id: sellerId,
      subject: `Is ${listingTitle} available?`,
      message: 'Hi, is this still for sale?',
    }
    const { data: inq1, error: inq1Err } = await buyer.c
      .from('inquiries')
      .insert(inquiryPayload)
      .select('id, status, listing_title, buyer_id')
      .single()
    check('buyer opens an inquiry', inq1Err == null && inq1 != null, inq1Err?.message)
    check(
      'inquiry snapshots listing_title',
      inq1?.listing_title === listing.title,
      toText(inq1?.listing_title),
    )
    const inquiryId = inq1?.id

    const { error: inqDupErr } = await buyer.c.from('inquiries').insert(inquiryPayload)
    check(
      'duplicate open inquiry is rejected (unique index)',
      inqDupErr != null && String(inqDupErr.code) === '23505',
      inqDupErr?.message,
    )

    // 6. Seller reads the inquiry for their own listing.
    const { data: sellerInq } = await seller.c
      .from('inquiries')
      .select('id')
      .eq('id', inquiryId)
    check('seller reads inquiry for own listing', (sellerInq ?? []).length === 1, toText(sellerInq))

    // 7. Self-inquiry / ownership context: the seller cannot ask about their own listing.
    const { error: selfInqErr } = await seller.c
      .from('inquiries')
      .insert({ ...inquiryPayload, buyer_id: seller.user.id })
    check('seller cannot inquire about own listing', selfInqErr != null, selfInqErr?.message ?? 'expected rejection')

    // 8. Stranger denial on read + write.
    const { data: strangerInq } = await stranger.c
      .from('inquiries')
      .select('id')
      .eq('id', inquiryId)
    check('stranger cannot read the inquiry', (strangerInq ?? []).length === 0, toText(strangerInq))

    const { data: strangerMsgs } = await stranger.c
      .from('inquiry_messages')
      .select('id')
      .eq('inquiry_id', inquiryId)
    check('stranger cannot read inquiry messages', (strangerMsgs ?? []).length === 0, toText(strangerMsgs))

    const { error: strangerMsgInsErr } = await stranger.c
      .from('inquiry_messages')
      .insert({ inquiry_id: inquiryId, sender_id: stranger.user.id, message: 'hacked' })
    check('stranger cannot insert inquiry messages', strangerMsgInsErr != null, strangerMsgInsErr?.message ?? 'expected rejection')

    // 9. Stranger cannot delete the buyer's favorite (RLS filters the row silently).
    const { error: favReAddErr } = await buyer.c
      .from('favorites')
      .insert({ user_id: buyer.user.id, listing_id: listingId })
    check('buyer re-adds favorite for denial test', favReAddErr == null, favReAddErr?.message)

    const { data: strangerFavDel } = await stranger.c
      .from('favorites')
      .delete()
      .eq('user_id', buyer.user.id)
      .eq('listing_id', listingId)
    check('stranger delete of buyer favorite affects no rows', (strangerFavDel ?? []).length === 0, toText(strangerFavDel))
    const { data: favStillThere } = await buyer.c
      .from('favorites')
      .select('id')
      .eq('listing_id', listingId)
    check('buyer favorite still exists after stranger delete', (favStillThere ?? []).length === 1, toText(favStillThere))

    // 10. Impersonation is blocked: buyer/seller ids are forced to auth.uid().
    const { error: impersonateErr } = await stranger.c
      .from('inquiries')
      .insert({
        listing_id: listingId,
        buyer_id: buyer.user.id,
        seller_id: sellerId,
        subject: 'Impersonate?',
        message: 'trying to look like the buyer',
      })
    check('stranger cannot impersonate the buyer on inquiry insert', impersonateErr != null, impersonateErr?.message ?? 'expected rejection')

    // 11. Buyer cannot spoof a sender identity on messages.
    const { error: spoofErr } = await buyer.c
      .from('inquiry_messages')
      .insert({ inquiry_id: inquiryId, sender_id: seller.user.id, message: 'spoofed sender' })
    check('buyer cannot spoof message sender_id', spoofErr != null, spoofErr?.message ?? 'expected rejection')

    // 12. Buyer reply via RPC (status stays open), then seller reply (answered).
    const { data: reply1, error: reply1Err } = await buyer.c.rpc('send_inquiry_reply', {
      p_inquiry_id: inquiryId,
      p_message: 'Great, thanks!',
    })
    check('buyer reply creates a message', reply1Err == null && reply1?.id != null, reply1Err?.message)

    const { data: inqAfterBuyer } = await buyer.c
      .from('inquiries')
      .select('status')
      .eq('id', inquiryId)
      .single()
    check('buyer reply keeps inquiry open', inqAfterBuyer?.status === 'open', toText(inqAfterBuyer?.status))

    const { data: reply2, error: reply2Err } = await seller.c.rpc('send_inquiry_reply', {
      p_inquiry_id: inquiryId,
      p_message: 'Yes it is available!',
    })
    check('seller reply creates a message', reply2Err == null && reply2?.id != null, reply2Err?.message)

    const { data: inqAfterSeller } = await seller.c
      .from('inquiries')
      .select('status')
      .eq('id', inquiryId)
      .single()
    check('seller reply marks inquiry answered', inqAfterSeller?.status === 'answered', toText(inqAfterSeller?.status))

    const { data: sellerMsgs } = await seller.c
      .from('inquiry_messages')
      .select('id')
      .eq('inquiry_id', inquiryId)
    check('seller can read the reply thread', (sellerMsgs ?? []).length >= 2, toText(sellerMsgs))

    // 13. Read-marking: buyer has unread inbound, marks them read, cannot touch own.
    const { data: messagesBefore } = await buyer.c
      .from('inquiry_messages')
      .select('id, is_read, sender_id')
      .eq('inquiry_id', inquiryId)
      .order('created_at', { ascending: true })
    const unreadInbound = (messagesBefore ?? []).filter(
      (m) => !m.is_read && m.sender_id !== buyer.user.id,
    )
    check('buyer has unread inbound messages', unreadInbound.length >= 1, toText(messagesBefore))

    const { error: markErr } = await buyer.c
      .from('inquiry_messages')
      .update({ is_read: true })
      .eq('inquiry_id', inquiryId)
      .eq('is_read', false)
      .neq('sender_id', buyer.user.id)
    check('buyer marks inbound messages read', markErr == null, markErr?.message)

    const { data: messagesAfter } = await buyer.c
      .from('inquiry_messages')
      .select('id')
      .eq('inquiry_id', inquiryId)
      .eq('is_read', false)
      .neq('sender_id', buyer.user.id)
    check('no unread inbound messages remain', (messagesAfter ?? []).length === 0, toText(messagesAfter))

    const { error: markOwnErr } = await buyer.c
      .from('inquiry_messages')
      .update({ is_read: true })
      .eq('inquiry_id', inquiryId)
      .eq('sender_id', buyer.user.id)
    check('buyer cannot mark own messages read', markOwnErr != null, markOwnErr?.message ?? 'expected rejection')

    // 14. Stranger cannot reply via the RPC (caller has no seller profile, so
    // auth_seller_id() is NULL — this is the NULL three-valued-logic path the
    // hardened participant check must reject).
    const { error: strangerReplyErr } = await stranger.c.rpc('send_inquiry_reply', {
      p_inquiry_id: inquiryId,
      p_message: 'not my business',
    })
    check('stranger cannot reply to the inquiry', strangerReplyErr != null, strangerReplyErr?.message ?? 'expected rejection')

    // 14b. Cross-seller: a different seller (Seller B) must not be able to
    // reply to Seller A's listing inquiry either. The stranger self-creates a
    // pending seller profile and, as Seller B, must still be rejected because
    // that seller profile does not own the listing.
    const { data: existingStrangerProfiles } = await stranger.c
      .from('seller_profiles')
      .select('id')
      .eq('user_id', stranger.user.id)
    let strangerSellerId = (existingStrangerProfiles ?? [])[0]?.id ?? null
    if (strangerSellerId == null) {
      const { data: strangerProfile, error: strangerProfileErr } = await stranger.c
        .from('seller_profiles')
        .insert({ user_id: stranger.user.id, store_name: `Stranger Paddles ${runId}` })
        .select('id')
        .single()
      strangerSellerId = strangerProfile?.id ?? null
      check(
        'stranger can self-create a seller profile',
        strangerProfileErr == null && strangerSellerId != null,
        strangerProfileErr?.message,
      )
    }
    if (strangerSellerId != null) {
      const { error: crossSellerReplyErr } = await stranger.c.rpc('send_inquiry_reply', {
        p_inquiry_id: inquiryId,
        p_message: 'I am another seller',
      })
      check(
        'cross-seller cannot reply to another listing inquiry',
        crossSellerReplyErr != null,
        crossSellerReplyErr?.message ?? 'expected rejection',
      )
    }

    // 15. Close flow: close, replies rejected, new inquiry allowed after close.
    const { error: closeErr } = await buyer.c
      .from('inquiries')
      .update({ status: 'closed' })
      .eq('id', inquiryId)
      .select('id')
      .single()
    check('buyer closes the inquiry', closeErr == null, closeErr?.message)

    const { error: replyClosedErr } = await seller.c.rpc('send_inquiry_reply', {
      p_inquiry_id: inquiryId,
      p_message: 'too late',
    })
    check('replies are rejected after close', replyClosedErr != null, replyClosedErr?.message ?? 'expected rejection')

    const { error: replyClosedBuyerErr } = await buyer.c.rpc('send_inquiry_reply', {
      p_inquiry_id: inquiryId,
      p_message: 'buyer too late',
    })
    check('buyer cannot reply after close', replyClosedBuyerErr != null, replyClosedBuyerErr?.message ?? 'expected rejection')

    if (strangerSellerId != null) {
      const { error: replyClosedStrangerErr } = await stranger.c.rpc('send_inquiry_reply', {
        p_inquiry_id: inquiryId,
        p_message: 'stranger too late',
      })
      check('stranger cannot reply after close', replyClosedStrangerErr != null, replyClosedStrangerErr?.message ?? 'expected rejection')
    }

    const { error: inq2Err } = await buyer.c
      .from('inquiries')
      .insert({ ...inquiryPayload, subject: 'Round two after close', message: 'Still want it.' })
      .select('id')
      .single()
    check('buyer can open a new inquiry after close', inq2Err == null, inq2Err?.message)

    console.log(`\n== Result: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`} ==`)
  } catch (err) {
    failures += 1
    console.error(`\nERROR: ${err.message}`)
  } finally {
    // 16. Clean up only the rows this run created; Auth accounts stay intact.
    await cleanupListing(seller?.c ?? null, listingId)
    await signOutAll([seller?.c, buyer?.c, stranger?.c])
  }

  process.exitCode = failures === 0 ? 0 : 1
}

main()
