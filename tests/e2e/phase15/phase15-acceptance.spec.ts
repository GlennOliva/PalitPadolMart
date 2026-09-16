import { expect, test, type Page } from '@playwright/test'
import {
  disposePhase15,
  phase15RolePage,
  seedPhase15,
  sellerReviewStats,
  type Phase15Seed,
} from './support.js'

let seed: Phase15Seed | null = null

function requiredSeed(): Phase15Seed {
  if (seed == null) throw new Error('Phase 15 E2E seed was not initialized.')
  return seed
}

// Phase 15 admin journeys SKIP (never fabricate PASS) when the optional admin
// credential is absent or currently invalid; public-flow and seller journeys
// always run because they never depend on the admin account.
function hasAdmin(state: Phase15Seed): boolean {
  return state.actors.admin != null
}

async function expectNoRawErrors(page: Page) {
  await expect(page.locator('body')).not.toContainText(/row-level security|permission denied|violates.*policy|SQLSTATE|PGRST\d+/i)
}

interface OverflowResult {
  overflow: number
  width: number
  scrollWidth: number
}

async function measureOverflow(page: Page): Promise<OverflowResult> {
  return page.evaluate(() => ({
    overflow: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ) - window.innerWidth,
    width: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }))
}

function pageReports(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return errors
}

async function expectPrintStylesheets(page: Page) {
  const found = await page.evaluate(() => {
    let printMedia = false
    let pageRule = false
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      if (rules == null) continue
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule && rule.conditionText.includes('print')) {
          printMedia = true
          for (const inner of Array.from(rule.cssRules)) {
            if (instanceofCSSPageRule(inner)) pageRule = true
          }
        }
      }
    }
    return { printMedia, pageRule }
  })
  expect(found.printMedia).toBe(true)
  expect(found.pageRule).toBe(true)
}

function instanceofCSSPageRule(value: unknown): boolean {
  return typeof value === 'object' && value != null && (value as CSSRule).type === 6
}

test.describe.serial('Phase 15 automated browser acceptance', () => {
  test.beforeAll(async () => {
    seed = await seedPhase15()
  })

  test.afterAll(async () => {
    await disposePhase15(seed)
  })

  const widths = [375, 390, 430, 768, 1024, 1440]

  test('public templates render without overflow, console errors, or guard data leakage across the responsive matrix', async ({ browser }) => {
    const pages: Array<{ path: string; role: 'heading' | 'link'; visible: string }> = [
      { path: '/', role: 'heading', visible: 'Buy. Sell. Play Better.' },
      { path: '/marketplace', role: 'heading', visible: 'Marketplace' },
      { path: '/login', role: 'heading', visible: 'Sign in' },
      { path: '/zzz-phase15-not-a-real-route', role: 'link', visible: 'Return home' },
    ]
    for (const width of widths) {
      for (const { path, role, visible } of pages) {
        const context = await browser.newContext({ viewport: { width, height: 900 } })
        const page = await context.newPage()
        const errors = pageReports(page)
        try {
          await page.goto(path)
          await expect(page.getByRole(role, { name: visible })).toBeVisible()
          const { overflow } = await measureOverflow(page)
          expect(
            overflow,
            `expected no horizontal overflow at ${width}px on ${path}`,
          ).toBeLessThanOrEqual(1)
          expect(
            errors,
            `expected no console/page errors at ${width}px on ${path}`,
          ).toEqual([])
          await expectNoRawErrors(page)
        } finally {
          await context.close()
        }
      }
    }
  })

  test('login and register password toggles reveal and hide values across the responsive matrix', async ({ browser }) => {
    test.setTimeout(120_000)
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      const errors = pageReports(page)
      try {
        await page.goto('/login')
        await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
        const loginPassword = page.getByLabel(/^Password/)
        await loginPassword.fill('Hunter2!secret')
        await expect(loginPassword).toHaveAttribute('type', 'password')

        const loginToggle = page.getByRole('button', { name: 'Show password' })
        await loginToggle.click()
        await expect(loginPassword).toHaveAttribute('type', 'text')
        await expect(loginPassword).toHaveValue('Hunter2!secret')

        const hideLogin = page.getByRole('button', { name: 'Hide password' })
        await expect(hideLogin).toHaveAttribute('aria-pressed', 'true')
        await hideLogin.click()
        await expect(loginPassword).toHaveAttribute('type', 'password')
        await expect(loginPassword).toHaveValue('Hunter2!secret')

        await page.goto('/register')
        await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
        const password = page.getByLabel(/^Password/)
        const confirm = page.getByLabel(/^Confirm password/)
        await password.fill('R@pfish!zeta')
        await confirm.fill('R@pfish!zeta')

        const toggles = page.getByRole('button', { name: 'Show password' })
        await expect(toggles).toHaveCount(2)
        await toggles.first().click()
        await expect(password).toHaveAttribute('type', 'text')
        await expect(confirm).toHaveAttribute('type', 'password')
        await page.getByRole('button', { name: 'Show password' }).click()
        await expect(confirm).toHaveAttribute('type', 'text')
        await expect(confirm).toHaveValue('R@pfish!zeta')

        const { overflow } = await measureOverflow(page)
        expect(overflow, `expected no horizontal overflow at ${width}px on password toggle pages`).toBeLessThanOrEqual(1)
        expect(errors, `expected no console/page errors at ${width}px on password toggle pages`).toEqual([])
        await expectNoRawErrors(page)
      } finally {
        await context.close()
      }
    }
  })

  test('seller analytics stays responsive at 375px and exposes its phase-14 controls', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase15RolePage(browser, state, 'seller')
    try {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto('/seller/analytics')
      await expect(page.getByRole('heading', { name: 'Your analytics' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Export KPIs (CSV)' })).toBeVisible()
      const { overflow } = await measureOverflow(page)
      expect(overflow, 'expected no horizontal overflow at 375px on seller analytics').toBeLessThanOrEqual(1)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('seller dashboard shows the review summary matching the backend with no empty-state regression', async ({ browser }) => {
    const state = requiredSeed()
    const stats = await sellerReviewStats(state)
    const { context, page } = await phase15RolePage(browser, state, 'seller')
    try {
      await page.goto('/seller/dashboard')
      await expect(page.getByRole('heading', { name: 'Seller Dashboard' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Customer feedback' })).toBeVisible()
      const lookFor = stats.approvedReviews === 1
        ? '1 verified review · all time'
        : `${stats.approvedReviews} verified reviews · all time`
      await expect(page.getByText(lookFor)).toBeVisible({ timeout: 15000 })
      if (stats.approvedReviews > 0) {
        await expect(page.getByText('No reviews yet.')).toHaveCount(0)
        await expect(page.getByRole('link', { name: /View all reviews/i })).toHaveAttribute('href', '/seller/reviews')
      } else {
        await expect(page.getByText('No reviews yet.')).toBeVisible()
      }
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('seller reviews page overall rating matches the backend summary (same trusted source as dashboard)', async ({ browser }) => {
    const state = requiredSeed()
    const stats = await sellerReviewStats(state)
    const { context, page } = await phase15RolePage(browser, state, 'seller')
    try {
      await page.goto('/seller/reviews')
      await expect(page.getByRole('heading', { name: 'Customer Reviews' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Overall Rating' })).toBeVisible()
      if (stats.approvedReviews > 0) {
        const countCopy = stats.approvedReviews === 1
          ? '1 verified review'
          : `${stats.approvedReviews} verified reviews`
        await expect(page.getByText(countCopy)).toBeVisible({ timeout: 15000 })
        await expect(page.getByText('No reviews yet')).toHaveCount(0)
        if (stats.avgRating != null) {
          await expect(page.getByText(stats.avgRating.toFixed(1))).toBeVisible()
        }
      } else {
        await expect(page.getByText('No reviews yet')).toBeVisible()
      }
      const dashboard = await phase15RolePage(browser, state, 'seller')
      try {
        await dashboard.page.goto('/seller/dashboard')
        const lookFor = stats.approvedReviews === 1
          ? '1 verified review · all time'
          : `${stats.approvedReviews} verified reviews · all time`
        await expect(dashboard.page.getByText(lookFor)).toBeVisible({ timeout: 15000 })
      } finally {
        await dashboard.context.close()
      }
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('seller dashboard renders charts and KPIs without horizontal overflow at 375px', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase15RolePage(browser, state, 'seller')
    try {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto('/seller/dashboard')
      await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Order status' })).toBeVisible()
      await expect(page.locator('.admin-chart--line').first()).toBeVisible()
      await expect(page.locator('.admin-chart--hbar').first()).toBeVisible()
      const { overflow } = await measureOverflow(page)
      expect(overflow, 'expected no horizontal overflow at 375px on seller dashboard').toBeLessThanOrEqual(1)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('seller analytics renders charts and print controls and stays responsive at 375px', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase15RolePage(browser, state, 'seller')
    try {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto('/seller/analytics')
      await expect(page.getByRole('heading', { name: 'Performance trends' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Top products' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Fulfillment & money' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Listing performance' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Print Seller Report' })).toBeVisible()
      await page.getByRole('button', { name: 'Print Seller Report' }).click()
      await expect(page.locator('.report-print').first()).toBeAttached()
      await expect(page.locator('.report-print .report-header')).toContainText('Seller Performance Report')
      await expect(page.locator('.admin-chart--line').first()).toBeVisible()
      const { overflow } = await measureOverflow(page)
      expect(overflow, 'expected no horizontal overflow at 375px on seller analytics').toBeLessThanOrEqual(1)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin loads the executive dashboard with KPIs, charts, queues, and print controls', async ({ browser }) => {
    const state = requiredSeed()
    test.skip(!hasAdmin(state), 'PHASE15/PHASE14/PHASE13_TEST_ADMIN_* is not configured or the credential is invalid')
    const { context, page } = await phase15RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Performance trends' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Operational queues' })).toBeVisible()
      await expect(page.locator('.admin-dashboard-stats .kpi-card').first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Print Executive Report' })).toBeVisible()
      await expect(page.locator('.print-report').first()).toBeAttached()
      const { overflow } = await measureOverflow(page)
      expect(overflow, 'expected no horizontal overflow on the admin dashboard').toBeLessThanOrEqual(1)
      await expectPrintStylesheets(page)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin loads marketplace analytics with printable content and moderation status charts', async ({ browser }) => {
    const state = requiredSeed()
    test.skip(!hasAdmin(state), 'PHASE15/PHASE14/PHASE13_TEST_ADMIN_* is not configured or the credential is invalid')
    const { context, page } = await phase15RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin/analytics')
      await expect(page.getByRole('heading', { name: 'Marketplace activity' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Status & moderation' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Print Report' })).toBeVisible()
      await expect(page.locator('.print-report .report-header')).toContainText('Marketplace Analytics Report')
      await expect(page.locator('.print-report .print-table__caption').first()).toBeAttached()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin reaches the report center through the admin nav and prints the directory', async ({ browser }) => {
    const state = requiredSeed()
    test.skip(!hasAdmin(state), 'PHASE15/PHASE14/PHASE13_TEST_ADMIN_* is not configured or the credential is invalid')
    const { context, page } = await phase15RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      const sidebar = page.getByRole('navigation', { name: 'Administration sections' })
      const reportCenterLink = sidebar.getByRole('link', { name: 'Report Center' })
      await expect(reportCenterLink).toHaveAttribute('href', '/admin/report-center')
      await reportCenterLink.click()
      await expect(page).toHaveURL(/\/admin\/report-center$/)
      await expect(page.getByRole('heading', { name: 'Report Center' })).toBeVisible()
      await expect(page.getByRole('link', { name: /Sales & Revenue Report/ })).toHaveAttribute('href', '/admin/analytics')
      await expect(page.getByRole('button', { name: 'Print Report Directory' })).toBeVisible()
      await expect(page.locator('.print-report .print-table__caption').first()).toBeAttached()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('non-admin users are denied access to the admin report center', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase15RolePage(browser, state, 'seller')
    try {
      await page.goto('/admin/report-center')
      await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Report Center' })).toHaveCount(0)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })
})