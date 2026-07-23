#!/usr/bin/env node
// E2E for the STAFF meeting-engine console (apps/meetings /staff).
// Drives a real browser: login as WBR staff → company directory → open a
// company that has a (seeded-by-this-test) bank candidate → assert the split
// view (Unscheduled Bank + day segmented control + slot grid) → open + dismiss
// the Assign sheet → screenshots. Fixtures are created/removed via Prisma.
//
//   node scripts/e2e-meeting-engine.mjs           # server already on :3002
//   node scripts/e2e-meeting-engine.mjs --start   # boot next dev, then kill it

import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
const dbRequire = createRequire(join(ROOT, 'packages/db/package.json'))
let chromium
try { ({ chromium } = require(join(ROOT, 'node_modules/playwright/index.js'))) }
catch { ({ chromium } = require('playwright')) }

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3002'
const PORT = new URL(BASE).port || '3002'
const CREDS = { email: process.env.SMOKE_STAFF_EMAIL ?? 'wbr@test.com', password: process.env.SMOKE_STAFF_PASSWORD ?? 'password123' }
const SHOT_DIR = process.env.SHOT_DIR ?? join(ROOT, 'scripts', '.screenshots')
mkdirSync(SHOT_DIR, { recursive: true })

let serverProc = null, failures = 0
const check = (name, cond, detail = '') => cond ? console.log(`  ✓ ${name}`) : (failures++, console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`))
const serverUp = async () => { try { return (await fetch(`${BASE}/login`, { redirect: 'manual' })).status < 500 } catch { return false } }
async function waitFor(cond, ms, label) { const s = Date.now(); while (Date.now() - s < ms) { if (await cond()) return; await new Promise(r => setTimeout(r, 1500)) } throw new Error(`Timed out waiting for ${label}`) }
const onLogin = page => new URL(page.url()).pathname.startsWith('/login')

function readEnvLocal(app) { const env = {}; try { for (const l of readFileSync(join(ROOT, 'apps', app, '.env.local'), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {} return env }
function makePrisma() {
  const env = { ...readEnvLocal('web'), ...readEnvLocal('meetings') }
  const { PrismaClient } = dbRequire('@prisma/client')
  const url = process.env.TURSO_DATABASE_URL ?? env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? env.TURSO_AUTH_TOKEN
  if (url && token && url.startsWith('libsql://')) {
    const { PrismaLibSQL } = dbRequire('@prisma/adapter-libsql')
    const { createClient } = dbRequire('@libsql/client')
    return new PrismaClient({ adapter: new PrismaLibSQL(createClient({ url, authToken: token })) })
  }
  process.env.DATABASE_URL = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
  return new PrismaClient()
}

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

const prisma = makePrisma()
const created = { userIds: [] }
async function cleanup() {
  if (created.userIds.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => {})
    await prisma.meetingRequest.deleteMany({ where: { requesterId: { in: created.userIds } } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  }
  await prisma.$disconnect().catch(() => {})
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) { console.error(`No server at ${BASE}. Pass --start.`); process.exit(2) }
    console.log(`Starting meetings dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], { cwd: join(ROOT, 'apps/meetings'), env: { ...process.env, NEXTAUTH_URL: BASE }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 180_000, 'meetings dev server')
    console.log('Server is up.')
  }

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  // Ignore next-auth's session-polling fetch noise (framework artifact, app-wide).
  const appErrors = []
  page.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (t.includes('/api/auth/session') || t.includes('CLIENT_FETCH_ERROR') || t.includes('Failed to load resource')) return
    appErrors.push(t)
  })

  console.log('\nLogging in as WBR staff')
  await login(page, CREDS)

  // Seed a guaranteed bank candidate for the first company.
  const companies = await page.evaluate(async () => (await fetch('/api/staff/companies')).json())
  const target = companies.companies?.[0]
  check('directory API returns companies', !!target)
  if (target) {
    const u = await prisma.user.create({ data: { email: `e2e-engine-${Date.now()}@example.com`, name: 'E2E Bank Candidate', role: 'ATTENDEE' } })
    created.userIds.push(u.id)
    await prisma.meetingRequest.create({ data: { requesterId: u.id, targetSponsorId: target.id, status: 'APPROVED' } })
  }

  console.log('\n[company directory — eTail]')
  await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  check('workflow stepper "Manage Meetings" renders', await page.getByText('Manage Meetings').first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false))
  check('eTail nav shows "Companies"', (await page.getByText('Companies', { exact: false }).count()) > 0)
  check('"Number of Companies" counter renders', await page.getByText(/Number of Companies/).waitFor({ timeout: 30_000 }).then(() => true).catch(() => false))
  // Wait for the async company fetch to render the data grid before asserting columns.
  await page.getByText('Company Name', { exact: true }).first().waitFor({ timeout: 30_000 }).catch(() => {})
  check('table has "Company Name" column header', (await page.getByText('Company Name', { exact: true }).count()) > 0)
  check('table has "Total Confirmed Meetings" column', (await page.getByText('Total Confirmed Meetings').count()) > 0)
  check('rows show a green "login" button', (await page.getByText('login', { exact: true }).count()) > 0)
  await page.screenshot({ path: join(SHOT_DIR, 'engine-directory.png'), fullPage: true }).catch(() => {})

  console.log('\n[schedule screen — eTail]')
  const companyLink = target ? page.getByRole('button', { name: target.name }).first() : page.locator('td button').first()
  await companyLink.click()
  check('"Switch company" bar renders', await page.getByText('Switch company:').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false))
  check('sub-tabs incl. "Meeting Times"', (await page.getByRole('button', { name: 'Meeting Times' }).count()) > 0)
  check('"Unscheduled" sidebar section renders', (await page.getByText('Unscheduled', { exact: false }).count()) > 0)
  const dayTabs = page.locator('[role="tablist"][aria-label="Conference day"] [role="tab"]')
  await dayTabs.first().waitFor({ timeout: 20_000 }).catch(() => {})
  check('day tabs render', (await dayTabs.count()) > 0)
  check('grid has "Meet As" column', (await page.getByText('Meet As').count()) > 0)
  check('grid has "Meeting With" column', (await page.getByText('Meeting With').count()) > 0)
  if (await dayTabs.count() > 1) {
    await dayTabs.first().focus()
    await page.keyboard.press('ArrowRight')
    check('ArrowRight moves the active day tab', (await dayTabs.nth(1).getAttribute('aria-selected')) === 'true')
  }
  await page.screenshot({ path: join(SHOT_DIR, 'engine-schedule.png'), fullPage: true }).catch(() => {})

  console.log('\n[assign location modal — eTail]')
  // Select the seeded Unscheduled candidate, then click a "Schedule at…" link.
  const candidate = page.getByRole('button', { name: /E2E Bank Candidate/ }).first()
  const hasCandidate = await candidate.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false)
  check('seeded candidate appears in Unscheduled', hasCandidate)
  if (hasCandidate) {
    await candidate.click()
    const scheduleLink = page.getByRole('button', { name: 'Schedule at…' }).first()
    await scheduleLink.waitFor({ timeout: 10_000 }).catch(() => {})
    await scheduleLink.click()
    const modal = page.getByRole('dialog')
    const shown = await modal.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false)
    check('Assign Meeting Location modal opens', shown && (await page.getByText('Assign Meeting Location').count()) > 0)
    if (shown) {
      check('modal shows the asterisk/bracket legend', (await page.getByText(/Asterisk .* indicates location/).count()) > 0)
      await page.screenshot({ path: join(SHOT_DIR, 'engine-assign-location.png') }).catch(() => {})
      await page.keyboard.press('Escape')
      check('Escape dismisses the modal', await modal.waitFor({ state: 'detached', timeout: 8_000 }).then(() => true).catch(() => false))
    }
  }

  check('no app console errors during the flow', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
  await browser.close()
  console.log(`  screenshots → ${SHOT_DIR}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ all meeting-engine e2e checks passed' : `❌ ${failures} check(s) failed`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
