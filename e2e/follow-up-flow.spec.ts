/**
 * E2E browser test: full follow-up workorder flow
 *
 * Prerequisites:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   make staging-up   (or: npm run dev in another terminal for local)
 *
 * Run against staging:
 *   TEST_URL=https://staging.bossuyt.fixassistant.com npx playwright test
 *
 * Run against local Docker:
 *   npx playwright test
 *
 * Flow tested:
 *   1. Technician opens a work order
 *   2. Adds a part to order → saves PDF → order_part task created
 *   3. Warehouse confirms part ordered (Besteld ✓) and received (Ontvangen ✓)
 *   4. Technician creates follow-up work order (Nieuwe Opvolgbon)
 *   5. Warehouse sees picking list and confirms all picked (Bevestig klaargelegd)
 *   6. Technician sees load_parts task as active, confirms loading (Alles ontvangen)
 */

import { expect, test, type Page } from '@playwright/test'

// ── Configuration ─────────────────────────────────────────────────────────────
// Tweak: set the work order URL for an existing workorder with a known customer.
// Find one via the planning page or check the DB for a 'gepland' work order.
// Example: /interventions/some-uuid-here
const WORKORDER_PATH = process.env.TEST_WORKORDER_PATH ?? '/interventions/PASTE_WORKORDER_ID_HERE'

// User names as they appear in the AvatarMenu user switcher
const TECHNICIAN_NAME = process.env.TEST_TECH_NAME ?? 'Marc Bossuyt'
const WAREHOUSE_NAME  = process.env.TEST_WH_NAME  ?? 'Magazijn'

// Part to add during the test
const TEST_PART = {
  code:        'TST-001',
  description: 'Testonderdeel playwright',
  quantity:    '2',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function switchUser(page: Page, userName: string) {
  // Open the AvatarMenu (top-right avatar button)
  await page.locator('header button').last().click()
  // Find and click the user by name in the dropdown
  await page.getByText(userName, { exact: false }).first().click()
  await page.waitForTimeout(300)
}

async function goToWorkOrder(page: Page) {
  await page.goto(WORKORDER_PATH)
  await page.waitForLoadState('networkidle')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('follow-up workorder flow', () => {
  test('parts ordered → follow-up created → warehouse picks → tech confirms loading', async ({ page }) => {

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Technician opens work order and adds a part to order
    // ─────────────────────────────────────────────────────────────────────────
    await goToWorkOrder(page)
    await page.waitForLoadState('networkidle')

    // Add a part to order (orange dashed button)
    await page.getByRole('button', { name: /te bestellen onderdeel/i }).click()

    // Fill in part details — the last added part row
    const partRows = page.locator('[placeholder="Artikelcode"]')
    const lastPartRow = partRows.last()
    await lastPartRow.fill(TEST_PART.code)

    const descRows = page.locator('[placeholder="Omschrijving"]')
    await descRows.last().fill(TEST_PART.description)

    // Quantity field (number input, sibling of the code field)
    const qtyInputs = page.locator('input[type="number"]')
    await qtyInputs.last().fill(TEST_PART.quantity)

    // Save — this generates the PDF and queues the order_part task
    await page.getByRole('button', { name: /PDF Genereren/i }).click()
    await expect(page.getByText(/Werkbon opgeslagen/i)).toBeVisible({ timeout: 15_000 })

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Warehouse confirms part ordered and then received
    // ─────────────────────────────────────────────────────────────────────────
    await page.goto('/magazijn')
    await page.waitForLoadState('networkidle')

    // Expect to see the test part in the order list
    await expect(page.getByText(TEST_PART.description)).toBeVisible({ timeout: 10_000 })

    // Click "Besteld ✓" (ready → in_progress)
    await page.getByRole('button', { name: /Besteld/i }).first().click()
    await page.waitForTimeout(500)

    // Click "Ontvangen ✓" (in_progress → done)
    await page.getByRole('button', { name: /Ontvangen/i }).first().click()
    await page.waitForTimeout(500)

    // Part should disappear from active orders (moved to done today)
    await expect(page.getByRole('button', { name: /Besteld/i })).toHaveCount(0, { timeout: 5_000 })

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Technician creates a follow-up work order
    // ─────────────────────────────────────────────────────────────────────────
    await goToWorkOrder(page)

    // Scroll down to the ACTIVITEITEN section to find the Nieuwe Opvolgbon button
    await page.getByRole('button', { name: /Nieuwe Opvolgbon/i }).scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: /Nieuwe Opvolgbon/i }).click()

    // Wait for success and grab the follow-up work order link
    await expect(page.getByText(/opvolgbon aangemaakt/i)).toBeVisible({ timeout: 10_000 })

    // Navigate to the follow-up work order via the link
    const followUpLink = page.getByRole('link', { name: /opvolgbon/i }).first()
    const followUpHref = await followUpLink.getAttribute('href')
    expect(followUpHref).toBeTruthy()
    await followUpLink.click()
    await page.waitForLoadState('networkidle')

    const followUpUrl = page.url()

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Warehouse sees the picking list and confirms all picked
    // ─────────────────────────────────────────────────────────────────────────
    await page.goto('/magazijn')
    await page.waitForLoadState('networkidle')

    // "Pickinglijsten opvolgbonnen" section should be visible
    await expect(page.getByText(/Pickinglijst bus/i)).toBeVisible({ timeout: 10_000 })

    // Check all items using "Alles aanvinken"
    await page.getByRole('button', { name: /Alles aanvinken/i }).first().click()

    // Confirm picking done
    await page.getByRole('button', { name: /Bevestig klaargelegd/i }).first().click()

    // Picking card should disappear from the list
    await expect(page.getByText(/Pickinglijst bus/i)).toHaveCount(0, { timeout: 10_000 })

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Technician sees load_parts task is now active, confirms loading
    // ─────────────────────────────────────────────────────────────────────────

    // Navigate to the follow-up work order
    await page.goto(followUpUrl)
    await page.waitForLoadState('networkidle')

    // Within 10 seconds the polling should pick up the activated load_parts task.
    // The LoadPartsCard should show "Alles ontvangen" (not the "Wacht op magazijn" placeholder).
    await expect(page.getByRole('button', { name: /Alles ontvangen/i })).toBeVisible({ timeout: 15_000 })

    // Confirm loading
    await page.getByRole('button', { name: /Alles ontvangen/i }).click()

    // Task should now show as done (no more "Alles ontvangen" button)
    await expect(page.getByRole('button', { name: /Alles ontvangen/i })).toHaveCount(0, { timeout: 5_000 })

    // The LoadPartsCard header should show "✓ Klaar"
    await expect(page.getByText(/✓ Klaar/i)).toBeVisible()
  })
})
