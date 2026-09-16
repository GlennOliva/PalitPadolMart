import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import {
  disposePhase12,
  phase12RolePage,
  seedPhase12,
  type Phase12Seed,
} from './support.js'

let seed: Phase12Seed | null = null

function requiredSeed() {
  if (seed == null) throw new Error('Phase 12 E2E seed was not initialized.')
  return seed
}

async function expectNoRawErrors(page: Page) {
  await expect(page.locator('body')).not.toContainText(/row-level security|permission denied|violates.*policy|SQLSTATE|PGRST\d+/i)
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1)
}

async function expectInsideViewport(locator: Locator, page: Page) {
  const box = await locator.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (box == null || viewport == null) return
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
}

test.describe.serial('Phase 12 automated browser acceptance', () => {
  test.beforeAll(async () => {
    seed = await seedPhase12()
  })

  test.afterAll(async () => {
    await disposePhase12(seed)
  })

  test('Google OAuth controls initiate only the Supabase redirect flow', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()

    await page.route('**/auth/v1/authorize**', (route) => route.abort())
    const authorizeRequest = page.waitForRequest(/\/auth\/v1\/authorize/)
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    const request = await authorizeRequest
    const authorizeUrl = new URL(request.url())
    expect(authorizeUrl.searchParams.get('provider')).toBe('google')
    const redirectTo = authorizeUrl.searchParams.get('redirect_to')
    expect(redirectTo).not.toBeNull()
    expect(new URL(redirectTo ?? '').origin).toBe('http://127.0.0.1:5173')
    expect(new URL(redirectTo ?? '').pathname).toBe('/auth/callback')

    await page.goto('/register')
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel(/^Password/)).toBeVisible()
  })

  test('OAuth callback cancellation is safe and does not expose provider detail', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_description=private-provider-detail')
    await expect(page.getByRole('alert')).toContainText(/cancelled/i)
    await expect(page.locator('body')).not.toContainText('private-provider-detail')
    await expect(page).toHaveURL(/\/auth\/callback$/)
  })

  test('seller sees exact unread count, five-newest disclosure, and role-correct inquiry link', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase12RolePage(browser, state.base.actors.sellerA)
    try {
      const bell = page.getByRole('button', { name: 'Notifications, 1 unread' })
      await expect(bell).toBeVisible()
      await bell.click()
      await expect(bell).toHaveAttribute('aria-expanded', 'true')
      const dropdown = page.locator('#notification-dropdown')
      await expect(dropdown).toBeVisible()
      await expect(dropdown.locator('.notification-item')).toHaveCount(5)
      const inquiry = dropdown.getByRole('link', { name: /New inquiry/i })
      await expect(inquiry).toHaveAttribute('href', `/inquiries/${state.inquiryId}`)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('seller marks one read and the state persists after reload', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase12RolePage(browser, state.base.actors.sellerA)
    try {
      await page.getByRole('button', { name: 'Notifications, 1 unread' }).click()
      await page.locator('#notification-dropdown').getByRole('button', { name: 'Mark as read' }).first().click()
      await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('buyer preview is capped at five and unread inquiry pagination is database-side', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase12RolePage(browser, state.base.actors.buyerA)
    try {
      const bell = page.getByRole('button', { name: `Notifications, ${state.replyCount} unread` })
      await bell.click()
      const dropdown = page.locator('#notification-dropdown')
      await expect(dropdown.locator('.notification-item')).toHaveCount(5)
      await dropdown.getByRole('link', { name: 'View all notifications' }).click()
      await page.getByLabel('Read status').selectOption('unread')
      await page.getByLabel('Update type').selectOption('inquiry')
      await expect(page).toHaveURL(/read=unread.*type=inquiry|type=inquiry.*read=unread/)
      await expect(page.getByText(`Showing 10 of ${state.replyCount} notifications`)).toBeVisible()
      await page.getByRole('button', { name: 'Next page' }).click()
      await expect(page).toHaveURL(/page=2/)
      await expect(page.getByText(`Showing 2 of ${state.replyCount} notifications`)).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('buyer mark-all clears and persists the unread badge', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase12RolePage(browser, state.base.actors.buyerA)
    try {
      await page.goto('/notifications?read=unread&type=inquiry')
      await expect(page.getByText(`Showing 10 of ${state.replyCount} notifications`)).toBeVisible()
      await page.getByRole('button', { name: 'Mark all as read' }).click()
      await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('protected notification center redirects guests to password-capable login', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
  })

  test('notification API failures show safe retry copy', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase12RolePage(browser, state.base.actors.buyerA)
    try {
      await page.route('**/rest/v1/notifications**', (route) => route.abort('failed'))
      await page.goto('/notifications')
      await expect(page.getByRole('alert')).toContainText('We could not load your notifications')
      await expectNoRawErrors(page)
      await page.unroute('**/rest/v1/notifications**')
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.locator('.notification-list')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('unsafe OAuth return paths fall back after an authenticated callback', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase12RolePage(browser, state.base.actors.buyerA)
    try {
      await page.goto('/auth/callback?next=https%3A%2F%2Fevil.example')
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('heading', { name: /Welcome/i })).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('notification UI stays contained and touch-friendly at all required widths', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase12RolePage(browser, state.base.actors.buyerA)
    try {
      for (const width of [375, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/notifications')
        await expect(page.locator('.notifications-page h1')).toHaveText('Notifications')
        await expectNoHorizontalOverflow(page)

        const bell = page.getByRole('button', { name: 'Notifications', exact: true })
        const bellBox = await bell.boundingBox()
        expect(bellBox?.width).toBeGreaterThanOrEqual(44)
        expect(bellBox?.height).toBeGreaterThanOrEqual(44)
        await bell.click()
        await expectInsideViewport(page.locator('#notification-dropdown'), page)
        await page.keyboard.press('Escape')
        await expect(bell).toBeFocused()
      }
    } finally {
      await context.close()
    }
  })
})
