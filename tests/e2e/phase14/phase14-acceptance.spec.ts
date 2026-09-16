import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  disposePhase14,
  phase14RolePage,
  seedPhase14,
  type Phase14Seed,
} from './support.js'

let seed: Phase14Seed | null = null

function requiredSeed(): Phase14Seed {
  if (seed == null) throw new Error('Phase 14 E2E seed was not initialized.')
  return seed
}

// Phase 14 admin journeys SKIP (never fabricate PASS) when the optional admin
// credential is absent or currently invalid; seller analytics journeys always
// run because they never depend on the admin account.
function hasAdmin(state: Phase14Seed): boolean {
  return state.actors.admin != null
}

async function expectNoRawErrors(page: Page) {
  await expect(page.locator('body')).not.toContainText(/row-level security|permission denied|violates.*policy|SQLSTATE|PGRST\d+/i)
}

test.describe.serial('Phase 14 automated browser acceptance', () => {
  test.beforeAll(async () => {
    seed = await seedPhase14()
  })

  test.afterAll(async () => {
    await disposePhase14(seed)
  })

  test('seller loads the analytics dashboard with real KPIs', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase14RolePage(browser, state, 'seller')
    try {
      await page.goto('/seller/analytics')
      await expect(page.getByRole('heading', { name: 'Your analytics' })).toBeVisible()
      const sections = page.locator('.analytics-section')
      await expect(sections).toHaveCount(7)
      await expect(sections.first().getByRole('heading', { name: 'Store' })).toBeVisible()
      await expect(page.getByText('Loading your analytics…')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Listing performance' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Export KPIs (CSV)' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Export trend (CSV)' })).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('seller listing performance links to the listing detail page', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase14RolePage(browser, state, 'seller')
    try {
      await page.goto('/seller/analytics')
      await expect(page.getByRole('heading', { name: 'Listing performance' })).toBeVisible()
      const rows = page.locator('.admin-resource-table tbody tr')
      if (await rows.count() > 0) {
        const link = rows.first().getByRole('link')
        const href = await link.getAttribute('href')
        expect(href).toMatch(/^\/seller\/listings\/[0-9a-f-]{36}$/)
        await link.click()
        await expect(page).toHaveURL(/\/seller\/listings\/[0-9a-f-]{36}$/)
      } else {
        test.info().annotations.push({ type: 'info', description: 'No run-scoped listing rows yet; link coverage is data-dependent.' })
      }
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('seller compares with the previous period', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase14RolePage(browser, state, 'seller')
    try {
      await page.goto('/seller/analytics')
      await expect(page.getByRole('heading', { name: 'Your analytics' })).toBeVisible()
      const compare = page.getByLabel('Compare with previous period')
      await expect(compare).toBeVisible()
      await compare.click()
      await expect(compare).toBeChecked()
      await expect(page).toHaveURL(/\?.*compare=1/)
      await expect(page.getByText('vs previous period').first()).toBeVisible()
      await expect(page.locator('.analytics-delta').first()).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('seller switches the timeseries bucket to weekly', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase14RolePage(browser, state, 'seller')
    try {
      await page.goto('/seller/analytics')
      await expect(page.getByRole('heading', { name: 'Your analytics' })).toBeVisible()
      await page.getByLabel('Chart bucket').selectOption('week')
      await expect(page).toHaveURL(/\?.*bucket=week/)
      await expect(page.getByText('weekly gross sales trend')).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('buyer is redirected away from seller analytics', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase14RolePage(browser, state, 'buyer')
    try {
      await page.goto('/seller/analytics')
      await expect(page).toHaveURL(/\/seller\/onboarding$/)
      await expect(page.getByRole('heading', { name: 'Your analytics' })).toHaveCount(0)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin loads the marketplace analytics dashboard', async ({ browser }) => {
    const state = requiredSeed()
    test.skip(!hasAdmin(state), 'PHASE14/PHASE13_TEST_ADMIN_* is not configured or the credential is invalid')
    const { context, page } = await phase14RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin/analytics')
      await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()
      const sections = page.locator('.analytics-section')
      await expect(sections).toHaveCount(11)
      await expect(page.getByText('Loading marketplace analytics…')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Popular listings' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Top sellers' })).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin reaches analytics through the admin nav', async ({ browser }) => {
    const state = requiredSeed()
    test.skip(!hasAdmin(state), 'PHASE14/PHASE13_TEST_ADMIN_* is not configured or the credential is invalid')
    const { context, page } = await phase14RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      const sidebar = page.getByRole('navigation', { name: 'Administration sections' })
      await sidebar.getByRole('link', { name: 'Analytics' }).click()
      await expect(page).toHaveURL(/\/admin\/analytics$/)
      await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('buyer is denied access to the admin analytics page', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase14RolePage(browser, state, 'buyer')
    try {
      await page.goto('/admin/analytics')
      await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Return to dashboard' })).toHaveAttribute('href', '/dashboard')
      await expect(page.getByRole('heading', { name: 'Analytics' })).toHaveCount(0)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })
})