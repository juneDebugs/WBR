#!/usr/bin/env node
/**
 * Phase 3 routing-contract verification.
 *
 * Asserts that the sponsor app's `<link rel="preload" href="/api/attendees">`
 * fires ONLY on authenticated routes:
 *
 *   1. Unauthenticated visit to /login fires zero /api/attendees requests.
 *   2. Authenticated visit to /dashboard fires ≥ 1 /api/attendees request.
 *
 * Prerequisites:
 *   - Sponsor app running in local prod mode on http://localhost:3003
 *     (`pnpm --filter sponsor build && pnpm --filter sponsor start`).
 *   - Seeded credentials per packages/db/prisma/seed.ts
 *     (default: june@tailor.tech / admin123).
 *   - Playwright + chromium installed (see PRD §8.6 / package.json devDep).
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-3-sponsor-preload-relocate.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'

const BASE_URL = process.env.SPONSOR_BASE_URL ?? 'http://localhost:3003'
const EMAIL = process.env.SPONSOR_EMAIL ?? 'june@tailor.tech'
const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'admin123'
const TARGET_PATH = '/api/attendees'
// Cookie name matches the protocol — sponsor's /api/login (apps/sponsor/app/api/login/route.ts)
// emits `__Secure-next-auth.session-token` over HTTPS (Vercel preview) and
// `next-auth.session-token` over HTTP (local prod build).
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

let passCount = 0
let failCount = 0

function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }

function attachAttendeesCounter(page) {
  const matched = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes(TARGET_PATH)) matched.push(url)
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

async function checkUnauthenticatedLogin(browser) {
  console.log('\n── Step 1: unauthenticated /login fires zero /api/attendees ──')
  const ctx = await browser.newContext()
  try {
    const page = await ctx.newPage()
    const matched = attachAttendeesCounter(page)
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
    if (matched.length === 0) {
      ok(`/login emitted 0 ${TARGET_PATH} requests`)
    } else {
      fail(`/login emitted ${matched.length} ${TARGET_PATH} request(s): ${matched.join(', ')}`)
    }
  } finally {
    await ctx.close()
  }
}

async function checkAuthenticatedDashboard(browser) {
  console.log('\n── Step 2: authenticated /dashboard fires ≥ 1 /api/attendees ──')
  const sessionToken = await loginAndExtractCookie()
  const ctx = await browser.newContext()
  try {
    await ctx.addCookies([
      {
        name: COOKIE_NAME,
        value: sessionToken,
        url: BASE_URL,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])
    const page = await ctx.newPage()
    const matched = attachAttendeesCounter(page)
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    if (page.url().includes('/login')) {
      fail(`navigated to /dashboard but landed on ${page.url()} — session cookie not accepted`)
      return
    }
    if (matched.length >= 1) {
      ok(`/dashboard emitted ${matched.length} ${TARGET_PATH} request(s)`)
    } else {
      fail(`/dashboard emitted 0 ${TARGET_PATH} requests`)
    }
  } finally {
    await ctx.close()
  }
}

async function main() {
  console.log(`\n[Phase 3] Sponsor preload routing contract @ ${BASE_URL}`)
  const browser = await chromium.launch()
  try {
    await checkUnauthenticatedLogin(browser)
    await checkAuthenticatedDashboard(browser)
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
