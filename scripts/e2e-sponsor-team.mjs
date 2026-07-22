#!/usr/bin/env node
// Browser E2E for the sponsor dashboard "Your Team at WBR 2027" section:
//   Goal 1 — the section renders on /dashboard and shows one card per WBR
//            staff member (the Admin app's Staff page list).
//   Goal 2 — a card opens an accessible profile dialog (role=dialog) with a
//            mailto link, dismissable via Escape.
//
// Drives real Chromium: logs in as a sponsor rep, asserts the DOM against the
// live /api/sponsor-data payload, and writes screenshots to SHOT_DIR for a
// human/design review.
//
//   SMOKE_BASE_URL=http://localhost:3003 node scripts/e2e-sponsor-team.mjs           # server already up
//   SMOKE_BASE_URL=http://localhost:3003 node scripts/e2e-sponsor-team.mjs --start   # boot next dev, then kill
//
// Env: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD, SHOT_DIR.

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
let chromium
try { ({ chromium } = require(join(ROOT, 'node_modules/playwright/index.js'))) }
catch { ({ chromium } = require('playwright')) }

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3003'
const PORT = new URL(BASE).port || '3003'
const CREDS = { email: process.env.SMOKE_EMAIL ?? 'sponsor@test.com', password: process.env.SMOKE_PASSWORD ?? 'password123' }
const SHOT_DIR = process.env.SHOT_DIR ?? '/tmp'
const SECTION_TITLE = 'Your Team at WBR 2027'

let serverProc = null
let failures = 0
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function serverUp() {
  try { return (await fetch(`${BASE}/login`, { redirect: 'manual' })).status < 500 } catch { return false }
}
async function waitFor(cond, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { if (await cond()) return; await new Promise(r => setTimeout(r, 1500)) }
  throw new Error(`Timed out waiting for ${label}`)
}
const onLogin = page => new URL(page.url()).pathname.startsWith('/login')
async function login(page, creds) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    if (!onLogin(page)) return
    const email = page.locator('input[type="email"]')
    await email.waitFor({ state: 'visible', timeout: 90_000 })
    await email.fill(creds.email)
    await page.locator('input[type="password"]').fill(creds.password)
    await page.locator('button[type="submit"]').first().click()
    try { await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 }); return }
    catch { if (!onLogin(page)) return }
  }
  throw new Error('login failed after 4 attempts')
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) { console.error(`No server at ${BASE}. Pass --start.`); process.exit(2) }
    console.log(`Starting sponsor dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps/sponsor'), env: { ...process.env, NEXTAUTH_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'sponsor dev server')
    console.log('Server is up.')
  }

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  console.log(`\nLogging in as sponsor rep`)
  await login(page, CREDS)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})

  // Ground truth from the API the page itself consumes.
  const staff = await page.evaluate(async () => {
    const r = await fetch('/api/sponsor-data')
    if (!r.ok) return null
    return (await r.json()).staff ?? null
  })
  check('API exposes a staff array', Array.isArray(staff), 'is /api/sponsor-data returning `staff`?')
  const expectedCount = Array.isArray(staff) ? staff.length : 0
  console.log(`  (API reports ${expectedCount} WBR staff member(s))`)

  // ── Goal 1: section renders with one card per staff member ──
  console.log(`\n[Goal 1 — "${SECTION_TITLE}" section]`)
  const heading = page.getByRole('heading', { name: SECTION_TITLE })
  if (expectedCount === 0) {
    check('section hidden when there is no staff (empty-state rule)', (await heading.count()) === 0)
  } else {
    const shown = await heading.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)
    check('section heading visible at the bottom of the dashboard', shown)
    const section = page.locator('div.card', { has: heading })
    const cards = section.locator('button[aria-haspopup="dialog"]')
    const cardCount = await cards.count()
    check(`renders exactly ${expectedCount} member card(s)`, cardCount === expectedCount, `got ${cardCount}`)
    await heading.scrollIntoViewIfNeeded().catch(() => {})
    await page.screenshot({ path: join(SHOT_DIR, 'sponsor-team-section.png'), fullPage: true }).catch(() => {})

    // ── Goal 2: card → accessible dialog → Escape dismisses ──
    console.log('\n[Goal 2 — profile dialog]')
    await cards.first().click()
    const dialog = page.getByRole('dialog')
    const dialogShown = await dialog.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false)
    check('clicking a card opens a role=dialog popup', dialogShown)
    if (dialogShown) {
      // The first card corresponds to staff[0] (same source order); the email
      // row only renders when the member has an email.
      if (staff?.[0]?.email) {
        check('dialog shows an Email row with a mailto link',
          (await dialog.locator('a[href^="mailto:"]').count()) > 0)
      } else {
        console.log('  ⃠ mailto check skipped — first staff member has no email')
      }
      check('dialog has a labeled Close button',
        (await dialog.getByRole('button', { name: 'Close' }).count()) === 1)
      await page.screenshot({ path: join(SHOT_DIR, 'sponsor-team-dialog.png') }).catch(() => {})
      await page.keyboard.press('Escape')
      const dialogGone = await dialog.waitFor({ state: 'detached', timeout: 10_000 }).then(() => true).catch(() => false)
      check('Escape dismisses the dialog', dialogGone)
    }
  }

  await browser.close()
  console.log(`\n${failures === 0 ? '✅ all E2E checks passed' : `❌ ${failures} check(s) failed`}`)
  console.log(`Screenshots in ${SHOT_DIR}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(() => { if (serverProc) { try { process.kill(-serverProc.pid) } catch {} } process.exit(failures === 0 ? 0 : 1) })
