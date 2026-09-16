import path from 'node:path'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import type { Browser, Locator, Page } from '@playwright/test'
import {
  browserSignedUrlStatus,
  disposePhase11,
  rolePage,
  seedPhase11,
} from './support.js'
import type { Phase11Seed, SeedActor, SeedOrder } from './support.js'

const BUYER_MESSAGE = 'The item I received does not match the description.'
const SELLER_MESSAGE = 'Thank you. I will review the evidence.'
const REPORT_DESCRIPTION = 'Phase 11 browser report: seller requested an unsafe off-platform payment.'
const REFUND_REASON = 'The pickup item did not match the listing description.'
const REJECTION_REASON = 'The submitted evidence shows the correct listed item.'
const MANUAL_REFERENCE = 'P11-E2E-MANUAL-REFUND'
const FIXTURE_PDF = path.resolve('tests/fixtures/valid-evidence.pdf')
const FIXTURE_TEXT = path.resolve('tests/fixtures/invalid-evidence.txt')

let seed: Phase11Seed | null = null

function requiredSeed(): Phase11Seed {
  if (seed == null) throw new Error('Phase 11 E2E seed was not initialized.')
  return seed
}

async function expectNoRawErrors(page: Page) {
  await expect(page.locator('body')).not.toContainText(/row-level security|permission denied|violates.*policy|SQLSTATE|PGRST\d+/i)
}

async function openDisputeThroughUi(
  browser: Browser,
  actor: SeedActor,
  order: SeedOrder,
  reasonLabel: string,
  description: string,
) {
  const { context, page } = await rolePage(browser, actor)
  await page.goto('/orders')
  await expect(page.getByRole('heading', { name: 'My orders' })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(order.orderNumber) }).click()
  await expect(page.getByRole('heading', { name: order.orderNumber })).toBeVisible()
  await page.getByRole('link', { name: 'Report a problem' }).click()
  await expect(page.getByRole('heading', { name: 'Report a problem' })).toBeVisible()
  await page.getByLabel(/^Reason/).selectOption({ label: reasonLabel })
  await page.getByLabel(/^What happened/).fill(description)
  await page.getByRole('button', { name: 'Open dispute' }).click()
  await expect(page).toHaveURL(/\/disputes\/[0-9a-f-]+$/)
  const disputeId = page.url().split('/').pop()
  if (!disputeId) throw new Error('Dispute route did not contain an id.')
  return { context, page, disputeId }
}

async function requestRefundThroughUi(page: Page, amount: number, reason: string) {
  const refund = page.getByRole('region', { name: 'Refund' })
  await expect(refund.getByText('Requested amount')).toBeVisible()
  await expect(refund.getByText(`₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)).toBeVisible()
  await expect(refund.getByRole('spinbutton')).toHaveCount(0)
  await refund.getByLabel(/^Refund reason/).fill(reason)
  await refund.getByRole('button', { name: 'Request full refund' }).click()
  await expect(refund.getByText('Requested', { exact: true }).first()).toBeVisible()
}

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(metrics.content).toBeLessThanOrEqual(metrics.viewport + 1)
}

async function assertPadded(locator: Locator, minimum = 8) {
  const padding = await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      left: Number.parseFloat(style.paddingLeft),
      right: Number.parseFloat(style.paddingRight),
    }
  })
  expect(padding.left).toBeGreaterThanOrEqual(minimum)
  expect(padding.right).toBeGreaterThanOrEqual(minimum)
}

test.describe.serial('Phase 11 automated browser acceptance', () => {
  test.beforeAll(async () => {
    seed = await seedPhase11()
  })

  test.afterAll(async () => {
    await disposePhase11(seed)
  })

  test('buyer reports a listing through the marketplace and duplicate report is safe', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await rolePage(browser, state.actors.buyerA)
    try {
      await page.getByRole('link', { name: 'Marketplace' }).click()
      await page.getByLabel('Search listings').fill(state.sellerAListing.title)
      const listingLink = page.getByRole('link', { name: state.sellerAListing.title })
      await expect(listingLink).toBeVisible()
      await listingLink.click()
      await expect(page.getByRole('heading', { name: state.sellerAListing.title })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Report listing' })).toBeVisible()

      await page.getByRole('button', { name: 'Report listing' }).click()
      const dialog = page.getByRole('dialog', { name: 'Report listing' })
      await expect(dialog).toBeVisible()
      await dialog.getByLabel(/^Reason/).selectOption('scam_or_fraud')
      await dialog.getByLabel(/^Details/).fill(REPORT_DESCRIPTION)
      await dialog.getByRole('button', { name: 'Submit report' }).click()
      await expect(dialog.getByText('Thanks for reporting this listing.')).toBeVisible()
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()

      await page.getByRole('button', { name: 'Report listing' }).click()
      await dialog.getByLabel(/^Reason/).selectOption('other')
      await dialog.getByLabel(/^Details/).fill('Duplicate browser report attempt.')
      await dialog.getByRole('button', { name: 'Submit report' }).click()
      await expect(dialog.getByText('You already have an active report for this listing.')).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('buyer opens one dispute from order UI and the duplicate route reuses it', async ({ browser }) => {
    const state = requiredSeed()
    const opened = await openDisputeThroughUi(
      browser,
      state.actors.buyerA,
      state.mainOrder,
      'Item not as described',
      'The paddle received at pickup differs from the listing description.',
    )
    try {
      state.mainDisputeId = opened.disputeId
      await expect(opened.page.getByRole('heading', { name: 'Item not as described' })).toBeVisible()
      await expect(opened.page.getByText(`Order ${state.mainOrder.orderNumber}`)).toBeVisible()
      await expect(opened.page.getByText(new RegExp(`Seller: ${state.actors.sellerA.storeName}`))).toBeVisible()
      await expect(opened.page.getByText('Open', { exact: true }).first()).toBeVisible()

      await opened.page.goto(`/orders/${state.mainOrder.id}/dispute`)
      await expect(opened.page).toHaveURL(`/disputes/${opened.disputeId}`)
      await expect(opened.page.getByRole('button', { name: 'Open dispute' })).toHaveCount(0)

      await opened.page.goto(`/orders/${state.mainOrder.id}`)
      await expect(opened.page.getByRole('link', { name: 'View dispute' })).toHaveAttribute(
        'href',
        `/disputes/${opened.disputeId}`,
      )
      await expectNoRawErrors(opened.page)
    } finally {
      await opened.context.close()
    }
  })

  test('buyer messages, validates evidence, uploads PDF, and requests trusted full refund', async ({ browser }) => {
    const state = requiredSeed()
    const disputeId = state.mainDisputeId
    if (disputeId == null) throw new Error('Main dispute was not created.')
    const { context, page } = await rolePage(browser, state.actors.buyerA)
    try {
      await page.goto(`/disputes/${disputeId}`)
      await page.getByLabel(/^Add a message/).fill(BUYER_MESSAGE)
      await page.getByRole('button', { name: 'Send message' }).click()
      await expect(page.getByText(BUYER_MESSAGE)).toBeVisible()

      const evidenceInput = page.getByLabel('Add evidence')
      await evidenceInput.setInputFiles(FIXTURE_TEXT)
      await expect(page.getByText(/Evidence must be a JPG, JPEG, PNG, WebP, or PDF/)).toBeVisible()
      await expectNoRawErrors(page)

      await evidenceInput.setInputFiles({
        name: 'oversized.png',
        mimeType: 'image/png',
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1),
      })
      await expect(page.getByText(/5 MB or smaller/)).toBeVisible()

      await evidenceInput.setInputFiles(FIXTURE_PDF)
      await page.getByRole('button', { name: 'Upload evidence' }).click()
      await expect(page.getByText('valid-evidence.pdf')).toBeVisible()
      const evidenceResult = await state.actors.buyerA.client
        .from('dispute_evidence')
        .select('storage_path')
        .eq('dispute_id', disputeId)
        .single()
      if (evidenceResult.error != null || evidenceResult.data?.storage_path == null) {
        throw new Error(`Evidence metadata was not stored: ${evidenceResult.error?.message}`)
      }
      state.evidencePath = evidenceResult.data.storage_path

      await requestRefundThroughUi(page, state.mainOrder.amount, REFUND_REASON)
      await expect(page.getByRole('region', { name: 'Refund' }).getByText(REFUND_REASON)).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('Buyer B, Seller B, and anonymous browser contexts cannot access Seller A case or evidence', async ({ browser }) => {
    const state = requiredSeed()
    const disputeId = state.mainDisputeId
    const evidencePath = state.evidencePath
    if (disputeId == null || evidencePath == null) throw new Error('Main dispute evidence is unavailable.')

    const buyerB = await rolePage(browser, state.actors.buyerB)
    try {
      await buyerB.page.goto(`/disputes/${disputeId}`)
      await expect(buyerB.page.getByRole('heading', { name: 'Dispute not found' })).toBeVisible()
      await expect(buyerB.page.getByText(BUYER_MESSAGE)).toHaveCount(0)
      expect(await browserSignedUrlStatus(buyerB.page, state, state.actors.buyerB, evidencePath)).not.toBe(200)
    } finally {
      await buyerB.context.close()
    }

    const sellerB = await rolePage(browser, state.actors.sellerB)
    try {
      await sellerB.page.goto(`/seller/disputes/${disputeId}`)
      await expect(sellerB.page.getByRole('heading', { name: 'Dispute not found' })).toBeVisible()
      await expect(sellerB.page.getByText(BUYER_MESSAGE)).toHaveCount(0)
      expect(await browserSignedUrlStatus(sellerB.page, state, state.actors.sellerB, evidencePath)).not.toBe(200)
    } finally {
      await sellerB.context.close()
    }

    const anonymousContext = await browser.newContext()
    const anonymousPage = await anonymousContext.newPage()
    try {
      await anonymousPage.goto(`/disputes/${disputeId}`)
      await expect(anonymousPage).toHaveURL(/\/login$/)
      await expect(anonymousPage.getByText(BUYER_MESSAGE)).toHaveCount(0)
      expect(await browserSignedUrlStatus(anonymousPage, state, state.actors.anonymous, evidencePath)).not.toBe(200)
    } finally {
      await anonymousContext.close()
    }

    const sellerPrivacy = await rolePage(browser, state.actors.sellerA)
    try {
      await sellerPrivacy.page.goto(`/marketplace/${state.sellerAListing.id}`)
      await expect(sellerPrivacy.page.getByText(REPORT_DESCRIPTION)).toHaveCount(0)
      await expect(sellerPrivacy.page.getByRole('button', { name: 'Report listing' })).toHaveCount(0)
    } finally {
      await sellerPrivacy.context.close()
    }
  })

  test('Seller A discovers the dispute in navigation, reads evidence, replies, and approves refund', async ({ browser }) => {
    const state = requiredSeed()
    const disputeId = state.mainDisputeId
    const evidencePath = state.evidencePath
    if (disputeId == null || evidencePath == null) throw new Error('Main dispute is unavailable.')
    const { context, page } = await rolePage(browser, state.actors.sellerA)
    try {
      await page.getByRole('link', { name: 'Seller Dashboard', exact: true }).click()
      await page.getByRole('link', { name: 'Disputes', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Store disputes' })).toBeVisible()
      const disputeLink = page.getByRole('link', { name: new RegExp(state.mainOrder.orderNumber) })
      await expect(disputeLink).toBeVisible()
      await expect(page.getByText(state.sellerBOrder.orderNumber)).toHaveCount(0)
      await disputeLink.click()

      await expect(page.getByText(BUYER_MESSAGE)).toBeVisible()
      await expect(page.getByText('valid-evidence.pdf')).toBeVisible()
      expect(await browserSignedUrlStatus(page, state, state.actors.sellerA, evidencePath)).toBe(200)
      const popupPromise = page.waitForEvent('popup')
      await page.getByRole('button', { name: 'View evidence' }).click()
      const popup = await popupPromise
      expect(popup.isClosed()).toBe(false)
      await popup.close()

      await page.getByLabel(/^Add a message/).fill(SELLER_MESSAGE)
      await page.getByRole('button', { name: 'Send message' }).click()
      await expect(page.getByText(SELLER_MESSAGE)).toBeVisible()

      const refund = page.getByRole('region', { name: 'Refund' })
      await expect(refund.getByText(`₱${state.mainOrder.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)).toBeVisible()
      await refund.getByRole('button', { name: 'Approve refund' }).click()
      await expect(refund.getByRole('group', { name: 'Approve this full refund?' })).toBeVisible()
      await refund.getByRole('button', { name: 'Yes, approve refund' }).click()
      await expect(refund.getByText('Approved', { exact: true }).first()).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('Buyer A sees seller response, role ordering, timestamp, and approved refund', async ({ browser }) => {
    const state = requiredSeed()
    if (state.mainDisputeId == null) throw new Error('Main dispute is unavailable.')
    const { context, page } = await rolePage(browser, state.actors.buyerA)
    try {
      await page.goto(`/disputes/${state.mainDisputeId}`)
      const conversation = page.getByRole('list', { name: 'Conversation' })
      const messages = conversation.getByRole('listitem')
      await expect(messages).toHaveCount(2)
      await expect(messages.nth(0)).toContainText(BUYER_MESSAGE)
      await expect(messages.nth(0)).toContainText('You')
      await expect(messages.nth(1)).toContainText(SELLER_MESSAGE)
      await expect(messages.nth(1)).toContainText('Seller')
      await expect(messages.nth(0).locator('time')).toHaveAttribute('datetime', /T/)
      await expect(messages.nth(1).locator('time')).toHaveAttribute('datetime', /T/)
      await expect(page.getByRole('region', { name: 'Refund' }).getByText('Approved', { exact: true }).first()).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('Seller A records manual completion and Buyer A retains immutable history with no second refund', async ({ browser }) => {
    const state = requiredSeed()
    if (state.mainDisputeId == null) throw new Error('Main dispute is unavailable.')
    const sellerView = await rolePage(browser, state.actors.sellerA)
    try {
      await sellerView.page.goto(`/seller/disputes/${state.mainDisputeId}`)
      const refund = sellerView.page.getByRole('region', { name: 'Refund' })
      await refund.getByLabel('Refund method').selectOption('manual_transfer')
      await refund.getByLabel(/^Reference/).fill(MANUAL_REFERENCE)
      await refund.getByLabel(/^Notes/).fill('Funds returned manually after seller verification.')
      await refund.getByRole('button', { name: 'Review manual refund' }).click()
      await expect(refund.getByRole('group', { name: 'Confirm manual refund record' })).toBeVisible()
      await expect(refund.getByText('No automatic transfer occurs.')).toBeVisible()
      await refund.getByRole('button', { name: 'Record manual refund' }).click()
      await expect(refund.getByText('Completed', { exact: true }).first()).toBeVisible()
      await expect(refund.getByText(MANUAL_REFERENCE)).toBeVisible()
    } finally {
      await sellerView.context.close()
    }

    const buyerView = await rolePage(browser, state.actors.buyerA)
    try {
      await buyerView.page.goto(`/disputes/${state.mainDisputeId}`)
      const refund = buyerView.page.getByRole('region', { name: 'Refund' })
      await expect(refund.getByText('Completed', { exact: true }).first()).toBeVisible()
      await expect(refund.getByText(MANUAL_REFERENCE)).toBeVisible()
      await expect(buyerView.page.getByText(BUYER_MESSAGE)).toBeVisible()
      await expect(buyerView.page.getByText(SELLER_MESSAGE)).toBeVisible()
      await expect(buyerView.page.getByText('valid-evidence.pdf')).toBeVisible()
      await expect(buyerView.page.getByText('Refund completed', { exact: true })).toBeVisible()
      await expect(refund.getByRole('button', { name: 'Request full refund' })).toHaveCount(0)
      await expect(buyerView.page.getByRole('button', { name: 'Send message' })).toHaveCount(0)
    } finally {
      await buyerView.context.close()
    }

    const refundRows = await state.actors.buyerA.client
      .from('refunds')
      .select('id, amount, status')
      .eq('order_id', state.mainOrder.id)
    expect(refundRows.error).toBeNull()
    expect(refundRows.data).toHaveLength(1)
    expect(refundRows.data?.[0]).toMatchObject({ amount: state.mainOrder.amount, status: 'completed' })
    const mainOrder = await state.actors.buyerA.client
      .from('orders')
      .select('status, total')
      .eq('id', state.mainOrder.id)
      .single()
    const mainPayment = await state.actors.buyerA.client
      .from('payments')
      .select('status, amount')
      .eq('id', state.mainOrder.paymentId)
      .single()
    expect(mainOrder.data).toMatchObject({ status: 'ready_for_pickup', total: state.mainOrder.amount })
    expect(mainPayment.data).toMatchObject({ status: 'refunded', amount: state.mainOrder.amount })
  })

  test('separate full refund can be rejected with a buyer-visible reason', async ({ browser }) => {
    const state = requiredSeed()
    const opened = await openDisputeThroughUi(
      browser,
      state.actors.buyerA,
      state.rejectOrder,
      'Damaged item',
      'The paddle edge appears damaged.',
    )
    state.rejectDisputeId = opened.disputeId
    try {
      await requestRefundThroughUi(opened.page, state.rejectOrder.amount, 'The item arrived damaged.')
    } finally {
      await opened.context.close()
    }

    const sellerView = await rolePage(browser, state.actors.sellerA)
    try {
      await sellerView.page.goto(`/seller/disputes/${opened.disputeId}`)
      const refund = sellerView.page.getByRole('region', { name: 'Refund' })
      await refund.getByRole('button', { name: 'Reject refund' }).click()
      await refund.getByLabel(/^Reason/).fill(REJECTION_REASON)
      await refund.getByRole('button', { name: 'Reject refund' }).click()
      await expect(refund.getByText('Rejected', { exact: true }).first()).toBeVisible()
    } finally {
      await sellerView.context.close()
    }

    const buyerView = await rolePage(browser, state.actors.buyerA)
    try {
      await buyerView.page.goto(`/disputes/${opened.disputeId}`)
      const refund = buyerView.page.getByRole('region', { name: 'Refund' })
      await expect(refund.getByText('Rejected', { exact: true }).first()).toBeVisible()
      await expect(refund.getByText(REJECTION_REASON)).toBeVisible()
      await expectNoRawErrors(buyerView.page)
    } finally {
      await buyerView.context.close()
    }
  })

  test('seller escalates and buyer closes while messages, evidence, and history remain', async ({ browser }) => {
    const state = requiredSeed()
    const opened = await openDisputeThroughUi(
      browser,
      state.actors.buyerA,
      state.closeOrder,
      'Seller issue',
      'The order needs marketplace review before pickup.',
    )
    state.closeDisputeId = opened.disputeId
    try {
      await opened.page.getByLabel(/^Add a message/).fill('Please review this case before I collect the order.')
      await opened.page.getByRole('button', { name: 'Send message' }).click()
      await expect(opened.page.getByText('Please review this case before I collect the order.')).toBeVisible()
      await opened.page.getByLabel('Add evidence').setInputFiles(FIXTURE_PDF)
      await opened.page.getByRole('button', { name: 'Upload evidence' }).click()
      await expect(opened.page.getByText('valid-evidence.pdf')).toBeVisible()
    } finally {
      await opened.context.close()
    }

    const sellerView = await rolePage(browser, state.actors.sellerA)
    try {
      await sellerView.page.goto(`/seller/disputes/${opened.disputeId}`)
      await sellerView.page.getByRole('button', { name: 'Escalate for review' }).click()
      await sellerView.page.getByRole('button', { name: 'Yes, escalate dispute' }).click()
      await expect(sellerView.page.getByText('Under review', { exact: true }).first()).toBeVisible()
      await expect(sellerView.page.getByText('Dispute escalated for review')).toBeVisible()
    } finally {
      await sellerView.context.close()
    }

    const buyerView = await rolePage(browser, state.actors.buyerA)
    try {
      await buyerView.page.goto(`/disputes/${opened.disputeId}`)
      await expect(buyerView.page.getByText('Under review', { exact: true }).first()).toBeVisible()
      await buyerView.page.getByRole('button', { name: 'Close dispute' }).click()
      await buyerView.page.getByRole('button', { name: 'Yes, close dispute' }).click()
      await expect(buyerView.page.getByText('Closed', { exact: true }).first()).toBeVisible()
      await expect(buyerView.page.getByText('Please review this case before I collect the order.')).toBeVisible()
      await expect(buyerView.page.getByText('valid-evidence.pdf')).toBeVisible()
      await expect(buyerView.page.getByText('Dispute opened')).toBeVisible()
      await expect(buyerView.page.getByText('Dispute escalated for review')).toBeVisible()
      await expect(buyerView.page.getByText('Dispute closed')).toBeVisible()
      await expect(buyerView.page.getByRole('link', { name: 'View order' })).toHaveAttribute(
        'href',
        `/orders/${state.closeOrder.id}`,
      )
    } finally {
      await buyerView.context.close()
    }
  })

  test('Seller B order remains independent and only Seller B receives its dispute', async ({ browser }) => {
    const state = requiredSeed()
    const sellerBOrderBefore = await state.actors.buyerA.client
      .from('orders')
      .select('status, total')
      .eq('id', state.sellerBOrder.id)
      .single()
    const sellerBPaymentBefore = await state.actors.buyerA.client
      .from('payments')
      .select('status, amount')
      .eq('id', state.sellerBOrder.paymentId)
      .single()
    const sellerBRefundBefore = await state.actors.buyerA.client
      .from('refunds')
      .select('id')
      .eq('order_id', state.sellerBOrder.id)
    expect(sellerBOrderBefore.data).toMatchObject({ status: 'ready_for_pickup', total: state.sellerBOrder.amount })
    expect(sellerBPaymentBefore.data).toMatchObject({ status: 'paid', amount: state.sellerBOrder.amount })
    expect(sellerBRefundBefore.data).toHaveLength(0)

    const opened = await openDisputeThroughUi(
      browser,
      state.actors.buyerA,
      state.sellerBOrder,
      'Pickup issue',
      'Seller B pickup arrangements need clarification.',
    )
    state.sellerBDisputeId = opened.disputeId
    await opened.context.close()

    const sellerAView = await rolePage(browser, state.actors.sellerA)
    try {
      await sellerAView.page.goto('/seller/disputes')
      await expect(sellerAView.page.getByText(state.sellerBOrder.orderNumber)).toHaveCount(0)
      await expect(sellerAView.page.getByText(state.mainOrder.orderNumber)).toBeVisible()
    } finally {
      await sellerAView.context.close()
    }

    const sellerBView = await rolePage(browser, state.actors.sellerB)
    try {
      await sellerBView.page.getByRole('link', { name: 'Seller Dashboard', exact: true }).click()
      await sellerBView.page.getByRole('link', { name: 'Disputes', exact: true }).click()
      await expect(sellerBView.page.getByText(state.sellerBOrder.orderNumber)).toBeVisible()
      await expect(sellerBView.page.getByText(state.mainOrder.orderNumber)).toHaveCount(0)
      await sellerBView.page.getByRole('link', { name: new RegExp(state.sellerBOrder.orderNumber) }).click()
      await sellerBView.page.getByLabel(/^Add a message/).fill('Seller B is handling this order independently.')
      await sellerBView.page.getByRole('button', { name: 'Send message' }).click()
      await expect(sellerBView.page.getByText('Seller B is handling this order independently.')).toBeVisible()
    } finally {
      await sellerBView.context.close()
    }

    const sellerBOrderAfter = await state.actors.buyerA.client
      .from('orders')
      .select('status, total')
      .eq('id', state.sellerBOrder.id)
      .single()
    const sellerBPaymentAfter = await state.actors.buyerA.client
      .from('payments')
      .select('status, amount')
      .eq('id', state.sellerBOrder.paymentId)
      .single()
    const sellerBRefundAfter = await state.actors.buyerA.client
      .from('refunds')
      .select('id')
      .eq('order_id', state.sellerBOrder.id)
    expect(sellerBOrderAfter.data).toEqual(sellerBOrderBefore.data)
    expect(sellerBPaymentAfter.data).toEqual(sellerBPaymentBefore.data)
    expect(sellerBRefundAfter.data).toHaveLength(0)
  })

  test('Phase 11 buyer, seller, and report UI is responsive and accessible at six viewports', async ({ browser }) => {
    const state = requiredSeed()
    if (state.rejectDisputeId == null || state.mainDisputeId == null || state.sellerBDisputeId == null) {
      throw new Error('Responsive test disputes are unavailable.')
    }
    const buyerView = await rolePage(browser, state.actors.buyerA)
    const sellerView = await rolePage(browser, state.actors.sellerA)
    const sizes = [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]
    try {
      for (const viewport of sizes) {
        await test.step(`${viewport.width}x${viewport.height} buyer dispute and report dialog`, async () => {
          await buyerView.page.setViewportSize(viewport)
          await buyerView.page.goto(`/disputes/${state.rejectDisputeId}`)
          await expect(buyerView.page.getByRole('heading', { name: 'Damaged item' })).toBeVisible()
          await expect(buyerView.page.getByRole('region', { name: 'Refund' })).toBeVisible()
          await expect(buyerView.page.getByLabel(/^Add a message/)).toBeVisible()
          await expect(buyerView.page.getByLabel('Add evidence')).toBeVisible()
          await assertNoHorizontalOverflow(buyerView.page)
          await assertPadded(buyerView.page.locator('.dispute-section').first())
          await assertPadded(buyerView.page.getByLabel(/^Add a message/))
          const containerPadding = await buyerView.page.locator('main .container').first().evaluate(
            (element) => Number.parseFloat(getComputedStyle(element).paddingInlineStart),
          )
          expect(containerPadding).toBeGreaterThan(0)
          if (viewport.width <= 430) {
            const sendBox = await buyerView.page.getByRole('button', { name: 'Send message' }).boundingBox()
            expect(sendBox?.height ?? 0).toBeGreaterThanOrEqual(40)
          }

          await buyerView.page.goto(`/marketplace/${state.sellerAListing.id}`)
          await buyerView.page.getByRole('button', { name: 'Report listing' }).click()
          const dialog = buyerView.page.getByRole('dialog', { name: 'Report listing' })
          await expect(dialog).toBeVisible()
          await expect(dialog.getByLabel(/^Reason/)).toBeVisible()
          await expect(dialog.getByRole('button', { name: 'Submit report' })).toBeVisible()
          const dialogBox = await dialog.boundingBox()
          expect(dialogBox?.x ?? -1).toBeGreaterThanOrEqual(0)
          expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1)
          await assertPadded(dialog)
          await assertNoHorizontalOverflow(buyerView.page)
          await dialog.getByRole('button', { name: 'Cancel' }).click()
        })

        await test.step(`${viewport.width}x${viewport.height} seller dispute`, async () => {
          await sellerView.page.setViewportSize(viewport)
          await sellerView.page.goto(`/seller/disputes/${state.mainDisputeId}`)
          await expect(sellerView.page.getByRole('heading', { name: 'Item not as described' })).toBeVisible()
          await expect(sellerView.page.getByText(BUYER_MESSAGE)).toBeVisible()
          await expect(sellerView.page.getByText('valid-evidence.pdf')).toBeVisible()
          await expect(sellerView.page.getByRole('region', { name: 'Refund' })).toBeVisible()
          await assertNoHorizontalOverflow(sellerView.page)
          await assertPadded(sellerView.page.locator('.dispute-section').first())
        })
      }
    } finally {
      await buyerView.context.close()
      await sellerView.context.close()
    }
  })
})
