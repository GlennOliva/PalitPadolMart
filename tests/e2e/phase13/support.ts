import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export type Phase13Role = 'admin' | 'buyer' | 'seller'

export interface Phase13Actor {
  role: Phase13Role
  client: SupabaseClient
  session: Session
  userId: string
}

export interface Phase13Seed {
  storageKey: string
  actors: Record<Phase13Role, Phase13Actor>
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
  if (!value) throw new Error(`Phase 13 E2E requires ${name} in .env.local or the shell environment.`)
  return value
}

async function actorFor(
  role: Phase13Role,
  url: string,
  anonKey: string,
  credentials: { email: string; password: string },
): Promise<Phase13Actor> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword(credentials)
  if (error != null || data.user == null || data.session == null) {
    throw new Error(`Phase 13 E2E could not sign in ${role}: ${error?.message ?? 'no session'}`)
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

export async function seedPhase13(): Promise<Phase13Seed> {
  const values = environment()
  const url = required(values, 'VITE_SUPABASE_URL')
  const anonKey = required(values, 'VITE_SUPABASE_ANON_KEY')
  const credentials = {
    admin: {
      email: required(values, 'PHASE13_TEST_ADMIN_EMAIL'),
      password: required(values, 'PHASE13_TEST_ADMIN_PASSWORD'),
    },
    buyer: {
      email: required(values, 'PHASE7_TEST_BUYER_EMAIL'),
      password: required(values, 'PHASE7_TEST_BUYER_PASSWORD'),
    },
    seller: {
      email: required(values, 'PHASE7_TEST_SELLER_EMAIL'),
      password: required(values, 'PHASE7_TEST_SELLER_PASSWORD'),
    },
  }
  const [admin, buyer, seller] = await Promise.all([
    actorFor('admin', url, anonKey, credentials.admin),
    actorFor('buyer', url, anonKey, credentials.buyer),
    actorFor('seller', url, anonKey, credentials.seller),
  ])
  return {
    storageKey: storageKeyFor(url),
    actors: { admin, buyer, seller },
  }
}

export async function disposePhase13(seed: Phase13Seed | null) {
  if (seed == null) return
  await Promise.allSettled(
    Object.values(seed.actors).map((actor) => actor.client.auth.signOut()),
  )
}

export async function phase13RolePage(
  browser: Browser,
  seed: Phase13Seed,
  role: Phase13Role,
): Promise<{ context: BrowserContext; page: Page }> {
  const sessionJson = JSON.stringify(seed.actors[role].session)
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