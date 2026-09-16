import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export type Phase15Role = 'seller' | 'admin'

export interface Phase15Actor {
  role: Phase15Role
  client: SupabaseClient
  session: Session
  userId: string
}

export interface Phase15Seed {
  storageKey: string
  actors: Record<Phase15Role, Phase15Actor | null>
}

export interface Phase15SellerReviewStats {
  approvedReviews: number
  avgRating: number | null
}

export async function sellerReviewStats(
  seed: Phase15Seed,
): Promise<Phase15SellerReviewStats> {
  const seller = seed.actors.seller
  if (seller == null) throw new Error('Phase 15 E2E missing seller session.')
  const { data, error } = await seller.client.rpc('get_my_seller_rating_summary')
  if (error != null) {
    throw new Error(`Phase 15 E2E could not read the seller rating summary: ${error.message}`)
  }
  const row = (data ?? []) as { review_count: number; average_rating: number | null }[]
  return { approvedReviews: row[0]?.review_count ?? 0, avgRating: row[0]?.average_rating ?? null }
}

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
  }
  return values
}

function required(values: Record<string, string | undefined>, name: string): string {
  const value = values[name]
  if (!value) throw new Error(`Phase 15 E2E requires ${name} in .env.local or the shell environment.`)
  return value
}

function optional(values: Record<string, string | undefined>, name: string): string | null {
  return values[name] || null
}

async function actorFor(
  role: Phase15Role,
  url: string,
  anonKey: string,
  credentials: { email: string; password: string } | null,
): Promise<Phase15Actor | null> {
  if (credentials == null) return null
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword(credentials)
  if (error != null || data.user == null || data.session == null) {
    return null
  }
  return {
    role,
    client,
    session: data.session,
    userId: data.user.id,
  }
}

function storageKeyFor(url: string): string {
  const ref = new URL(url).hostname.split('.')[0]
  return `sb-${ref}-auth-token`
}

export async function seedPhase15(): Promise<Phase15Seed> {
  const values = environment()
  const url = required(values, 'VITE_SUPABASE_URL')
  const anonKey = required(values, 'VITE_SUPABASE_ANON_KEY')
  const seller = await actorFor('seller', url, anonKey, {
    email: required(values, 'PHASE7_TEST_SELLER_EMAIL'),
    password: required(values, 'PHASE7_TEST_SELLER_PASSWORD'),
  })
  const admin = await actorFor('admin', url, anonKey, {
    email: optional(values, 'PHASE15_TEST_ADMIN_EMAIL') ?? optional(values, 'PHASE14_TEST_ADMIN_EMAIL') ?? optional(values, 'PHASE13_TEST_ADMIN_EMAIL') ?? '',
    password: optional(values, 'PHASE15_TEST_ADMIN_PASSWORD') ?? optional(values, 'PHASE14_TEST_ADMIN_PASSWORD') ?? optional(values, 'PHASE13_TEST_ADMIN_PASSWORD') ?? '',
  })
  if (seller == null) {
    throw new Error('Phase 15 E2E requires a confirmed seller account.')
  }
  return {
    storageKey: storageKeyFor(url),
    actors: { seller, admin },
  }
}

export async function disposePhase15(seed: Phase15Seed | null) {
  if (seed == null) return
  await Promise.allSettled(
    Object.values(seed.actors)
      .filter((actor) => actor != null)
      .map((actor) => (actor as Phase15Actor).client.auth.signOut()),
  )
}

export async function phase15RolePage(
  browser: Browser,
  seed: Phase15Seed,
  role: Phase15Role,
): Promise<{ context: BrowserContext; page: Page }> {
  const actor = seed.actors[role]
  if (actor == null) throw new Error(`Phase 15 E2E missing session for role ${role}.`)
  const sessionJson = JSON.stringify(actor.session)
  const context = await browser.newContext()
  await context.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // noop
      }
    },
    { key: seed.storageKey, value: sessionJson },
  )
  const page = await context.newPage()
  return { context, page }
}