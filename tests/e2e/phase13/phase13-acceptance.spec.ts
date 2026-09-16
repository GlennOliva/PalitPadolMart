import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  disposePhase13,
  phase13RolePage,
  seedPhase13,
  type Phase13Seed,
} from './support.js'

let seed: Phase13Seed | null = null

function requiredSeed(): Phase13Seed {
  if (seed == null) throw new Error('Phase 13 E2E seed was not initialized.')
  return seed
}

async function expectNoRawErrors(page: Page) {
  await expect(page.locator('body')).not.toContainText(/row-level security|permission denied|violates.*policy|SQLSTATE|PGRST\d+/i)
}

test.describe.serial('Phase 13 automated browser acceptance', () => {
  test.beforeAll(async () => {
    seed = await seedPhase13()
  })

  test.afterAll(async () => {
    await disposePhase13(seed)
  })

  test('admin dashboard loads real statistics', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible()
      const stats = page.locator('.admin-dashboard-stats')
      await expect(stats).toBeVisible()
      await expect(stats.locator('.admin-stat-card__value').first()).toBeVisible()
      await expect(stats.locator('.admin-stat-card__label').first()).toHaveText('Total users')
      await expect(stats.locator('.admin-stat-card__value').first()).not.toHaveText('—')
      await expect(page.getByText('Loading marketplace summary...')).toHaveCount(0)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin navigates to the Users page', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      const sidebar = page.getByRole('navigation', { name: 'Administration sections' })
      await sidebar.getByRole('link', { name: 'Users' }).click()
      await expect(page).toHaveURL(/\/admin\/users$/)
      await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
      await expect(page.getByRole('searchbox', { name: 'Search users' })).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin navigates to the Sellers page', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      const sidebar = page.getByRole('navigation', { name: 'Administration sections' })
      await sidebar.getByRole('link', { name: 'Sellers' }).click()
      await expect(page).toHaveURL(/\/admin\/sellers$/)
      await expect(page.getByRole('heading', { name: 'Sellers' })).toBeVisible()
      await expect(page.getByRole('searchbox', { name: 'Search sellers' })).toBeVisible()
      await expect(page.getByLabel('Status')).toBeVisible()
      await expect(page.getByLabel('Sort')).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin navigates to the Listings page', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      const sidebar = page.getByRole('navigation', { name: 'Administration sections' })
      await sidebar.getByRole('link', { name: 'Listings' }).click()
      await expect(page).toHaveURL(/\/admin\/listings$/)
      await expect(page.getByRole('heading', { name: 'Listings' })).toBeVisible()
      await expect(page.getByRole('searchbox', { name: 'Search listings' })).toBeVisible()
      await expect(page.getByLabel('Status')).toBeVisible()
      await expect(page.getByLabel('Sort')).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin navigates to the Reports page', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      const sidebar = page.getByRole('navigation', { name: 'Administration sections' })
      await sidebar.getByRole('link', { name: 'Reports' }).click()
      await expect(page).toHaveURL(/\/admin\/reports$/)
      await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin navigates to the Reviews page', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      const sidebar = page.getByRole('navigation', { name: 'Administration sections' })
      await sidebar.getByRole('link', { name: 'Reviews' }).click()
      await expect(page).toHaveURL(/\/admin\/reviews$/)
      await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin navigates to the Orders page', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      const sidebar = page.getByRole('navigation', { name: 'Administration sections' })
      await sidebar.getByRole('link', { name: 'Orders' }).click()
      await expect(page).toHaveURL(/\/admin\/orders$/)
      await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('admin navigates to the Audit Logs page', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'admin')
    try {
      await page.goto('/admin')
      const sidebar = page.getByRole('navigation', { name: 'Administration sections' })
      await sidebar.getByRole('link', { name: 'Audit Logs' }).click()
      await expect(page).toHaveURL(/\/admin\/audit-logs$/)
      await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible()
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('buyer is denied access to the admin console', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'buyer')
    try {
      await page.goto('/admin')
      await expect(page).toHaveURL(/\/admin$/)
      await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible()
      await expect(page.getByText('403', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Return to dashboard' })).toHaveAttribute(
        'href',
        '/dashboard',
      )
      await expect(page.getByRole('heading', { name: 'Administration' })).toHaveCount(0)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })

  test('seller is denied access to the admin console', async ({ browser }) => {
    const state = requiredSeed()
    const { context, page } = await phase13RolePage(browser, state, 'seller')
    try {
      await page.goto('/admin')
      await expect(page).toHaveURL(/\/admin$/)
      await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible()
      await expect(page.getByText('403', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Return to dashboard' })).toHaveAttribute(
        'href',
        '/dashboard',
      )
      await expect(page.getByRole('heading', { name: 'Administration' })).toHaveCount(0)
      await expectNoRawErrors(page)
    } finally {
      await context.close()
    }
  })
})