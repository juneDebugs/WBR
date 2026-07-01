#!/usr/bin/env node
/**
 * Phase 12b contract verification — five modes.
 *
 * All modes mock GET /api/recommendations/quota to control the pre-flight
 * button-level state so the tests don't depend on the DB's actual audit
 * log. Each mode then either exercises the client's Draft intro flow
 * (idempotency-key mode) or the modal's cap-hit rendering
 * (cap-burst / cap-daily / cap-global) or the button-level cap-hit
 * (button-cap-hit).
 *
 *   idempotency-key  (default): click Draft intro twice on the same card
 *     with a close in between. Assert that both POSTs to the draft-intro
 *     endpoint carry non-empty idempotencyKey strings, that the two keys
 *     differ, and that they're ≤ 128 chars. Uses a mocked 200 response
 *     with a valid IntroDraft body so the modal enters ready state.
 *
 *   cap-burst:  mock draft-intro POST to return 429 with
 *     { error: "burst_limit", remaining: 3 }. Assert modal renders
 *     "Slow down — try again in a minute." in the amber banner, Send is
 *     absent, and the "3 AI drafts remaining today" line renders.
 *
 *   cap-daily:  mock draft-intro POST to return 429 with
 *     { error: "daily_limit", remaining: 0 }. Assert modal renders
 *     "Daily limit reached. Resets at midnight.", Send is absent, and
 *     the "0 AI drafts remaining today" line renders.
 *
 *   cap-global: mock draft-intro POST to return 503 with
 *     { error: "global_limit" } (no remaining). Assert modal renders
 *     "AI temporarily unavailable.", Send is absent, and NO
 *     "remaining today" line renders (suppressed on global_limit).
 *
 *   button-cap-hit: mock GET /api/recommendations/quota to return
 *     { remaining: 0, capHit: "daily_limit" }. Assert at least one
 *     Draft intro button on the dashboard is disabled with label +
 *     title equal to "Daily limit reached. Resets at midnight." AND
 *     clicking it does not open the modal.
 *
 * Mode selection via env: PHASE12B_MODE=idempotency-key (default) |
 *   cap-burst | cap-daily | cap-global | button-cap-hit.
 *
 * Prerequisites (mirrors Phase 12a script):
 *   - Sponsor app running (local prod build or Vercel preview).
 *   - Both feature flags on at build time.
 *   - Seeded credentials per packages/db/prisma/seed.ts.
 *   - Playwright + chromium installed.
 *
 * Route pattern note: the draft-intro path is
 *   /api/recommendations/[attendeeId]/draft-intro
 * The dynamic segment is written as [attendeeId] throughout this file
 * (never as a glob) so JSDoc block comments never contain the literal
 * asterisk-slash sequence — the Phase 12a script had a defect where an
 * inline glob prematurely closed a JSDoc block and the file failed to
 * parse. Concrete dynamic-segment names sidestep the whole class of bug.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-12b-ai-controls.mjs
 *   PHASE12B_MODE=cap-burst node docs/smoketests/playwright/phase-12b-ai-controls.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'

const BASE_URL = process.env.SPONSOR_BASE_URL ?? 'http://localhost:3003'
const EMAIL = process.env.SPONSOR_EMAIL ?? 'sponsor@shopify.com'
const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'sponsor123'
const MODE = process.env.PHASE12B_MODE ?? 'idempotency-key'

const VERCEL_PROTECTION_BYPASS = process.env.VERCEL_PROTECTION_BYPASS
const BYPASS_HEADERS = VERCEL_PROTECTION_BYPASS
  ? { 'x-vercel-protection-bypass': VERCEL_PROTECTION_BYPASS }
  : {}

const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

const DRAFT_INTRO_RE = /\/api\/recommendations\/[^/]+\/draft-intro$/
const QUOTA_RE = /\/api\/recommendations\/quota$/

const CAP_COPY = {
  burst_limit: 'Slow down — try again in a minute.',
  daily_limit: 'Daily limit reached. Resets at midnight.',
  global_limit: 'AI temporarily unavailable.',
}

// A valid IntroDraft body — Zod IntroSchema requires body 20-400 chars,
// greeting 1-80, signoff 1-60, groundedFields non-empty from the enum.
const MOCK_INTRO_BODY = {
  greeting: 'Hi there,',
  body: 'Testing the idempotency-key contract path — this body is long enough for Zod validation.',
  signoff: '— The team',
  groundedFields: ['attendee.bio'],
}

let passCount = 0
let failCount = 0

function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }

async function loginAndExtractCookie() {
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...BYPASS_HEADERS },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (res.status !== 200) {
    throw new Error(`POST /api/login returned ${res.status} — seeded credentials may be missing`)
  }
  const setCookies = res.headers.getSetCookie?.() ?? []
  const raw = setCookies.find((c) => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) {
    throw new Error(`/api/login response did not set ${COOKIE_NAME} cookie`)
  }
  return raw.split(';')[0].split('=').slice(1).join('=')
}

async function newAuthedContext(browser) {
  const sessionToken = await loginAndExtractCookie()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: BYPASS_HEADERS,
  })
  await ctx.addCookies([
    {
      name: COOKIE_NAME,
      value: sessionToken,
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
      secure: BASE_URL.startsWith('https://'),
    },
  ])
  return ctx
}

async function mockQuota(page, body) {
  await page.route(QUOTA_RE, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

async function waitForEnabledDraftButton(page) {
  const btn = page.locator('button:has-text("Draft intro"):not([disabled])').first()
  await btn.waitFor({ state: 'attached', timeout: 10_000 })
  return btn
}

async function runIdempotencyKeyMode(browser) {
  console.log('\n── Phase 12b idempotency-key path ──')
  const ctx = await newAuthedContext(browser)
  try {
    const page = await ctx.newPage()

    // Mock quota so button is enabled + Send flow can render.
    await mockQuota(page, { remaining: 20, capHit: null })

    // Capture idempotency keys from every draft-intro POST.
    const capturedKeys = []
    await page.route(DRAFT_INTRO_RE, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      let key = null
      try {
        const body = route.request().postDataJSON()
        key = body?.idempotencyKey ?? null
      } catch { /* ignore */ }
      capturedKeys.push(key)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_INTRO_BODY, remaining: 19 }),
      })
    })

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    if (page.url().includes('/login')) {
      fail(`landed on ${page.url()} — session cookie not accepted`)
      return
    }

    let btn
    try {
      btn = await waitForEnabledDraftButton(page)
    } catch {
      fail('no enabled Draft intro button on /dashboard after 10s — verify feature flags at build time + seeded recommended attendee with bio ≥ 20 chars')
      return
    }

    // First click.
    await btn.click()
    // Capture the modal's attendee-name heading so we can scope the
    // second-click lookup to the SAME card. Without this, a tanstack-
    // query refetch between clicks could reorder cards and the second
    // click would exercise a different attendee — the smoketest would
    // pass but not for the "fresh key per SAME-card click" reason.
    const headingText = await page.locator('h2:has-text("Draft intro to")').first().innerText()
    const attendeeName = headingText.replace(/^Draft intro to\s*/, '').trim()
    await page.waitForFunction(() => {
      return document.querySelectorAll('textarea').length > 0
    }, null, { timeout: 5000 })

    // Close modal via Cancel.
    await page.locator('button:has-text("Cancel")').first().click()
    // Wait for modal to unmount.
    await page.waitForSelector('h2:has-text("Draft intro to")', { state: 'detached', timeout: 5000 })

    // Second click — locate the card that contains the same attendee
    // name captured above, then click that card's Draft intro button.
    // This is the "same-card second click" guarantee the idempotency-
    // key contract needs to be tested against.
    const sameCard = page.locator('div', { hasText: attendeeName }).filter({
      has: page.locator('button:has-text("Draft intro"):not([disabled])'),
    }).first()
    btn = sameCard.locator('button:has-text("Draft intro"):not([disabled])').first()
    try {
      await btn.waitFor({ state: 'attached', timeout: 5000 })
    } catch {
      fail(`could not re-locate the "${attendeeName}" card's Draft intro button for the second click`)
      return
    }
    await btn.click()
    await page.waitForSelector('h2:has-text("Draft intro to")', { timeout: 5000 })
    await page.waitForFunction(() => {
      return document.querySelectorAll('textarea').length > 0
    }, null, { timeout: 5000 })

    // Assertions.
    if (capturedKeys.length !== 2) {
      fail(`expected 2 draft-intro POSTs, saw ${capturedKeys.length}`)
      return
    }

    const [k1, k2] = capturedKeys
    if (typeof k1 === 'string' && k1.length > 0 && typeof k2 === 'string' && k2.length > 0) {
      ok('both draft-intro POSTs carried non-empty idempotencyKey strings')
    } else {
      fail(`captured keys not both non-empty strings: ${JSON.stringify(capturedKeys)}`)
    }

    if (k1 !== k2) {
      ok('two Draft intro clicks generated different idempotencyKey values')
    } else {
      fail(`both clicks generated the SAME idempotencyKey (${k1}) — client should refresh per click`)
    }

    if (typeof k1 === 'string' && typeof k2 === 'string' && k1.length <= 128 && k2.length <= 128) {
      ok('both keys ≤ 128 chars (server-side max)')
    } else {
      fail('a captured key exceeded 128 chars')
    }
  } finally {
    await ctx.close()
  }
}

async function runCapHitMode(browser, capCode) {
  console.log(`\n── Phase 12b cap-hit path (${capCode}) ──`)
  const ctx = await newAuthedContext(browser)
  try {
    const page = await ctx.newPage()

    // Pre-flight quota returns clean so the button is enabled and the
    // modal actually opens (cap-hit is discovered by the modal's POST).
    await mockQuota(page, { remaining: 20, capHit: null })

    // Mock draft-intro to return the specific cap-hit response.
    const status = capCode === 'global_limit' ? 503 : 429
    const payload =
      capCode === 'global_limit'
        ? { error: capCode }
        : { error: capCode, remaining: capCode === 'daily_limit' ? 0 : 3 }

    await page.route(DRAFT_INTRO_RE, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      })
    })

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    if (page.url().includes('/login')) {
      fail(`landed on ${page.url()} — session cookie not accepted`)
      return
    }

    let btn
    try {
      btn = await waitForEnabledDraftButton(page)
    } catch {
      fail('no enabled Draft intro button on /dashboard after 10s — verify feature flags at build time + seeded attendee with bio ≥ 20 chars')
      return
    }
    await btn.click()

    // Wait for the modal to open + the POST to resolve into capHit state.
    // Loading state clears once fetch settles; we look for the specific
    // cap-hit copy or a 5s timeout.
    const expectedCopy = CAP_COPY[capCode]
    try {
      await page.waitForSelector(`text=${expectedCopy}`, { timeout: 5000 })
      ok(`modal renders cap-hit copy: "${expectedCopy}"`)
    } catch {
      fail(`modal did not render "${expectedCopy}" within 5s`)
      return
    }

    // Send button should be ABSENT on cap-hit (not just disabled).
    const sendBtn = page.locator('button:has-text("Send intro to")')
    const sendCount = await sendBtn.count()
    if (sendCount === 0) {
      ok('Send button absent on cap-hit')
    } else {
      fail(`Send button rendered ${sendCount} times on cap-hit — should be absent`)
    }

    // Remaining-count line: present on user-caps, absent on global.
    const remainingLoc = page.locator('text=/AI draft(s)? remaining today/')
    const remainingCount = await remainingLoc.count()
    if (capCode === 'global_limit') {
      if (remainingCount === 0) {
        ok('remaining-count line absent on global_limit (as spec)')
      } else {
        fail(`remaining-count line rendered on global_limit — should be suppressed`)
      }
    } else {
      const expectedRemaining = capCode === 'daily_limit' ? 0 : 3
      const expectedText = `${expectedRemaining} AI draft${expectedRemaining === 1 ? '' : 's'} remaining today`
      const exact = await page.locator(`text=${expectedText}`).count()
      if (exact > 0) {
        ok(`remaining-count line renders exact text: "${expectedText}"`)
      } else {
        fail(`remaining-count line missing or wrong — expected "${expectedText}"`)
      }
    }
  } finally {
    await ctx.close()
  }
}

async function runButtonCapHitMode(browser) {
  console.log('\n── Phase 12b button-cap-hit path (daily_limit) ──')
  const ctx = await newAuthedContext(browser)
  try {
    const page = await ctx.newPage()

    // Force the button-level cap-hit state via a mocked quota response.
    await mockQuota(page, { remaining: 0, capHit: 'daily_limit' })

    // Draft-intro POST should NEVER fire if the button is properly gated.
    let draftIntroFired = false
    await page.route(DRAFT_INTRO_RE, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      draftIntroFired = true
      await route.abort()
    })

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    if (page.url().includes('/login')) {
      fail(`landed on ${page.url()} — session cookie not accepted`)
      return
    }

    // Find any Draft intro button — it should be disabled with the
    // cap-hit label. Wait for hydration + the useAiQuota fetch to resolve
    // so the disabled state is applied.
    const expectedLabel = CAP_COPY.daily_limit
    const capHitBtn = page.locator(`button[disabled]:has-text("${expectedLabel}")`).first()
    try {
      await capHitBtn.waitFor({ state: 'attached', timeout: 10_000 })
      ok(`Draft intro button renders with disabled + label "${expectedLabel}"`)
    } catch {
      fail(`no disabled Draft intro button with label "${expectedLabel}" within 10s — check useAiQuota hook + button-level render path`)
      return
    }

    // Verify title attribute matches.
    const titleAttr = await capHitBtn.getAttribute('title')
    if (titleAttr === expectedLabel) {
      ok(`button title attribute = "${expectedLabel}"`)
    } else {
      fail(`button title attribute = ${JSON.stringify(titleAttr)} — expected "${expectedLabel}"`)
    }

    // Click should be a no-op (button is disabled). We use force:true to
    // exercise the click even if the browser normally suppresses clicks
    // on disabled elements — this way we catch a regression where the
    // button pattern lets a disabled click leak through.
    await capHitBtn.click({ force: true }).catch(() => { /* click on disabled may throw; that's fine */ })
    await page.waitForTimeout(500)

    const modalOpen = await page.locator('h2:has-text("Draft intro to")').count()
    if (modalOpen === 0 && !draftIntroFired) {
      ok('clicking disabled cap-hit button did not open modal or fire draft-intro POST')
    } else {
      fail(`disabled button leaked: modalOpen=${modalOpen}, draftIntroFired=${draftIntroFired}`)
    }
  } finally {
    await ctx.close()
  }
}

async function main() {
  console.log(`\n[Phase 12b] AI surface controls @ ${BASE_URL} (mode: ${MODE})`)
  const browser = await chromium.launch()
  try {
    switch (MODE) {
      case 'idempotency-key':
        await runIdempotencyKeyMode(browser)
        break
      case 'cap-burst':
        await runCapHitMode(browser, 'burst_limit')
        break
      case 'cap-daily':
        await runCapHitMode(browser, 'daily_limit')
        break
      case 'cap-global':
        await runCapHitMode(browser, 'global_limit')
        break
      case 'button-cap-hit':
        await runButtonCapHitMode(browser)
        break
      default:
        throw new Error(`Unknown PHASE12B_MODE=${MODE}. Expected one of: idempotency-key, cap-burst, cap-daily, cap-global, button-cap-hit.`)
    }
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
