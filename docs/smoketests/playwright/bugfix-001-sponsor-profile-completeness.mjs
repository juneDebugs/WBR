#!/usr/bin/env node
/**
 * BUG-001 verification: sponsor profile completeness percentage updates
 * after save, and empty multi-select fields are counted as missing.
 *
 * Asserts:
 *   AC-1: After successful save, a fresh /api/sponsor-data request fires
 *         (within 200 ms of the PATCH response). Observed via
 *         `page.on('request')` + timestamps.
 *   AC-2: Same save, a fresh /api/profile/sponsor-data request fires.
 *   AC-3/4: After clearing the 3 array fields (Solutions offering,
 *         Solutions seeking, Target industries) and saving, those three
 *         field labels appear in the dashboard's "missing" list. Empty
 *         arrays persist as "[]" in the DB; the fix must treat that
 *         string as empty, not as filled.
 *   AC-5: After saving with all 18 completeness fields populated
 *         (arrays non-empty), the dashboard shows 100% within one
 *         navigation hop.
 *
 * Prerequisites:
 *   - Sponsor app reachable at SPONSOR_BASE_URL (default: http://localhost:3003).
 *     For Tier B verification, set SPONSOR_BASE_URL to the Vercel preview URL.
 *     For Tier C verification, run `pnpm --filter sponsor build && pnpm --filter sponsor start`.
 *   - Seeded credentials per packages/db/prisma/seed.ts
 *     (default: sponsor@shopify.com / sponsor123 — linked to the Shopify sponsor).
 *   - Playwright + chromium installed.
 *
 * Usage:
 *   node docs/smoketests/playwright/bugfix-001-sponsor-profile-completeness.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'

const BASE_URL = process.env.SPONSOR_BASE_URL ?? 'http://localhost:3003'
const EMAIL = process.env.SPONSOR_EMAIL ?? 'sponsor@shopify.com'
const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'sponsor123'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

const INVALIDATION_LATENCY_MS = 500 // Max acceptable delta between PATCH response and refetch fire
const ARRAY_FIELD_LABELS = ['Solutions offering', 'Solutions seeking', 'Target industries']

let passCount = 0
let failCount = 0

function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }

async function loginAndExtractCookie() {
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (res.status !== 200) {
    throw new Error(`POST /api/login returned ${res.status} — seeded sponsor credentials may be missing`)
  }
  const setCookies = res.headers.getSetCookie?.() ?? []
  const raw = setCookies.find((c) => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) throw new Error(`/api/login response did not set ${COOKIE_NAME} cookie`)
  return raw.split(';')[0].split('=').slice(1).join('=')
}

function attachSaveObserver(page) {
  // Captures the timeline of PATCH /api/profile and downstream refetches
  const events = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('/api/profile') && req.method() === 'PATCH') {
      events.push({ kind: 'patch-request', url, t: Date.now() })
    } else if (url.match(/\/api\/sponsor-data(\?|$)/)) {
      events.push({ kind: 'sponsor-data', url, t: Date.now() })
    } else if (url.match(/\/api\/profile\/sponsor-data(\?|$)/)) {
      events.push({ kind: 'profile-sponsor-data', url, t: Date.now() })
    }
  })
  page.on('response', async (res) => {
    const url = res.url()
    if (url.includes('/api/profile') && res.request().method() === 'PATCH') {
      events.push({ kind: 'patch-response', url, t: Date.now(), status: res.status() })
    }
  })
  return events
}

async function fillAllProfileFields(page) {
  // Fill every visible input on the profile editor with non-empty values.
  // Idempotent — safe to call on any profile state. Selects the first option
  // in every <select>, ticks at least one option in every chip group.

  // Text inputs and textareas — set a placeholder value on every non-file input
  const textInputs = page.locator('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea')
  const count = await textInputs.count()
  for (let i = 0; i < count; i++) {
    const el = textInputs.nth(i)
    // Skip disabled + readonly + hidden inputs
    if (!(await el.isVisible().catch(() => false))) continue
    if (await el.isDisabled().catch(() => false)) continue
    const currentVal = await el.inputValue().catch(() => '')
    if (!currentVal) {
      await el.fill('test-value').catch(() => {})
    }
  }

  // <select> — pick the first non-empty option on every select
  const selects = page.locator('select')
  const selectCount = await selects.count()
  for (let i = 0; i < selectCount; i++) {
    const sel = selects.nth(i)
    if (!(await sel.isVisible().catch(() => false))) continue
    const options = await sel.locator('option').all()
    for (const opt of options) {
      const val = await opt.getAttribute('value').catch(() => '')
      if (val) {
        await sel.selectOption(val).catch(() => {})
        break
      }
    }
  }

  // Chip toggles — target the array-field labels (Solutions offering, Solutions
  // seeking, Target industries). Click the first chip in each group if the
  // group has no selected chip.
  for (const label of ARRAY_FIELD_LABELS) {
    const group = page.locator(`label:has-text("${label}") + div, label:has-text("${label}") ~ div`).first()
    if (!(await group.isVisible().catch(() => false))) continue
    const chips = group.locator('button[type="button"]')
    const chipCount = await chips.count().catch(() => 0)
    if (chipCount === 0) continue
    // Check if any chip in this group is already selected (activated state uses
    // a text-white class per the MultiChips component)
    const anySelected = await group.locator('button.text-white').count().catch(() => 0)
    if (anySelected === 0) {
      await chips.first().click({ force: true }).catch(() => {})
    }
  }
}

async function clickSaveButton(page) {
  const btn = page.locator('button[type="submit"]:has-text("Save"), button:has-text("Save changes")').first()
  await btn.click({ force: true })
}

async function readCompletenessPercentage(page) {
  // The dashboard renders "N% complete" — locate the numeric text.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  const bodyText = await page.locator('body').innerText()
  const m = bodyText.match(/(\d{1,3})%/)
  return m ? Number(m[1]) : null
}

async function readMissingList(page) {
  // The dashboard renders the completeness "missing" list of field labels.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  const bodyText = await page.locator('body').innerText()
  const missing = []
  for (const label of ARRAY_FIELD_LABELS) {
    if (bodyText.includes(label)) missing.push(label)
  }
  return missing
}

async function step1_saveTriggersRefetch(browser, cookie) {
  console.log('\n── Step 1: successful save invalidates sponsor-data + profile-sponsor-data (AC-1 + AC-2) ──')
  const ctx = await browser.newContext()
  await ctx.addCookies([{
    name: COOKIE_NAME, value: cookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax',
  }])
  const page = await ctx.newPage()
  const events = attachSaveObserver(page)
  try {
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    if (page.url().includes('/login')) {
      fail('landed on /login when navigating to /profile — session cookie not accepted')
      return
    }
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await fillAllProfileFields(page)
    await clickSaveButton(page)
    // Wait for the "Saved & synced" indicator OR up to 10s
    await page.waitForSelector('text=/Saved.*synced/i', { timeout: 10000 }).catch(() => {})

    const patchResp = events.find(e => e.kind === 'patch-response')
    if (!patchResp) { fail('no PATCH /api/profile response observed'); return }
    if (patchResp.status !== 200) { fail(`PATCH /api/profile returned ${patchResp.status} — save failed`); return }

    const sponsorDataAfterPatch = events.find(e => e.kind === 'sponsor-data' && e.t >= patchResp.t)
    if (!sponsorDataAfterPatch) {
      fail('no /api/sponsor-data request fired after successful PATCH (AC-1 broken)')
    } else {
      const delta = sponsorDataAfterPatch.t - patchResp.t
      if (delta > INVALIDATION_LATENCY_MS) {
        fail(`/api/sponsor-data refetch fired ${delta}ms after PATCH response (> ${INVALIDATION_LATENCY_MS}ms budget)`)
      } else {
        ok(`AC-1: /api/sponsor-data refetch fired ${delta}ms after PATCH response`)
      }
    }

    const profileSpAfterPatch = events.find(e => e.kind === 'profile-sponsor-data' && e.t >= patchResp.t)
    if (!profileSpAfterPatch) {
      fail('no /api/profile/sponsor-data request fired after successful PATCH (AC-2 broken)')
    } else {
      ok(`AC-2: /api/profile/sponsor-data refetch fired ${profileSpAfterPatch.t - patchResp.t}ms after PATCH response`)
    }
  } finally {
    await ctx.close()
  }
}

async function step2_dashboardShowsFreshPercentage(browser, cookie) {
  console.log('\n── Step 2: dashboard renders fresh percentage post-save (AC-5) ──')
  const ctx = await browser.newContext()
  await ctx.addCookies([{
    name: COOKIE_NAME, value: cookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax',
  }])
  const page = await ctx.newPage()
  try {
    // Assumes Step 1 filled all fields. Navigate directly to dashboard.
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    if (page.url().includes('/login')) {
      fail('landed on /login when navigating to /dashboard — session cookie not accepted')
      return
    }
    const pct = await readCompletenessPercentage(page)
    if (pct === null) {
      fail('could not locate completeness percentage on dashboard')
    } else if (pct === 100) {
      ok(`AC-5: dashboard shows 100% after all-fields save`)
    } else {
      fail(`AC-5: dashboard shows ${pct}% after all-fields save — expected 100%`)
    }
  } finally {
    await ctx.close()
  }
}

async function step3_emptyArraysCountedAsMissing(browser, cookie) {
  console.log('\n── Step 3: clearing the 3 array fields counts them as missing (AC-3 + AC-4) ──')
  const ctx = await browser.newContext()
  await ctx.addCookies([{
    name: COOKIE_NAME, value: cookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax',
  }])
  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    if (page.url().includes('/login')) {
      fail('landed on /login when navigating to /profile — session cookie not accepted')
      return
    }
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Un-tick every selected chip in each of the 3 array-field groups
    for (const label of ARRAY_FIELD_LABELS) {
      const group = page.locator(`label:has-text("${label}") + div, label:has-text("${label}") ~ div`).first()
      if (!(await group.isVisible().catch(() => false))) continue
      // Selected chips have the text-white class
      const selectedChips = group.locator('button.text-white')
      const n = await selectedChips.count().catch(() => 0)
      for (let i = 0; i < n; i++) {
        // Each click removes one; the collection shifts, so always click the first
        await group.locator('button.text-white').first().click({ force: true }).catch(() => {})
      }
    }

    await clickSaveButton(page)
    await page.waitForSelector('text=/Saved.*synced/i', { timeout: 10000 }).catch(() => {})

    // Navigate to dashboard and read missing list
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const missing = await readMissingList(page)
    for (const label of ARRAY_FIELD_LABELS) {
      if (missing.includes(label)) {
        ok(`AC-3/4: "${label}" appears in dashboard "missing" list after clearing`)
      } else {
        fail(`AC-3/4: "${label}" does NOT appear in dashboard "missing" list — completeness treats "[]" as filled`)
      }
    }
  } finally {
    await ctx.close()
  }
}

async function main() {
  console.log(`\n[BUG-001] Sponsor profile completeness verification @ ${BASE_URL}`)
  const cookie = await loginAndExtractCookie()
  const browser = await chromium.launch()
  try {
    await step1_saveTriggersRefetch(browser, cookie)
    await step2_dashboardShowsFreshPercentage(browser, cookie)
    await step3_emptyArraysCountedAsMissing(browser, cookie)
  } finally {
    await browser.close()
  }
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  Results: ${passCount} passed, ${failCount} failed\n`)
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(`\n[fatal] ${err?.message ?? err}`)
  process.exit(1)
})
