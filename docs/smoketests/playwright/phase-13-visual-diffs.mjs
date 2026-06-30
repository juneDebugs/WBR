#!/usr/bin/env node
/**
 * Phase 13 visual-diff capture.
 *
 * Captures mobile-viewport, full-page screenshots of the four imagery-affected
 * surfaces named in PRD §6 Phase 13 (and re-stated in the demo sprint plan
 * § Phase 13 acceptance criteria):
 *
 *   1. meetings /login        — Phase 4 imagery-strip post-state
 *   2. sponsor  /login        — Phase 4 imagery-strip post-state (also serves
 *                                as the Phase 2 sponsor-viewport mobile proxy;
 *                                real-iOS verification is UAT-only)
 *   3. attendee /home         — Phase 14 hero gradient fallback post-state
 *   4. attendee /people       — Phase 14 local PWA brand-mark avatar post-state
 *
 * Screenshots are written to docs/perf/visual-diffs/ (committed) so the
 * Phase 13 perf delta report at docs/perf-delta-2026-07-06.md can reference
 * them by relative path. Default target = production deployments (Tier A) per
 * docs/perf/README.md § "Production app → Vercel host mapping"; per-app base
 * URLs are overridable via env vars for local-prod (Tier C) reruns.
 *
 * The attendee app's /home and /people require an authenticated session.
 * Authentication is done via POST /api/login against each per-app base URL
 * with the seeded ORGANIZER credentials (default: june@tailor.tech / admin123),
 * matching the Phase 14 script pattern. The cookie name is selected per
 * scheme — __Secure-next-auth.session-token on HTTPS, next-auth.session-token
 * on HTTP — and the `secure` cookie attribute matches.
 *
 * The /login routes do not require auth (and Phase 7 § Methodology confirmed
 * they do not redirect when an auth'd cookie is present), so they are
 * captured without an auth context.
 *
 * Prerequisites:
 *   - Network access to the configured base URLs (production by default).
 *   - Seeded ORGANIZER credentials accepted by the attendee app's /api/login.
 *   - Playwright + chromium installed (root devDep + `npx playwright install
 *     chromium`).
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-13-visual-diffs.mjs
 *
 *   # Override any subset of base URLs to capture against a local prod build
 *   # or a Vercel preview:
 *   ATTENDEE_BASE_URL=http://localhost:3001 \
 *   MEETINGS_BASE_URL=http://localhost:3002 \
 *   SPONSOR_BASE_URL=http://localhost:3003 \
 *     node docs/smoketests/playwright/phase-13-visual-diffs.mjs
 *
 * Exits 0 when all four screenshots are written; 1 on any capture failure.
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const ATTENDEE_BASE_URL = process.env.ATTENDEE_BASE_URL ?? 'https://wbr-mobile.vercel.app'
const MEETINGS_BASE_URL = process.env.MEETINGS_BASE_URL ?? 'https://wbr-meetings.vercel.app'
const SPONSOR_BASE_URL = process.env.SPONSOR_BASE_URL ?? 'https://wbr-sponsor.vercel.app'

const ATTENDEE_EMAIL = process.env.ATTENDEE_EMAIL ?? 'june@tailor.tech'
const ATTENDEE_PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'admin123'

// Env-gated capture-mode controls (used by the baseline-reproduction recipe
// documented in docs/smoketests/phase-13-perf-delta-report.md):
//   PHASE13_OUTPUT_SUFFIX  — appended after `-mobile` or `-desktop` in the
//                            output filename. Defaults to "post". Set to
//                            "baseline" when capturing against a local prod
//                            build of pre-phase source. Set to
//                            "post-gradient" when capturing against current
//                            source with null Conference.heroImageUrl.
//   PHASE13_VIEWPORT       — "mobile" (default) or "desktop". Affects both
//                            the viewport size and the output filename.
//   PHASE13_SURFACES       — comma-separated list of surface names to capture
//                            (e.g. "attendee-home,attendee-people"). Defaults
//                            to all four. Use to skip surfaces whose local
//                            server isn't running during a partial baseline
//                            capture pass.
const OUTPUT_SUFFIX = process.env.PHASE13_OUTPUT_SUFFIX ?? 'post'
const VIEWPORT_MODE = process.env.PHASE13_VIEWPORT ?? 'mobile'
const SURFACE_FILTER = process.env.PHASE13_SURFACES
  ? new Set(process.env.PHASE13_SURFACES.split(',').map((s) => s.trim()).filter(Boolean))
  : null

const OUTPUT_DIR = resolve(process.cwd(), 'docs/perf/visual-diffs')
const MOBILE_VIEWPORT = { width: 390, height: 844 }
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }
const MOBILE_DEVICE = {
  viewport: MOBILE_VIEWPORT,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
}
const DESKTOP_DEVICE = {
  viewport: DESKTOP_VIEWPORT,
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
}

// Surface keys are stable; output filename is composed as
// `<key>-<VIEWPORT_MODE>-<OUTPUT_SUFFIX>.png` (e.g. `meetings-login-mobile-post.png`,
// `attendee-home-mobile-baseline.png`, `sponsor-login-desktop-baseline-proxy.png`).
const SURFACES = [
  {
    key: 'meetings-login',
    label: 'meetings /login (Phase 4 imagery strip)',
    baseUrl: MEETINGS_BASE_URL,
    path: '/login',
    auth: false,
  },
  {
    key: 'sponsor-login',
    label: 'sponsor /login (Phase 4 imagery strip + Phase 2 viewport proxy)',
    baseUrl: SPONSOR_BASE_URL,
    path: '/login',
    auth: false,
  },
  {
    // Phase 14 changed the null-case fallback in HomeScreen.tsx (hero render
    // block) from a hot-linked agcdn URL to a code-based gradient. The active
    // conditional renders the photographic backdrop when conference.heroImageUrl
    // is set. On production the field is currently set, so the default capture
    // hits the photographic path; the gradient path is captured against a
    // local prod build with null heroImageUrl using PHASE13_OUTPUT_SUFFIX=post-gradient.
    key: 'attendee-home',
    label: 'attendee /home (Phase 14 hero render)',
    baseUrl: ATTENDEE_BASE_URL,
    path: '/home',
    auth: true,
  },
  {
    key: 'attendee-people',
    label: 'attendee /people (Phase 14 local avatar)',
    baseUrl: ATTENDEE_BASE_URL,
    path: '/people',
    auth: true,
  },
]

let passCount = 0
let failCount = 0

function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }

function cookieNameFor(baseUrl) {
  return baseUrl.startsWith('https://')
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'
}

async function loginAndExtractCookie(baseUrl, email, password) {
  const cookieName = cookieNameFor(baseUrl)
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (res.status !== 200) {
    throw new Error(
      `POST ${baseUrl}/api/login returned ${res.status} — seeded credentials may be missing or rotated`
    )
  }
  const setCookies = res.headers.getSetCookie?.() ?? []
  const raw = setCookies.find((c) => c.startsWith(`${cookieName}=`))
  if (!raw) {
    throw new Error(`/api/login response from ${baseUrl} did not set ${cookieName}`)
  }
  return { name: cookieName, value: raw.split(';')[0].split('=').slice(1).join('=') }
}

async function captureSurface(browser, surface) {
  console.log(`\n── ${surface.label} ──`)
  const device = VIEWPORT_MODE === 'desktop' ? DESKTOP_DEVICE : MOBILE_DEVICE
  const ctx = await browser.newContext(device)
  try {
    if (surface.auth) {
      const cookie = await loginAndExtractCookie(
        surface.baseUrl, ATTENDEE_EMAIL, ATTENDEE_PASSWORD
      )
      await ctx.addCookies([
        {
          name: cookie.name,
          value: cookie.value,
          url: surface.baseUrl,
          httpOnly: true,
          sameSite: 'Lax',
          secure: surface.baseUrl.startsWith('https://'),
        },
      ])
    }
    const page = await ctx.newPage()
    const target = `${surface.baseUrl}${surface.path}`
    await page.goto(target, { waitUntil: 'networkidle' })
    // Defensive: a /home or /people navigation that bounces to /login means
    // the session cookie didn't take — emit a hard fail rather than capturing
    // a misleading login-page screenshot under the authenticated-route name.
    if (surface.auth && page.url().includes('/login')) {
      fail(`${surface.label}: navigation to ${target} landed on ${page.url()} — session cookie rejected`)
      return
    }
    const fileName = `${surface.key}-${VIEWPORT_MODE}-${OUTPUT_SUFFIX}.png`
    const out = `${OUTPUT_DIR}/${fileName}`
    await page.screenshot({ path: out, fullPage: true })
    ok(`${surface.label} → ${out}`)
  } catch (err) {
    fail(`${surface.label}: ${err?.message ?? err}`)
  } finally {
    await ctx.close()
  }
}

async function main() {
  console.log(`\n[Phase 13] Visual-diff capture`)
  console.log(`  attendee base: ${ATTENDEE_BASE_URL}`)
  console.log(`  meetings base: ${MEETINGS_BASE_URL}`)
  console.log(`  sponsor  base: ${SPONSOR_BASE_URL}`)
  console.log(`  output dir   : ${OUTPUT_DIR}`)
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const surface of SURFACES) {
      if (SURFACE_FILTER && !SURFACE_FILTER.has(surface.key)) {
        console.log(`\n── skipping ${surface.label} (not in PHASE13_SURFACES filter)`)
        continue
      }
      await captureSurface(browser, surface)
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
