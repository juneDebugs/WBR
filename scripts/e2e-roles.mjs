#!/usr/bin/env node
// Browser E2E for the Staff page changes:
//   Goal 1 — the Members role dropdown offers ONLY Staff & Organizer.
//   Goal 2 — the Roles & Permissions tab: two role columns, 14 permission
//            rows, a locked Organizer→Staff switch, and an explicit-save
//            SaveBar that appears on edit and clears on Discard.
//
// Drives real Chromium: logs in, exercises the flow, asserts the DOM, and
// writes screenshots to SHOT_DIR for a human/design review.
//
//   SMOKE_BASE_URL=http://localhost:3123 node scripts/e2e-roles.mjs           # server already up
//   SMOKE_BASE_URL=http://localhost:3123 node scripts/e2e-roles.mjs --start   # boot next dev, then kill
//
// Env: SMOKE_BASE_URL, SMOKE_EMAIL (organizer), SMOKE_PASSWORD, SHOT_DIR.

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
let chromium
try { ({ chromium } = require(join(ROOT, 'node_modules/playwright/index.js'))) }
catch { ({ chromium } = require('playwright')) }

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3123'
const PORT = new URL(BASE).port || '3123'
const CREDS = { email: process.env.SMOKE_EMAIL ?? 'wbr@test.com', password: process.env.SMOKE_PASSWORD ?? 'password123' }
const STAFF_CREDS = { email: process.env.SMOKE_STAFF_EMAIL ?? 'stephcurry@test.com', password: process.env.SMOKE_STAFF_PASSWORD ?? 'password123' }
const SHOT_DIR = process.env.SHOT_DIR ?? '/tmp'

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
    console.log(`Starting web dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps/web'), env: { ...process.env, NEXTAUTH_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'web dev server')
    console.log('Server is up.')
  }

  const browser = await chromium.launch()
  const orgCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await orgCtx.newPage()

  console.log(`\nLogging in as organizer ${CREDS.email}`)
  await login(page, CREDS)
  await page.goto(`${BASE}/dashboard/staff`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})

  // ── Goal 1: Members role dropdown has only Staff & Organizer ──
  console.log('\n[Goal 1 — Members role options]')
  const roleSelect = page.locator('select[aria-label^="Role for"]').first()
  const hasRows = (await roleSelect.count()) > 0
  if (hasRows) {
    const opts = await roleSelect.locator('option:not([disabled])').allInnerTexts()
    check('dropdown offers exactly Staff & Organizer',
      opts.length === 2 && opts.includes('Staff') && opts.includes('Organizer'),
      `got ${JSON.stringify(opts)}`)
    check('dropdown has no Attendee/Speaker', !opts.includes('Attendee') && !opts.includes('Speaker'))
  } else {
    console.log('  ⃠ no staff rows to inspect (empty directory) — skipping option check')
  }
  await page.screenshot({ path: join(SHOT_DIR, 'staff-members.png'), fullPage: true }).catch(() => {})

  // ── Goal 2: Roles & Permissions tab ──
  console.log('\n[Goal 2 — Roles & Permissions tab]')
  await page.getByRole('tab', { name: 'Roles & Permissions' }).click()
  await page.getByRole('heading', { name: 'Dashboard access' }).waitFor({ timeout: 30_000 })

  const switches = page.getByRole('switch')
  const switchCount = await switches.count()
  check('28 switches (14 destinations × 2 roles)', switchCount === 28, `got ${switchCount}`)

  const lockedCount = await page.locator('[role="switch"][aria-disabled="true"]').count()
  check('exactly 1 locked switch (Organizer → Staff)', lockedCount === 1, `got ${lockedCount}`)

  check('both role columns present',
    (await page.getByRole('columnheader', { name: 'Staff' }).count()) > 0 &&
    (await page.getByRole('columnheader', { name: 'Organizer' }).count()) > 0)

  check('SaveBar hidden before any edit',
    (await page.getByText('Unsaved changes').count()) === 0)
  await page.screenshot({ path: join(SHOT_DIR, 'staff-roles.png'), fullPage: true }).catch(() => {})

  // ── Edit → SaveBar appears → Discard clears it ──
  console.log('\n[Goal 2 — dirty/save/discard]')
  const staffExport = page.getByRole('switch', { name: /Export.*Staff/ }).first()
  await staffExport.click()
  const barShown = await page.getByText('Unsaved changes').waitFor({ timeout: 10_000 }).then(() => true).catch(() => false)
  check('editing a switch reveals the SaveBar', barShown)
  check('Save changes button present', (await page.getByRole('button', { name: 'Save changes' }).count()) > 0)
  await page.screenshot({ path: join(SHOT_DIR, 'staff-roles-dirty.png'), fullPage: true }).catch(() => {})

  await page.getByRole('button', { name: 'Discard' }).click()
  const barGone = await page.getByText('Unsaved changes').waitFor({ state: 'detached', timeout: 10_000 }).then(() => true).catch(() => false)
  check('Discard clears the SaveBar', barGone)

  // ── Staff user: read-only + enforcement (fresh context = fresh cookies) ──
  console.log(`\n[Staff user — read-only & enforcement]`)
  const staffCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const sp = await staffCtx.newPage()
  await login(sp, STAFF_CREDS)
  await sp.goto(`${BASE}/dashboard/staff`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await sp.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})

  // Sidebar enforcement: Administration destinations hidden for the default Staff role.
  const navLinks = await sp.locator('nav a').allInnerTexts()
  check('sidebar hides Administration items for Staff',
    !navLinks.includes('Integrations') && !navLinks.includes('App Settings') &&
    !navLinks.includes('Access') && !navLinks.includes('Export'),
    `nav = ${JSON.stringify(navLinks)}`)
  check('sidebar still shows allowed items (Attendees, Chat)',
    navLinks.includes('Attendees') && navLinks.includes('Chat'))

  await sp.getByRole('tab', { name: 'Roles & Permissions' }).click()
  await sp.getByRole('heading', { name: 'Dashboard access' }).waitFor({ timeout: 30_000 })
  check('read-only banner shown for Staff',
    (await sp.getByText('read-only mode', { exact: false }).count()) > 0)
  check('no editable description textareas for Staff',
    (await sp.locator('textarea').count()) === 0)
  check('no Save changes control for Staff',
    (await sp.getByRole('button', { name: 'Save changes' }).count()) === 0)
  await sp.screenshot({ path: join(SHOT_DIR, 'staff-roles-readonly.png'), fullPage: true }).catch(() => {})

  // Page guard: a Staff role without `export` gets the restricted screen.
  await sp.goto(`${BASE}/dashboard/export`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  check('Staff hitting /dashboard/export sees Access restricted',
    (await sp.getByText('Access restricted').count()) > 0)

  // Security boundary: Staff PUT /api/roles must be forbidden.
  const putStatus = await sp.evaluate(async () => {
    const r = await fetch('/api/roles', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'STAFF', description: 'hacked', permissions: [] }),
    })
    return r.status
  })
  check('Staff PUT /api/roles → 403', putStatus === 403, `got ${putStatus}`)

  // API-bypass boundary: a hidden page's API must also reject the Staff role,
  // not just the page. Default Staff excludes the Administration section, so its
  // data/config APIs must 403; an allowed API (attendees) must still 200.
  const api = await sp.evaluate(async () => {
    const status = async (url, init) => (await fetch(url, init)).status
    return {
      export: await status('/api/export?type=attendees'),
      access: await status('/api/data/access?page=0'),
      integrations: await status('/api/integrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'SLACK', status: 'CONNECTED' }),
      }),
      attendees: await status('/api/data/attendees?page=0'),
    }
  })
  check('Staff GET /api/export (PII) → 403 (was the bypass)', api.export === 403, `got ${api.export}`)
  check('Staff GET /api/data/access (user directory) → 403', api.access === 403, `got ${api.access}`)
  check('Staff POST /api/integrations → 403', api.integrations === 403, `got ${api.integrations}`)
  check('Staff GET /api/data/attendees → 200 (allowed by default, not over-blocked)',
    api.attendees === 200, `got ${api.attendees}`)

  await browser.close()
  console.log(`\n${failures === 0 ? '✅ all E2E checks passed' : `❌ ${failures} check(s) failed`}`)
  console.log(`Screenshots in ${SHOT_DIR}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(() => { if (serverProc) { try { process.kill(-serverProc.pid) } catch {} } process.exit(failures === 0 ? 0 : 1) })
