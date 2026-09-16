import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export type Phase14Role = 'seller' | 'buyer' | 'admin'

export interface Phase14Actor {
  role: Phase14Role
  client: SupabaseClient
  session: Session
  userId: string
}

export interface Phase14Seed {
  storageKey: string
  actors: Record<Phase14Role, Phase14Actor | null>
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
  if (!value) throw new Error(`Phase 14 E2E requires ${name} in .env.local or the shell environment.`)
  return value
}

function optional(values: Record<string, string | undefined>, name: string): string | null {
  return values[name] || null
}

async function actorFor(
  role: Phase14Role,
  url: string,
  anonKey: string,
  credentials: { email: string; password: string } | null,
): Promise<Phase14Actor | null> {
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

export async function seedPhase14(): Promise<Phase14Seed> {
  const values = environment()
  const url = required(values, 'VITE_SUPABASE_URL')
  const anonKey = required(values, 'VITE_SUPABASE_ANON_KEY')
  const seller = await actorFor('seller', url, anonKey, {
    email: required(values, 'PHASE7_TEST_SELLER_EMAIL'),
    password: required(values, 'PHASE7_TEST_SELLER_PASSWORD'),
  })
  const buyer = await actorFor('buyer', url, anonKey, {
    email: required(values, 'PHASE7_TEST_BUYER_EMAIL'),
    password: required(values, 'PHASE7_TEST_BUYER_PASSWORD'),
  })
  const admin = await actorFor('admin', url, anonKey, {
    email: optional(values, 'PHASE14_TEST_ADMIN_EMAIL') ?? optional(values, 'PHASE13_TEST_ADMIN_EMAIL') ?? '',
    password: optional(values, 'PHASE14_TEST_ADMIN_PASSWORD') ?? optional(values, 'PHASE13_TEST_ADMIN_PASSWORD') ?? '',
  })
  if (seller == null || buyer == null) {
    throw new Error('Phase 14 E2E requires confirmed seller and buyer accounts.')
  }
  return {
    storageKey: storageKeyFor(url),
    actors: { seller, buyer, admin },
  }
}

export async function disposePhase14(seed: Phase14Seed | null) {
  if (seed == null) return
  await Promise.allSettled(
    Object.values(seed.actors)
      .filter((actor) => actor != null)
      .map((actor) => (actor as Phase14Actor).client.auth.signOut()),
  )
}

export async function phase14RolePage(
  browser: Browser,
  seed: Phase14Seed,
  role: Phase14Role,
): Promise<{ context: BrowserContext; page: Page }> {
  const actor = seed.actors[role]
  if (actor == null) throw new Error(`Phase 14 E2E missing session for role ${role}.`)
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