import type { Browser, BrowserContext, Page } from '@playwright/test'
import {
  disposePhase11,
  rolePage,
  seedPhase11,
  type Phase11Seed,
  type SeedActor,
} from '../phase11/support.js'

export interface Phase12Seed {
  base: Phase11Seed
  inquiryId: string
  replyCount: number
}

export async function seedPhase12(): Promise<Phase12Seed> {
  const base = await seedPhase11()
  const { buyerA, buyerB, sellerA, sellerB } = base.actors

  for (const actor of [buyerA, buyerB, sellerA, sellerB]) {
    const { error } = await actor.client.rpc('mark_all_notifications_read')
    if (error != null) throw new Error(`Could not clear ${actor.userId} notification baseline: ${error.message}`)
  }

  const { data: inquiry, error: inquiryError } = await buyerA.client
    .from('inquiries')
    .insert({
      listing_id: base.sellerAListing.id,
      buyer_id: buyerA.userId,
      seller_id: sellerA.sellerId,
      subject: `Phase 12 browser inquiry ${base.runId}`,
      message: 'Is this paddle still available for pickup?',
    })
    .select('id')
    .single()
  if (inquiryError != null || inquiry == null) {
    throw new Error(`Could not create Phase 12 inquiry: ${inquiryError?.message}`)
  }

  const replyCount = 12
  for (let index = 1; index <= replyCount; index += 1) {
    const { error } = await sellerA.client.rpc('send_inquiry_reply', {
      p_inquiry_id: inquiry.id,
      p_message: `Phase 12 browser reply ${index} of ${replyCount}.`,
    })
    if (error != null) throw new Error(`Could not create notification reply ${index}: ${error.message}`)
  }

  return { base, inquiryId: inquiry.id, replyCount }
}

export async function disposePhase12(seed: Phase12Seed | null) {
  await disposePhase11(seed?.base ?? null)
}

export async function phase12RolePage(
  browser: Browser,
  actor: SeedActor,
): Promise<{ context: BrowserContext; page: Page }> {
  return rolePage(browser, actor)
}
