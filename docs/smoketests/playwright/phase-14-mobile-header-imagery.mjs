#!/usr/bin/env node
/**
 * Phase 14 mobile-app-header imagery verification.
 *
 * Asserts that the attendee app no longer issues image requests to the two
 * hot-linked hostnames that Phase 14 removed:
 *
 *   1. /home — zero image requests target agcdn-1d97e.kxcdn.com
 *      (was: hero fallback served whenever conference.heroImageUrl is null).
 *   2. /people — zero image requests target encrypted-tbn0.gstatic.com
 *      (was: WBR-module 44x44 avatar).
 *
 * Also captures full-page screenshots of /home and /people post-fix for the
 * `git stash` baseline-vs-post visual identity check documented in
 * PRD §6 Phase 14 (amended 2026-06-29). The baseline screenshots are produced
 * by running this script against `git stash`-ed source; the post screenshots
 * are produced by running it against the active source. Multimodal review of
 * the two PNGs is the visual-identity AC.
 *
 * Prerequisites:
 *   - Attendee app running in local prod mode on http://localhost:3001
 *     (`pnpm --filter attendee build && pnpm --filter attendee start`).
 *   - Seeded credentials per packages/db/prisma/seed.ts
 *     (default: steph@curry.com / stephcurry).
 *   - Seeded conference row leaves heroImageUrl=null (the every-fresh-install
 *     case Phase 14 fixes). If a prior session set heroImageUrl via
 *     /dashboard/app-settings, re-seed: `pnpm db:seed`.
 *   - Playwright + chromium installed (root devDep + `npx playwright install chromium`).
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'

const BASE_URL = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const EMAIL = process.env.ATTENDEE_EMAIL ?? 'steph@curry.com'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'stephcurry'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

const HERO_FORBIDDEN_HOST = 'agcdn-1d97e.kxcdn.com'
const PEOPLE_FORBIDDEN_HOST = 'encrypted-tbn0.gstatic.com'

const HOME_SCREENSHOT = '/tmp/phase-14-attendee-home-post.png'
const PEOPLE_SCREENSHOT = '/tmp/phase-14-attendee-people-post.png'

// Capture-only mode: skip the forbidden-hostname assertions and exit 0 after
// writing screenshots. Used by the smoketest doc's Step 3 baseline-capture
// workflow, where the script runs against `git stash`-ed pre-Phase-14 source
// (which deterministically emits the forbidden hostnames). In capture-only
// mode the precondition still runs — heroImageUrl=null is required for the
// baseline to be comparable to the post screenshots.
const CAPTURE_ONLY = process.env.PHASE14_CAPTURE_ONLY === '1'

let passCount = 0
let failCount = 0

function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }

function attachImageRequestCounter(page, forbiddenHost) {
  const matched = []
  page.on('request', (req) => {
    if (req.resourceType() !== 'image') return
    const url = req.url()
    if (url.includes(forbiddenHost)) matched.push(url)
  })
  return matched
}

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

async function assertHeroImageUrlIsNull(sessionToken) {
  console.log(`\n── Precondition: conference.heroImageUrl is null ──`)
  const res = await fetch(`${BASE_URL}/api/data/home`, {
    headers: { Cookie: `${COOKIE_NAME}=${sessionToken}` },
  })
  if (res.status !== 200) {
    throw new Error(`GET /api/data/home returned ${res.status} — session cookie not accepted, or route shape changed`)
  }
  const data = await res.json()
  if (data === null || typeof data !== 'object') {
    throw new Error(`Setup failure: /api/data/home returned a non-object body — route shape changed or auth degraded`)
  }
  if (data.conference === null || typeof data.conference !== 'object') {
    throw new Error(`Setup failure: /api/data/home returned no \`conference\` object — seed has no active Conference row, or the route shape changed`)
  }
  if (!Object.prototype.hasOwnProperty.call(data.conference, 'heroImageUrl')) {
    throw new Error(`Setup failure: \`conference\` lacks the \`heroImageUrl\` key — schema regression in the route's Prisma select`)
  }
  const heroUrl = data.conference.heroImageUrl
  if (heroUrl !== null) {
    throw new Error(
      `Precondition failed: conference.heroImageUrl is ${JSON.stringify(heroUrl)}. ` +
      `The /home Step 1 contract requires literal \`null\` (the every-fresh-install case Phase 14 fixes). ` +
      `Re-seed with \`pnpm db:seed\` to reset, or clear the value via /dashboard/app-settings.`
    )
  }
  ok(`conference.heroImageUrl is null — /home Step 1 precondition satisfied`)
}

async function checkHome(browser, sessionToken) {
  console.log(`\n── Step 1: /home fires zero image requests to ${HERO_FORBIDDEN_HOST} ──`)
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro mobile profile
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
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
    const matched = attachImageRequestCounter(page, HERO_FORBIDDEN_HOST)
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle' })
    if (page.url().includes('/login')) {
      fail(`navigated to /home but landed on ${page.url()} — session cookie not accepted`)
      return
    }
    if (CAPTURE_ONLY) {
      console.log(`  (capture-only mode: /home emitted ${matched.length} image request(s) to ${HERO_FORBIDDEN_HOST} — assertion skipped)`)
    } else if (matched.length === 0) {
      ok(`/home emitted 0 image requests to ${HERO_FORBIDDEN_HOST}`)
    } else {
      fail(`/home emitted ${matched.length} image request(s) to ${HERO_FORBIDDEN_HOST}: ${matched.join(', ')}`)
    }
    await page.screenshot({ path: HOME_SCREENSHOT, fullPage: true })
    ok(`screenshot captured at ${HOME_SCREENSHOT}`)
  } finally {
    await ctx.close()
  }
}

async function checkPeople(browser, sessionToken) {
  console.log(`\n── Step 2: /people fires zero image requests to ${PEOPLE_FORBIDDEN_HOST} ──`)
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
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
    const matched = attachImageRequestCounter(page, PEOPLE_FORBIDDEN_HOST)
    await page.goto(`${BASE_URL}/people`, { waitUntil: 'networkidle' })
    if (page.url().includes('/login')) {
      fail(`navigated to /people but landed on ${page.url()} — session cookie not accepted`)
      return
    }
    if (CAPTURE_ONLY) {
      console.log(`  (capture-only mode: /people emitted ${matched.length} image request(s) to ${PEOPLE_FORBIDDEN_HOST} — assertion skipped)`)
    } else if (matched.length === 0) {
      ok(`/people emitted 0 image requests to ${PEOPLE_FORBIDDEN_HOST}`)
    } else {
      fail(`/people emitted ${matched.length} image request(s) to ${PEOPLE_FORBIDDEN_HOST}: ${matched.join(', ')}`)
    }
    await page.screenshot({ path: PEOPLE_SCREENSHOT, fullPage: true })
    ok(`screenshot captured at ${PEOPLE_SCREENSHOT}`)
  } finally {
    await ctx.close()
  }
}

async function main() {
  console.log(`\n[Phase 14] Attendee mobile-app-header imagery contract @ ${BASE_URL}`)
  const sessionToken = await loginAndExtractCookie()
  await assertHeroImageUrlIsNull(sessionToken)
  const browser = await chromium.launch()
  try {
    await checkHome(browser, sessionToken)
    await checkPeople(browser, sessionToken)
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
