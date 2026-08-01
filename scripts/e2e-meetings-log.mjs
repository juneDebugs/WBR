#!/usr/bin/env node
// E2E for the admin Meetings → Log tab (apps/web /dashboard/meetings?tab=log).
// Drives a real browser: login as WBR staff → open the Log tab → assert the
// HIG surface renders (heading, search field, segmented kind filter), then
// exercise the segmented control + search box and confirm the feed reacts.
// Screenshots at each stage into scripts/.screenshots. Read-only — no fixtures,
// no DB writes; it observes whatever notes the active conference already holds.
//
//   node scripts/e2e-meetings-log.mjs           # server already running (:3000)
//   node scripts/e2e-meetings-log.mjs --start   # boot next dev, then kill it
// Override the target with SMOKE_BASE_URL (e.g. http://localhost:3200).

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
let chromium
try { ({ chromium } = require(join(ROOT, 'node_modules/playwright/index.js'))) }
catch { ({ chromium } = require('playwright')) }

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const PORT = new URL(BASE).port || '3000'
const CREDS = { email: process.env.SMOKE_STAFF_EMAIL ?? 'wbr@test.com', password: process.env.SMOKE_STAFF_PASSWORD ?? 'password123' }
const SHOT_DIR = process.env.SHOT_DIR ?? join(ROOT, 'scripts', '.screenshots')
mkdirSync(SHOT_DIR, { recursive: true })
const T = 30_000

let serverProc = null, failures = 0
const check = (name, cond, detail = '') => cond ? console.log(`  ✓ ${name}`) : (failures++, console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`))
const serverUp = async () => { try { return (await fetch(`${BASE}/login`, { redirect: 'manual' })).status < 500 } catch { return false } }
async function waitFor(cond, ms, label) { const s = Date.now(); while (Date.now() - s < ms) { if (await cond()) return; await new Promise(r => setTimeout(r, 1500)) } throw new Error(`Timed out waiting for ${label}`) }
const onLogin = page => new URL(page.url()).pathname.startsWith('/login')
const shot = (page, name) => page.screenshot({ path: join(SHOT_DIR, name), fullPage: true }).catch(() => {})

async function login(page, creds) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: T }).catch(() => {})
    if (!onLogin(page)) return
    const email = page.locator('input[type="email"]')
    await email.waitFor({ state: 'visible', timeout: 90_000 })
    await email.fill(creds.email)
    await page.locator('input[type="password"]').fill(creds.password)
    await page.locator('button[type="submit"]').first().click()
    try { await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 }); return }
    catch { if (!onLogin(page)) return }
  }
  throw new Error('login failed after 3 attempts')
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) { console.error(`No server at ${BASE}. Start one (cd apps/web && npx next dev -p ${PORT}) or pass --start.`); process.exit(2) }
    console.log(`Starting admin dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], { cwd: join(ROOT, 'apps/web'), env: { ...process.env, NEXTAUTH_URL: BASE }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 180_000, 'admin dev server')
    console.log('Server is up.')
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    console.log('\n[login]')
    await login(page, CREDS)
    check('logged in (left /login)', !onLogin(page))

    console.log('\n[open Log tab]')
    await page.goto(`${BASE}/dashboard/meetings?tab=log`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: T }).catch(() => {})

    // The Log tab in the pill nav is current.
    const logTab = page.getByRole('link', { name: 'Log' })
    await logTab.first().waitFor({ timeout: T }).catch(() => {})
    check('Log tab is present in the meetings nav', await logTab.count() > 0)

    // The feed hydrates client-side; wait for the intro heading.
    const heading = page.getByRole('heading', { name: 'Activity Log' })
    await heading.waitFor({ timeout: T }).catch(() => {})
    check('Activity Log heading rendered', await heading.count() > 0)

    const search = page.getByPlaceholder('Search notes, people, companies…')
    check('search field rendered', await search.count() > 0)

    const segmented = page.getByRole('tablist', { name: /Filter by note type/i })
    check('segmented kind filter rendered', await segmented.count() > 0)
    const allTab = page.getByRole('tab', { name: /^All/ })
    check('"All" segment present', await allTab.count() > 0)
    await shot(page, 'meetings-log-01-loaded.png')

    // Either notes render as cards, or the empty state shows — both are valid.
    const cards = page.locator('article.card')
    const cardCount = await cards.count()
    const emptyState = page.locator('.empty-state')
    check('feed shows note cards or a valid empty state',
      cardCount > 0 || (await emptyState.count()) > 0, `cards=${cardCount}`)
    console.log(`  (feed rendered ${cardCount} note card(s))`)

    console.log('\n[interactions]')
    // Click the Cancellations segment; the control should mark it selected.
    const cancelSeg = page.getByRole('tab', { name: /^Cancelled/ })
    if (await cancelSeg.count() > 0) {
      await cancelSeg.click()
      await page.waitForTimeout(300)
      check('segmented control selects Cancelled', await cancelSeg.getAttribute('aria-selected') === 'true')
      await shot(page, 'meetings-log-02-filtered.png')
      // Back to All so the search test sees the full set.
      await allTab.click()
      await page.waitForTimeout(200)
    }

    // Typing a nonsense query must not crash the feed (empty state acceptable).
    await search.fill('zzz-no-such-note-xyz')
    await page.waitForTimeout(400)
    const stillAlive = (await page.getByRole('heading', { name: 'Activity Log' }).count()) > 0
    check('search input filters without crashing the feed', stillAlive)
    await shot(page, 'meetings-log-03-search.png')
    await search.fill('')
    await page.waitForTimeout(200)
  } catch (e) {
    failures++; console.error('  ✗ unexpected error:', e?.message ?? e)
    await shot(page, 'meetings-log-error.png')
  } finally {
    await browser.close()
  }
}

try {
  await main()
} finally {
  if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
}

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
