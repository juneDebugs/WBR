#!/usr/bin/env node
// E2E for the ADMIN Companies scheduler (apps/web /dashboard/meetings?tab=companies).
// Drives a real browser: login as WBR staff → company directory → open the
// (seeded-by-this-test) fixture company → split view → Assign sheet (pick slot
// + room, submit) → candidate lands under Scheduled + in the grid → Reschedule
// sheet → Cancel dialog with "Return to bank" → candidate back in Unscheduled.
// Screenshots at every stage. Fixtures (sponsor + attendee + APPROVED request,
// names prefixed 'E2E Sched') are created/removed via Prisma; the active
// conference's time blocks are used READ-ONLY, and any meeting created through
// the UI is removed via Prisma in cleanup.
//
//   node scripts/e2e-admin-scheduler.mjs           # server already running (repo-standard :3000)
//   node scripts/e2e-admin-scheduler.mjs --start   # boot next dev, then kill it
// Override the target with SMOKE_BASE_URL (e.g. http://localhost:3200) when :3000 is taken.

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

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const PORT = new URL(BASE).port || '3000'
const CREDS = { email: process.env.SMOKE_STAFF_EMAIL ?? 'wbr@test.com', password: process.env.SMOKE_STAFF_PASSWORD ?? 'password123' }
const SHOT_DIR = process.env.SHOT_DIR ?? join(ROOT, 'scripts', '.screenshots')
mkdirSync(SHOT_DIR, { recursive: true })

const COMPANY = 'E2E Sched Co'
const CANDIDATE = 'E2E Sched Candidate'
const PREFIX = 'adm-sched-e2e-'
const T = 30_000 // generous default timeout for every UI wait

let serverProc = null, failures = 0
const check = (name, cond, detail = '') => cond ? console.log(`  ✓ ${name}`) : (failures++, console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`))
const serverUp = async () => { try { return (await fetch(`${BASE}/login`, { redirect: 'manual' })).status < 500 } catch { return false } }
async function waitFor(cond, ms, label) { const s = Date.now(); while (Date.now() - s < ms) { if (await cond()) return; await new Promise(r => setTimeout(r, 1500)) } throw new Error(`Timed out waiting for ${label}`) }
const onLogin = page => new URL(page.url()).pathname.startsWith('/login')
const shot = (page, name) => page.screenshot({ path: join(SHOT_DIR, name), fullPage: true }).catch(() => {})

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

// In assign/reschedule sheets the pickers are "radio-like" rows; accept either
// button or radio semantics and click the first enabled match.
async function clickFirstEnabled(scope, nameRe, { not = null } = {}) {
  // The sheets fetch availability after opening (skeleton first), so wait for
  // a first match to hydrate before enumerating — count() alone would race it.
  await scope
    .getByRole('button', { name: nameRe })
    .first()
    .waitFor({ timeout: T })
    .catch(() => {})
  for (const role of ['button', 'radio']) {
    let loc = scope.getByRole(role, { name: nameRe })
    if (not) loc = loc.filter({ hasNotText: not })
    const n = await loc.count()
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i)
      if (await el.isEnabled().catch(() => false)) { await el.click(); return true }
    }
  }
  return false
}

const prisma = makePrisma()
const created = { userIds: [], sponsorIds: [] }
async function cleanup() {
  // UI-created meetings first (never leave a confirmed meeting behind), then
  // requests, then the fixture user + sponsor themselves.
  if (created.userIds.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => {})
    await prisma.meetingRequest.deleteMany({ where: { requesterId: { in: created.userIds } } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  }
  if (created.sponsorIds.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { sponsorId: { in: created.sponsorIds } } }).catch(() => {})
    await prisma.sponsor.deleteMany({ where: { id: { in: created.sponsorIds } } }).catch(() => {})
  }
  await prisma.$disconnect().catch(() => {})
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) { console.error(`No server at ${BASE}. Pass --start.`); process.exit(2) }
    console.log(`Starting admin dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], { cwd: join(ROOT, 'apps/web'), env: { ...process.env, NEXTAUTH_URL: BASE }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 180_000, 'admin dev server')
    console.log('Server is up.')
  }

  // Seed deterministic fixtures: a fresh company in the ACTIVE conference with
  // one APPROVED bank candidate. Active-conference time blocks are read-only.
  const stamp = Date.now()
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const blockCount = await prisma.timeBlock.count({ where: { conferenceId: confId } })
  check('active conference has ≥ 2 time blocks (read-only)', blockCount >= 2, `got ${blockCount}`)
  const sponsor = await prisma.sponsor.create({ data: { id: `${PREFIX}sponsor-${stamp}`, conferenceId: confId, name: COMPANY, tier: 'GOLD' } })
  created.sponsorIds.push(sponsor.id)
  const user = await prisma.user.create({ data: { id: `${PREFIX}user-${stamp}`, email: `${PREFIX}${stamp}@example.com`, name: CANDIDATE, role: 'ATTENDEE' } })
  created.userIds.push(user.id)
  await prisma.meetingRequest.create({ data: { id: `${PREFIX}req-${stamp}`, requesterId: user.id, targetSponsorId: sponsor.id, status: 'APPROVED' } })

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

  console.log('\n[company directory]')
  await page.goto(`${BASE}/dashboard/meetings?tab=companies`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  // Narrow with the spec'd search box when present, then open the fixture row.
  const search = page.getByPlaceholder('Search companies')
  if (await search.waitFor({ state: 'visible', timeout: T }).then(() => true).catch(() => false)) await search.fill('E2E Sched')
  const row = page.getByRole('link', { name: new RegExp(COMPANY) }).first()
  check('directory renders the fixture company row', await row.waitFor({ timeout: T }).then(() => true).catch(() => false))
  await shot(page, 'admin-sched-directory.png')
  await row.click()

  console.log('\n[company schedule — split view]')
  const sidebar = page.locator('[role="region"][aria-label="Meeting requests"]')
  const grid = page.locator('[role="region"][aria-label="Schedule grid"]')
  const sidebarUp = await sidebar.waitFor({ timeout: T }).then(() => true).catch(() => false)
  const dayTabs = page.locator('[role="tablist"] [role="tab"]')
  await dayTabs.first().waitFor({ timeout: T }).catch(() => {})
  check('split view renders (requests sidebar + day tablist)', sidebarUp && (await dayTabs.count()) > 0)
  const candidateCard = sidebar.getByText(CANDIDATE).first()
  check('fixture candidate listed under Unscheduled', await candidateCard.waitFor({ timeout: T }).then(() => true).catch(() => false))
  await shot(page, 'admin-sched-split.png')

  console.log('\n[assign sheet]')
  // The fixture company has exactly one bank candidate, so the sidebar's first
  // "Assign…" action belongs to it.
  await sidebar.getByRole('button', { name: /Assign/ }).first().click()
  const dialog = page.getByRole('dialog')
  check('assign sheet opens', await dialog.waitFor({ timeout: T }).then(() => true).catch(() => false))
  const pickedSlot = await clickFirstEnabled(dialog, /\d+\s*rooms?\s*free/i)
  check('sheet offers an available slot', pickedSlot)
  const pickedRoom = await clickFirstEnabled(dialog, /(Table \d+|Networking Lounge)/)
  check('sheet offers an available room', pickedRoom)
  await shot(page, 'admin-sched-assign-sheet.png')
  await dialog.getByRole('button', { name: 'Assign meeting' }).click({ timeout: T })
  check('assign submits and the sheet closes', await dialog.waitFor({ state: 'detached', timeout: T }).then(() => true).catch(() => false))

  console.log('\n[scheduled state]')
  // Scheduled group is collapsed by default — expand it. (/^Scheduled/ cannot
  // match the "Unscheduled" disclosure.)
  await sidebar.getByRole('button', { name: /^Scheduled/ }).first().click().catch(() => {})
  check('candidate appears under Scheduled', await sidebar.getByText(CANDIDATE).first().waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('candidate appears in the schedule grid', await grid.getByText(CANDIDATE).first().waitFor({ timeout: T }).then(() => true).catch(() => false), 'not on the active day tab')
  await shot(page, 'admin-sched-assigned.png')

  console.log('\n[reschedule sheet]')
  // Grid rows expose spec'd aria-labels; fall back to the sidebar quick action.
  let editBtn = page.getByRole('button', { name: `Reschedule meeting with ${CANDIDATE}` }).first()
  if (!(await editBtn.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false))) editBtn = sidebar.getByRole('button', { name: /^Edit/ }).first()
  await editBtn.click()
  const resched = page.getByRole('dialog')
  check('reschedule sheet opens', await resched.waitFor({ timeout: T }).then(() => true).catch(() => false))
  await shot(page, 'admin-sched-reschedule-sheet.png')
  // Pick a slot that is not the current one, then a room, then submit.
  const movedSlot = await clickFirstEnabled(resched, /\d+\s*rooms?\s*free/i, { not: /Current/ })
  check('reschedule sheet offers a different slot', movedSlot)
  await clickFirstEnabled(resched, /(Table \d+|Networking Lounge)/)
  await resched.getByRole('button', { name: 'Move meeting' }).click({ timeout: T })
  check('reschedule submits and the sheet closes', await resched.waitFor({ state: 'detached', timeout: T }).then(() => true).catch(() => false))

  console.log('\n[cancel dialog — return to bank]')
  let cancelBtn = page.getByRole('button', { name: `Cancel meeting with ${CANDIDATE}` }).first()
  if (!(await cancelBtn.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false))) cancelBtn = sidebar.getByRole('button', { name: /^Cancel/ }).first()
  await cancelBtn.click()
  const alert = page.getByRole('alertdialog')
  check('cancel alertdialog opens', await alert.waitFor({ timeout: T }).then(() => true).catch(() => false))
  // Keep the default "Return to bank" segment; a reason is required.
  await alert.locator('select').first().selectOption({ label: 'Scheduling conflict' })
    .catch(() => alert.locator('select').first().selectOption({ index: 1 }).catch(() => {}))
  await shot(page, 'admin-sched-cancel-dialog.png')
  // .last(): the segmented toggle's "Return to bank" item precedes the footer
  // submit in the DOM and Playwright name-matching is case-insensitive.
  await alert.getByRole('button', { name: 'Return to Bank' }).last().click({ timeout: T })
  await alert.waitFor({ state: 'detached', timeout: T }).catch(() => {})
  const backInBank = await sidebar.getByRole('button', { name: /Assign/ }).first().waitFor({ timeout: T }).then(() => true).catch(() => false)
  check('candidate returns to Unscheduled with an Assign action', backInBank && (await sidebar.getByText(CANDIDATE).count()) > 0)
  await shot(page, 'admin-sched-final.png')

  check('no app console errors during the flow', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
  await browser.close()
  console.log(`  screenshots → ${SHOT_DIR}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ all admin-scheduler e2e checks passed' : `❌ ${failures} check(s) failed`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
