#!/usr/bin/env node
// Browser-level end-to-end test of the Browse minimum-results guarantee.
//
// Drives real Chrome through both portals: logs in via the login form, opens
// Browse, clicks actual filter chips (including the exact combination from
// the 2026-07-03 bug report), and counts the rendered result cards. Asserts
// every exercised combination shows at least 7 results.
//
//   node scripts/e2e-browse.mjs [--start]
//
// --start boots `next dev` for meetings (:3002) and sponsor (:3003) against
// the local dev.db (Turso vars stripped) and kills them afterwards; without
// it, servers must already be running.
//
// Requires playwright-core (declared at the repo root) and either system
// Google Chrome or a Playwright-managed Chromium. Resolution order:
// PLAYWRIGHT_CORE_PATH env var, then the repo's node_modules.

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))

let chromium
try {
  const modPath = process.env.PLAYWRIGHT_CORE_PATH ?? 'playwright-core'
  ;({ chromium } = require(modPath))
} catch {
  try {
    ({ chromium } = require('playwright'))
  } catch {
    console.error('playwright-core not found. Run `pnpm install` or set PLAYWRIGHT_CORE_PATH.')
    process.exit(2)
  }
}

const MIN = 7
const SPONSOR_BASE = process.env.SMOKE_SPONSOR_URL ?? 'http://localhost:3003'
const MEETINGS_BASE = process.env.SMOKE_MEETINGS_URL ?? 'http://localhost:3002'
const SPONSOR_LOGIN = { email: process.env.SMOKE_EMAIL ?? 'sponsor@shopify.com', password: process.env.SMOKE_PASSWORD ?? 'sponsor123' }
const MEETINGS_LOGIN = { email: process.env.SMOKE_MEETINGS_EMAIL ?? 'steph@curry.com', password: process.env.SMOKE_MEETINGS_PASSWORD ?? 'stephcurry' }
const SHOT_DIR = process.env.E2E_SHOT_DIR ?? join(ROOT, '.e2e-shots')

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Dev server lifecycle ────────────────────────────────────────────────────

const servers = []

async function up(base) {
  try {
    return (await fetch(`${base}/login`, { redirect: 'manual' })).status < 500
  } catch {
    return false
  }
}

async function ensureServer(base, appDir, port) {
  if (await up(base)) return
  if (!process.argv.includes('--start')) {
    console.error(`No server at ${base}. Start one or pass --start.`)
    process.exit(2)
  }
  const env = { ...process.env }
  delete env.TURSO_DATABASE_URL
  delete env.TURSO_AUTH_TOKEN
  env.DATABASE_URL = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
  const proc = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: join(ROOT, appDir),
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  })
  servers.push(proc)
  const start = Date.now()
  while (Date.now() - start < 120_000) {
    if (await up(base)) return
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error(`Timed out waiting for ${base}`)
}

// ─── Page helpers ────────────────────────────────────────────────────────────

const onLogin = page => new URL(page.url()).pathname.startsWith('/login')

async function login(page, base, creds) {
  // Retry loop: on a cold dev server the first click can land before React
  // hydrates, causing a native GET form submission back to /login.
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    // A prior attempt may have set the session cookie already, in which case
    // /login redirects to the app — that's success, not a retry.
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    if (!onLogin(page)) return

    const email = page.locator('input[type="email"]')
    try {
      await email.waitFor({ state: 'visible', timeout: 90_000 })
    } catch {
      await page.screenshot({ path: join(SHOT_DIR, `login-fail-${attempt}.png`) }).catch(() => {})
      continue
    }
    await email.fill(creds.email)
    await page.locator('input[type="password"]').fill(creds.password)
    await page.locator('button[type="submit"]').first().click()
    try {
      await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 })
      return
    } catch {
      if (!onLogin(page)) return // navigated somewhere off /login → authed
    }
  }
  throw new Error(`login to ${base} failed after 4 attempts`)
}

async function clickChip(page, name) {
  const chip = page.getByRole('button', { name, exact: true }).first()
  await chip.waitFor({ state: 'visible', timeout: 30_000 })
  await chip.click()
}

async function readResults(page) {
  // Let useDeferredValue + rendering settle
  await page.waitForTimeout(1500)
  const cards = await page.locator('.grid > *:not(.col-span-full)').count()
  const divider = await page.getByText('Similar matches', { exact: true }).count()
  const bodyText = await page.locator('body').innerText()
  const header =
    bodyText.match(/(\d+)\s+results?\s+·\s+(\d+)\s+similar/) ??
    bodyText.match(/(\d+)\s+similar\s+results?/) ??
    bodyText.match(/(\d+)\s+results?/)
  return { cards, divider, header: header?.[0] ?? '(no header found)' }
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

async function run() {
  await ensureServer(SPONSOR_BASE, 'apps/sponsor', 3003)
  await ensureServer(MEETINGS_BASE, 'apps/meetings', 3002)

  // Pre-warm the dev-server compile cache so page interactions aren't racing
  // cold builds.
  await Promise.all(
    [`${SPONSOR_BASE}/login`, `${SPONSOR_BASE}/browse`, `${MEETINGS_BASE}/login`, `${MEETINGS_BASE}/browse`]
      .map(u => fetch(u, { redirect: 'manual' }).catch(() => {})),
  )

  const browser = await chromium
    .launch({ channel: 'chrome', headless: true })
    .catch(() => chromium.launch({ headless: true }))
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 } })
  const page = await ctx.newPage()

  // ── Sponsor portal: the exact combination from the bug report ──
  console.log('\n[Sponsor portal] Attendee + Strategy/Innovation + Skincare + SMB (reported combo)')
  await login(page, SPONSOR_BASE, SPONSOR_LOGIN)
  await page.goto(`${SPONSOR_BASE}/browse`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  await page.screenshot({ path: join(SHOT_DIR, 'sponsor-browse-landing.png') }).catch(() => {})
  await page.locator('.grid > *').first().waitFor({ timeout: 90_000 })
  await clickChip(page, 'ATTENDEE')
  await clickChip(page, 'Strategy/Innovation')
  await clickChip(page, 'Skincare')
  await clickChip(page, 'SMB (51-500)')
  let r = await readResults(page)
  console.log(`  header: "${r.header}", cards rendered: ${r.cards}, divider: ${r.divider > 0 ? 'shown' : 'absent'}`)
  check(`≥ ${MIN} cards rendered`, r.cards >= MIN, `got ${r.cards}`)
  check('no empty state', !(await page.getByText('No results match your filters.').count()))
  await page.screenshot({ path: join(SHOT_DIR, 'sponsor-reported-combo.png'), fullPage: false }).catch(() => {})

  // ── Sponsor portal: a long-form Solutions chip (previously 0 results) ──
  // Solutions chips live inside collapsible category accordions; expand the
  // one holding the target chip first.
  console.log('\n[Sponsor portal] + long-form Solutions chip (Site Search Solutions)')
  await page.getByRole('button').filter({ hasText: 'Web & Mobile' }).first().click()
  await clickChip(page, 'Site Search Solutions')
  r = await readResults(page)
  console.log(`  header: "${r.header}", cards rendered: ${r.cards}`)
  check(`≥ ${MIN} cards with solutions chip`, r.cards >= MIN, `got ${r.cards}`)

  // ── Meetings portal: Solution Providers tab ──
  console.log('\n[Meetings portal] Solution Providers: Startup + Under $1M')
  await login(page, MEETINGS_BASE, MEETINGS_LOGIN)
  await page.goto(`${MEETINGS_BASE}/browse`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.locator('.grid > *').first().waitFor({ timeout: 60_000 })
  await clickChip(page, 'Startup (1–50)')
  await clickChip(page, 'Under $1M')
  r = await readResults(page)
  console.log(`  header: "${r.header}", cards rendered: ${r.cards}, divider: ${r.divider > 0 ? 'shown' : 'absent'}`)
  check(`≥ ${MIN} sponsor cards`, r.cards >= MIN, `got ${r.cards}`)
  await page.screenshot({ path: join(SHOT_DIR, 'meetings-sponsors-combo.png'), fullPage: false }).catch(() => {})

  // ── Meetings portal: People tab, cross-dimension combo ──
  console.log('\n[Meetings portal] People: Skincare + Strategy/Innovation + SMB')
  await page.getByRole('button', { name: 'People', exact: true }).first().click()
  await page.waitForTimeout(800)
  await clickChip(page, 'Skincare')
  await clickChip(page, 'Strategy/Innovation')
  await clickChip(page, 'SMB (51–500)')
  r = await readResults(page)
  console.log(`  header: "${r.header}", cards rendered: ${r.cards}, divider: ${r.divider > 0 ? 'shown' : 'absent'}`)
  check(`≥ ${MIN} people cards`, r.cards >= MIN, `got ${r.cards}`)
  check('no empty state', !(await page.getByText('No results match your filters.').count()))
  await page.screenshot({ path: join(SHOT_DIR, 'meetings-people-combo.png'), fullPage: false }).catch(() => {})

  await browser.close()
}

try {
  await run()
} catch (err) {
  failures++
  console.error(`\nE2E error: ${err?.message ?? err}`)
} finally {
  for (const proc of servers) {
    try { process.kill(-proc.pid, 'SIGTERM') } catch {}
  }
}

console.log(failures === 0 ? '\nBROWSER E2E PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
