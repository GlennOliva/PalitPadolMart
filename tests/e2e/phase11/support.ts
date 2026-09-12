import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export type ActorName = 'buyerA' | 'buyerB' | 'sellerA' | 'sellerB' | 'anonymous'

interface Credentials {
  email: string
  password: string
}

export interface SeedActor {
  credentials: Credentials | null
  client: SupabaseClient
  userId: string | null
  accessToken: string | null
  sellerId: string | null
  storeName: string | null
}

export interface SeedOrder {
  id: string
  orderNumber: string
  paymentId: string | null
  amount: number
}

export interface Phase11Seed {
  runId: string
  supabaseUrl: string
  anonKey: string
  actors: Record<ActorName, SeedActor>
  sellerAListing: { id: string; title: string }
  sellerBListing: { id: string; title: string }
  mainOrder: SeedOrder
  rejectOrder: SeedOrder
  closeOrder: SeedOrder
  sellerBOrder: SeedOrder
  mainDisputeId: string | null
  rejectDisputeId: string | null
  closeDisputeId: string | null
  sellerBDisputeId: string | null
  evidencePath: string | null
}

type Row = Record<string, unknown>

function environment(): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = { ...process.env }
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
      if (match && values[match[1]] === undefined) {
        values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    // Shell-provided variables are sufficient.
  }
  return values
}

function required(values: Record<string, string | undefined>, name: string): string {
  const value = values[name]
  if (!value) throw new Error(`Phase 11 E2E requires ${name} in .env.local or the shell environment.`)
  return value
}

function text(row: Row, field: string): string {
  const value = row[field]
  if (typeof value !== 'string') throw new Error(`Expected ${field} in ${JSON.stringify(row)}`)
  return value
}

function numberValue(row: Row, field: string): number {
  const value = row[field]
  if (typeof value !== 'number') throw new Error(`Expected numeric ${field} in ${JSON.stringify(row)}`)
  return value
}

async function rpcRow(client: SupabaseClient, name: string, params: Row): Promise<Row> {
  const { data, error } = await client.rpc(name, params)
  if (error != null) throw new Error(`${name} failed: ${error.message}`)
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${name} returned no row: ${JSON.stringify(data)}`)
  }
  return data as Row
}

async function signIn(
  url: string,
  anonKey: string,
  label: string,
  credentials: Credentials,
): Promise<SeedActor> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword(credentials)
  if (error != null || data.user == null || data.session == null) {
    throw new Error(`Phase 11 E2E could not sign in ${label}: ${error?.message ?? 'no session'}`)
  }
  return {
    credentials,
    client,
    userId: data.user.id,
    accessToken: data.session.access_token,
    sellerId: null,
    storeName: null,
  }
}

async function sellerIdentity(actor: SeedActor, label: string) {
  const { data, error } = await actor.client
    .from('seller_profiles')
    .select('id, store_name, seller_status')
    .eq('user_id', actor.userId)
    .single()
  if (error != null || data?.seller_status !== 'active') {
    throw new Error(`Phase 11 E2E requires ${label} to have an active seller profile: ${error?.message ?? data?.seller_status}`)
  }
  actor.sellerId = data.id
  actor.storeName = data.store_name
}

async function createListing(
  actor: SeedActor,
  categoryId: string,
  title: string,
  price: number,
  quantity: number,
) {
  const { data, error } = await actor.client
    .from('listings')
    .insert({
      seller_id: actor.sellerId,
      category_id: categoryId,
      title,
      description: 'Run-scoped Phase 11 Playwright acceptance listing.',
      listing_condition: 'like_new',
      price,
      quantity,
      listing_status: 'active',
      pickup_available: true,
      delivery_available: false,
    })
    .select('id, title')
    .single()
  if (error != null || data == null) throw new Error(`Could not create ${title}: ${error?.message}`)
  return data
}

async function createOrder(buyer: SeedActor, listingId: string): Promise<SeedOrder> {
  const row = await rpcRow(buyer.client, 'create_marketplace_order', {
    p_listing_id: listingId,
    p_quantity: 1,
    p_fulfillment_type: 'pickup',
  })
  return {
    id: text(row, 'id'),
    orderNumber: text(row, 'order_number'),
    paymentId: null,
    amount: numberValue(row, 'total'),
  }
}

async function confirmOrder(seller: SeedActor, order: SeedOrder) {
  await rpcRow(seller.client, 'confirm_marketplace_order', { p_order_id: order.id })
}

async function makePaidReady(buyer: SeedActor, seller: SeedActor, order: SeedOrder) {
  await confirmOrder(seller, order)
  const payment = await rpcRow(buyer.client, 'submit_payment', {
    p_order_id: order.id,
    p_payment_method: 'cash_on_pickup',
  })
  order.paymentId = text(payment, 'id')
  await rpcRow(seller.client, 'start_order_preparation', { p_order_id: order.id })
  await rpcRow(seller.client, 'mark_order_ready_for_pickup', { p_order_id: order.id })
  await rpcRow(seller.client, 'mark_cash_received', { p_payment_id: order.paymentId })
}

export async function seedPhase11(): Promise<Phase11Seed> {
  const values = environment()
  const supabaseUrl = required(values, 'VITE_SUPABASE_URL')
  const anonKey = required(values, 'VITE_SUPABASE_ANON_KEY')
  const credentials = {
    buyerA: {
      email: required(values, 'PHASE7_TEST_BUYER_EMAIL'),
      password: required(values, 'PHASE7_TEST_BUYER_PASSWORD'),
    },
    buyerB: {
      email: required(values, 'PHASE8_TEST_BUYER_B_EMAIL'),
      password: required(values, 'PHASE8_TEST_BUYER_B_PASSWORD'),
    },
    sellerA: {
      email: required(values, 'PHASE7_TEST_SELLER_EMAIL'),
      password: required(values, 'PHASE7_TEST_SELLER_PASSWORD'),
    },
    sellerB: {
      email: required(values, 'PHASE8_TEST_SELLER_B_EMAIL'),
      password: required(values, 'PHASE8_TEST_SELLER_B_PASSWORD'),
    },
  }
  const anonymousClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const [buyerA, buyerB, sellerA, sellerB] = await Promise.all([
    signIn(supabaseUrl, anonKey, 'Buyer A', credentials.buyerA),
    signIn(supabaseUrl, anonKey, 'Buyer B', credentials.buyerB),
    signIn(supabaseUrl, anonKey, 'Seller A', credentials.sellerA),
    signIn(supabaseUrl, anonKey, 'Seller B', credentials.sellerB),
  ])
  await Promise.all([
    sellerIdentity(sellerA, 'Seller A'),
    sellerIdentity(sellerB, 'Seller B'),
  ])

  for (const seller of [sellerA, sellerB]) {
    const { error } = await seller.client.from('seller_payment_methods').upsert({
      seller_id: seller.sellerId,
      method: 'cash_on_pickup',
      is_enabled: true,
      instructions: 'Phase 11 Playwright pickup.',
    }, { onConflict: 'seller_id,method' })
    if (error != null) throw new Error(`Could not enable cash pickup: ${error.message}`)
  }

  const { data: category, error: categoryError } = await buyerA.client
    .from('categories')
    .select('id')
    .limit(1)
    .single()
  if (categoryError != null || category == null) throw new Error(`No category available: ${categoryError?.message}`)

  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const sellerAListing = await createListing(
    sellerA,
    category.id,
    `Phase 11 Browser Paddle A ${runId}`,
    1650,
    8,
  )
  const sellerBListing = await createListing(
    sellerB,
    category.id,
    `Phase 11 Browser Paddle B ${runId}`,
    2400,
    3,
  )

  const mainOrder = await createOrder(buyerA, sellerAListing.id)
  const rejectOrder = await createOrder(buyerA, sellerAListing.id)
  const closeOrder = await createOrder(buyerA, sellerAListing.id)
  const sellerBOrder = await createOrder(buyerA, sellerBListing.id)
  await makePaidReady(buyerA, sellerA, mainOrder)
  await makePaidReady(buyerA, sellerA, rejectOrder)
  await confirmOrder(sellerA, closeOrder)
  await makePaidReady(buyerA, sellerB, sellerBOrder)

  return {
    runId,
    supabaseUrl,
    anonKey,
    actors: {
      buyerA,
      buyerB,
      sellerA,
      sellerB,
      anonymous: {
        credentials: null,
        client: anonymousClient,
        userId: null,
        accessToken: null,
        sellerId: null,
        storeName: null,
      },
    },
    sellerAListing,
    sellerBListing,
    mainOrder,
    rejectOrder,
    closeOrder,
    sellerBOrder,
    mainDisputeId: null,
    rejectDisputeId: null,
    closeDisputeId: null,
    sellerBDisputeId: null,
    evidencePath: null,
  }
}

export async function disposePhase11(seed: Phase11Seed | null) {
  if (seed == null) return
  const buyer = seed.actors.buyerA.client
  for (const disputeId of [seed.rejectDisputeId, seed.sellerBDisputeId]) {
    if (disputeId != null) await buyer.rpc('close_my_dispute', { p_dispute_id: disputeId })
  }
  await Promise.allSettled(
    Object.values(seed.actors).map((actor) => actor.client.auth.signOut()),
  )
}

export async function loginThroughUi(page: Page, actor: SeedActor) {
  if (actor.credentials == null) throw new Error('Anonymous has no login credentials.')
  await page.goto('/login')
  await page.getByLabel('Email').fill(actor.credentials.email)
  await page.getByLabel('Password').fill(actor.credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

export async function rolePage(
  browser: Browser,
  actor: SeedActor,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await loginThroughUi(page, actor)
  return { context, page }
}

export async function browserSignedUrlStatus(
  page: Page,
  seed: Phase11Seed,
  actor: SeedActor,
  storagePath: string,
): Promise<number> {
  return page.evaluate(
    async ({ url, apiKey, token, path }) => {
      const response = await fetch(`${url}/storage/v1/object/sign/dispute-evidence/${path}`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${token ?? apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 300 }),
      })
      return response.status
    },
    {
      url: seed.supabaseUrl,
      apiKey: seed.anonKey,
      token: actor.accessToken,
      path: storagePath,
    },
  )
}
