#!/usr/bin/env node
/**
 * Phase 12a contract verification — two modes:
 *
 *   Default mode (Step 5, AI-failure / pattern γ):
 *     Intercept POST /api/recommendations/*/draft-intro at the network layer
 *     and return HTTP 502 { error: "ai_unavailable" }. Assert the modal:
 *       1. opens with an empty textarea,
 *       2. renders the "⚠ AI draft unavailable" banner,
 *       3. keeps Send disabled while the textarea is empty,
 *       4. enables Send once manual text is typed,
 *       5. does NOT interpose the "Limited data — Send anyway?" confirm
 *          modal on the pattern γ manual-send path (user authorship
 *          implies confidence),
 *       6. sends the manually-typed text to /api/request-meeting.
 *
 *   Send-error mode (Step 6, non-2xx from /api/request-meeting):
 *     Let the draft-intro request pass through — the modal enters either
 *     the ready or the pattern γ empty state depending on whether the
 *     runner env has a real OPENAI_API_KEY. Either state is fine; the
 *     send-error assertions hold regardless. The script then intercepts
 *     POST /api/request-meeting and returns HTTP 400 { error: "Message
 *     too long (max 1000 chars)" }.
 *     Assert the modal:
 *       1. renders an inline error banner containing the server's error text,
 *       2. preserves the textarea contents,
 *       3. re-enables the Send button (not stuck in "Sending…"),
 *       4. does NOT auto-close on send failure.
 *
 * Mode selection via env: PHASE12A_MODE=ai-failure (default) | send-error.
 *
 * Prerequisites:
 *   - Sponsor app running in local prod mode on http://localhost:3003
 *     (`pnpm --filter sponsor build && pnpm --filter sponsor start`).
 *   - `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true` AND
 *     `NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true` in the
 *     sponsor app's env at build time. (The client mirror is baked in
 *     at build time — a rebuild is required after toggling.)
 *   - Seeded credentials per packages/db/prisma/seed.ts.
 *   - Playwright + chromium installed (see PRD §8.6 / package.json devDep).
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs
 *   PHASE12A_MODE=send-error node docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'

const BASE_URL = process.env.SPONSOR_BASE_URL ?? 'http://localhost:3003'
const EMAIL = process.env.SPONSOR_EMAIL ?? 'sponsor@shopify.com'
const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'sponsor123'
const MODE = process.env.PHASE12A_MODE ?? 'ai-failure' // 'ai-failure' | 'send-error'
const SEND_ERROR_STATUS = 400
const SEND_ERROR_BODY = 'Message too long (max 1000 chars)'

// Cookie prefix follows the protocol (matches Phase 3 + Phase 14 precedent).
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

const MANUAL_INTRO_TEXT = 'Hi there — writing this manually because the AI draft was unavailable. Would love to swap notes at the conference.'

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
    throw new Error(`POST /api/login returned ${res.status} — seeded credentials may be missing`)
  }
  const setCookies = res.headers.getSetCookie?.() ?? []
  const raw = setCookies.find((c) => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) {
    throw new Error(`/api/login response did not set ${COOKIE_NAME} cookie`)
  }
  const value = raw.split(';')[0].split('=').slice(1).join('=')
  return value
}

async function runAiFailureMode(browser) {
  console.log('\n── Phase 12a AI-failure path (pattern γ) ──')
  const sessionToken = await loginAndExtractCookie()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  try {
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

    const page = await ctx.newPage()

    // Intercept the AI route and fulfill with a 502 to trigger pattern γ.
    let interceptedDraftIntro = false
    await page.route(/\/api\/recommendations\/[^/]+\/draft-intro$/, async (route) => {
      interceptedDraftIntro = true
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'ai_unavailable' }),
      })
    })

    // Track the request-meeting POST so we can inspect its body.
    let requestMeetingBody = null
    page.on('request', async (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/api/request-meeting')) {
        try {
          requestMeetingBody = req.postDataJSON()
        } catch {
          requestMeetingBody = req.postData()
        }
      }
    })

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    if (page.url().includes('/login')) {
      fail(`landed on ${page.url()} — session cookie not accepted`)
      return
    }

    // Locate the first Draft intro button. Guard: it must be enabled;
    // if none are enabled the recommended-attendee set doesn't include
    // a canDraft-passing entry, which is a seed-data problem, not a
    // Phase 12a defect.
    const draftBtn = page.locator('button:has-text("Draft intro"):not([disabled])').first()
    if ((await draftBtn.count()) === 0) {
      fail('no enabled "Draft intro" button on /dashboard — check that the feature flag is on AND at least one recommended-attendee row has bio ≥ 20 chars AND the sponsor has a tagline. Also verify NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED was set at BUILD TIME (the client mirror is compile-time inlined).')
      return
    }
    ok('found enabled Draft intro button')

    await draftBtn.click()

    // Wait for the modal + banner. The intercepted 502 completes fast.
    await page.waitForSelector('text=/AI draft unavailable/i', { timeout: 5000 })
    ok('modal renders "AI draft unavailable" banner')

    if (!interceptedDraftIntro) {
      fail('draft-intro request was not intercepted — route matcher may be off')
      return
    }
    ok('draft-intro POST intercepted at 502')

    // Textarea should be empty on the pattern γ path.
    const textarea = page.locator('textarea').first()
    const initialValue = await textarea.inputValue()
    if (initialValue === '') {
      ok('textarea empty on pattern γ path')
    } else {
      fail(`textarea non-empty on pattern γ (got ${JSON.stringify(initialValue.slice(0, 40))}...)`)
    }

    // Send should be disabled while textarea is empty. Locate the primary Send
    // button (text starts with "Send intro to"). Note: since the AI unavailable
    // banner is rendered, hasSparseInputs may also be true (depending on the
    // target attendee's bio). The wasAiFailed flag makes the confirm modal
    // skip regardless.
    const sendBtn = page.locator('button:has-text("Send intro to")').first()
    const disabledInitially = await sendBtn.isDisabled()
    if (disabledInitially) {
      ok('Send button disabled with empty textarea')
    } else {
      fail('Send button enabled with empty textarea — pattern γ contract broken')
    }

    // Type a manual message. Send should re-enable.
    await textarea.fill(MANUAL_INTRO_TEXT)
    const disabledAfterType = await sendBtn.isDisabled()
    if (!disabledAfterType) {
      ok('Send button enabled after manual textarea entry')
    } else {
      fail('Send button remains disabled after manual textarea entry')
    }

    // Click Send. The "Limited data — Send anyway?" confirm modal must NOT
    // appear on the pattern γ manual-send path.
    await sendBtn.click()

    // Race: either the confirm modal appears (fail) or the request-meeting
    // POST fires (pass). Give it up to 3 s.
    let confirmDetected = false
    try {
      await page.waitForSelector('text=/Limited data — Send anyway/i', { timeout: 1500 })
      confirmDetected = true
    } catch { /* expected — no confirm on pattern γ */ }

    if (confirmDetected) {
      fail('confirm modal interposed on pattern γ manual-send — should have bypassed')
    } else {
      ok('confirm modal did NOT interpose on pattern γ manual-send')
    }

    // Wait a moment for the request-meeting POST to fire and be captured.
    await page.waitForTimeout(1000)

    if (!requestMeetingBody) {
      fail('no POST to /api/request-meeting fired within 1s after Send click')
    } else if (typeof requestMeetingBody === 'object' && requestMeetingBody.message === MANUAL_INTRO_TEXT) {
      ok('request-meeting POST body carries the manually-typed intro text')
    } else {
      fail(`request-meeting POST body did not match expected manual text (got: ${JSON.stringify(requestMeetingBody)})`)
    }
  } finally {
    await ctx.close()
  }
}

async function runSendErrorMode(browser) {
  console.log('\n── Phase 12a Send-error path (400 from /api/request-meeting) ──')
  const sessionToken = await loginAndExtractCookie()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  try {
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

    const page = await ctx.newPage()

    // Let the draft-intro request through (real AI call). If the test
    // env lacks OPENAI_API_KEY the route returns 502 and the modal
    // falls into pattern γ — the send-error assertions still hold, so
    // we don't gate on which state the modal enters here.

    // Intercept the request-meeting POST and return 400.
    let interceptedRequestMeeting = false
    await page.route('**/api/request-meeting', async (route) => {
      interceptedRequestMeeting = true
      await route.fulfill({
        status: SEND_ERROR_STATUS,
        contentType: 'application/json',
        body: JSON.stringify({ error: SEND_ERROR_BODY }),
      })
    })

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    if (page.url().includes('/login')) {
      fail(`landed on ${page.url()} — session cookie not accepted`)
      return
    }

    const draftBtn = page.locator('button:has-text("Draft intro"):not([disabled])').first()
    if ((await draftBtn.count()) === 0) {
      fail('no enabled "Draft intro" button on /dashboard — see AI-failure mode error message for setup checklist')
      return
    }
    await draftBtn.click()

    // Wait for either the AI-drafted textarea to populate OR the pattern-γ
    // empty state to render. In either case, the textarea must eventually
    // exist and Send must eventually be reachable.
    const textarea = page.locator('textarea').first()
    await textarea.waitFor({ timeout: 10_000 })

    // Ensure the textarea has non-empty content so Send is enabled.
    const currentValue = await textarea.inputValue()
    if (!currentValue.trim()) {
      await textarea.fill('Testing the send-error path. This message will be intercepted by Playwright.')
    }
    // Snapshot the exact pre-send value so preservation-after-error is an
    // equality check, not just a non-emptiness check. R2-F1: a regression
    // that mutated but did not clear the textarea would false-pass a
    // non-emptiness assertion.
    const preSendValue = await textarea.inputValue()

    const sendBtn = page.locator('button:has-text("Send intro to")').first()

    // Bypass any low-confidence confirm modal by pretending pattern γ
    // context (no confirm should appear if the AI failed). If it does
    // appear (AI succeeded with sparse inputs), click Send anyway.
    await sendBtn.click()
    const confirmSendAnyway = page.locator('button:has-text("Send anyway")')
    try {
      await confirmSendAnyway.waitFor({ timeout: 1000 })
      await confirmSendAnyway.click()
    } catch { /* no confirm — pattern γ path or high-confidence path */ }

    // Wait for the intercepted 400 to fire and the modal to render the
    // error state.
    await page.waitForTimeout(1500)

    if (!interceptedRequestMeeting) {
      fail('/api/request-meeting POST was not intercepted — check that Send actually fired')
      return
    }
    ok('/api/request-meeting POST intercepted with 400')

    // Assert the inline error banner rendered with server text.
    const banner = page.locator(`text=${SEND_ERROR_BODY}`)
    if ((await banner.count()) === 0) {
      fail(`inline error banner missing — expected "${SEND_ERROR_BODY}" in modal DOM`)
    } else {
      ok('inline error banner rendered with server error text')
    }

    // Assert the textarea contents are EXACTLY preserved (byte-for-byte
    // against the pre-send snapshot) — non-emptiness alone isn't enough
    // per R2-F1.
    const preservedValue = await textarea.inputValue()
    if (preservedValue === preSendValue) {
      ok('textarea contents preserved verbatim after send failure')
    } else if (preservedValue.trim()) {
      fail(`textarea mutated after send failure (pre=${JSON.stringify(preSendValue.slice(0, 40))}..., post=${JSON.stringify(preservedValue.slice(0, 40))}...)`)
    } else {
      fail('textarea cleared after send failure — should preserve')
    }

    // Assert Send re-enabled (not stuck in Sending…).
    const sendDisabledAfterFailure = await sendBtn.isDisabled()
    if (!sendDisabledAfterFailure) {
      ok('Send button re-enabled after send failure')
    } else {
      fail('Send button remains disabled after send failure — stuck in Sending… state')
    }

    // Assert modal is still open (did not auto-close on 400).
    const modalTitle = page.locator('h2:has-text("Draft intro to")')
    if ((await modalTitle.count()) > 0) {
      ok('modal remained open after send failure (no auto-close on 4xx)')
    } else {
      fail('modal auto-closed on send failure — contract broken')
    }
  } finally {
    await ctx.close()
  }
}

async function main() {
  console.log(`\n[Phase 12a] Sponsor AI intro contract @ ${BASE_URL} (mode: ${MODE})`)
  const browser = await chromium.launch()
  try {
    if (MODE === 'send-error') {
      await runSendErrorMode(browser)
    } else if (MODE === 'ai-failure') {
      await runAiFailureMode(browser)
    } else {
      throw new Error(`Unknown PHASE12A_MODE=${MODE}. Expected "ai-failure" or "send-error".`)
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
