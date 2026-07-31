#!/usr/bin/env node
// E2E for the ADMIN Meeting Tables section (apps/web /dashboard/meetings
// ?tab=companies&view=settings). Drives a real browser: login as WBR staff →
// Meetings → Settings → verify the Meeting Requirements panel is still intact
// above the new section → add a table → rename + resize it → assign the
// fixture meeting to it from the Assignments board (persists to DB) → verify
// the remove guard while assigned → unassign → remove the table. Screenshots
// at every stage. Fixtures (sponsor + attendee + CONFIRMED SponsorMeeting in
// the active conference's first time block, names prefixed 'E2E Tables') are
// created/removed via Prisma; the QA inventory row is deleted on cleanup, so
// live data is left exactly as found.
//
//   node scripts/e2e-meeting-tables.mjs           # server already running (repo-standard :3000)
//   node scripts/e2e-meeting-tables.mjs --start   # boot next dev, then kill it
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

const COMPANY = 'E2E Tables Co'
const BUYER = 'E2E Tables Buyer'
const PREFIX = 'tbl-e2e-'
const QA_TABLE = 'E2E QA Table'
const QA_RENAMED = 'E2E QA Corner'
const T = 30_000

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

// Poll the DB until the fixture meeting's location satisfies pred (assign
// mutations refetch the board, so the select can update before the DB read).
async function locationEventually(prisma, id, pred, label) {
  try {
    await waitFor(async () => {
      const m = await prisma.sponsorMeeting.findUnique({ where: { id }, select: { location: true } })
      return m && pred(m.location)
    }, T, label)
    return true
  } catch { return false }
}

const prisma = makePrisma()
const created = { userIds: [], sponsorIds: [] }
async function cleanup() {
  if (created.userIds.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  }
  if (created.sponsorIds.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { sponsorId: { in: created.sponsorIds } } }).catch(() => {})
    await prisma.sponsor.deleteMany({ where: { id: { in: created.sponsorIds } } }).catch(() => {})
  }
  // The QA inventory rows must never outlive the run.
  await prisma.$executeRawUnsafe(`DELETE FROM "MeetingTableSetting" WHERE "name" IN ('${QA_TABLE}', '${QA_RENAMED}')`).catch(() => {})
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

  // Fixtures: a fresh company + attendee with one CONFIRMED, UNASSIGNED
  // meeting in the active conference's first time block (blocks read-only).
  const stamp = Date.now()
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const block = await prisma.timeBlock.findFirst({ where: { conferenceId: confId }, orderBy: { startsAt: 'asc' }, select: { id: true } })
  check('active conference has a time block (read-only)', !!block)
  if (!block) throw new Error('no time blocks to pin the fixture meeting to')
  const sponsor = await prisma.sponsor.create({ data: { id: `${PREFIX}sponsor-${stamp}`, conferenceId: confId, name: COMPANY, tier: 'GOLD' } })
  created.sponsorIds.push(sponsor.id)
  const user = await prisma.user.create({ data: { id: `${PREFIX}user-${stamp}`, email: `${PREFIX}${stamp}@example.com`, name: BUYER, role: 'ATTENDEE', company: 'E2E Buyer Corp' } })
  created.userIds.push(user.id)
  const meeting = await prisma.sponsorMeeting.create({
    data: { id: `${PREFIX}mtg-${stamp}`, sponsorId: sponsor.id, userId: user.id, timeBlockId: block.id, status: 'CONFIRMED', location: null },
  })
  console.log(`fixture meeting ${meeting.id} in block ${block.id}`)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const appErrors = []
  page.on('console', m => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (t.includes('/api/auth/session') || t.includes('CLIENT_FETCH_ERROR') || t.includes('Failed to load resource')) return
    appErrors.push(t)
  })

  console.log('\nLogging in as WBR staff')
  await login(page, CREDS)

  console.log('\n[settings page]')
  await page.goto(`${BASE}/dashboard/meetings?tab=companies&view=settings`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  check('Meeting Requirements panel still renders (nothing removed)',
    await page.getByRole('heading', { name: 'Meeting Requirements' }).waitFor({ timeout: T }).then(() => true).catch(() => false))
  const tablesHeading = page.getByRole('heading', { name: 'Meeting Tables' })
  check('Meeting Tables section renders below it',
    await tablesHeading.waitFor({ timeout: T }).then(() => true).catch(() => false))
  const reqBox = await page.getByRole('heading', { name: 'Meeting Requirements' }).boundingBox().catch(() => null)
  const tblBox = await tablesHeading.boundingBox().catch(() => null)
  check('Meeting Tables sits below Meeting Requirements', !!reqBox && !!tblBox && reqBox.y < tblBox.y)
  const inventory = page.locator('section', { has: page.getByRole('heading', { name: 'Tables', exact: true }) })
  check('inventory card lists at least one table', await inventory.locator('li').first().waitFor({ timeout: T }).then(() => true).catch(() => false))
  await shot(page, 'meeting-tables-settings.png')

  console.log('\n[add a table]')
  await page.locator('input[aria-label="New table name"]').fill(QA_TABLE)
  await page.getByRole('button', { name: 'Add table' }).click()
  const qaRow = inventory.locator('li', { hasText: QA_TABLE })
  check('new table row appears', await qaRow.waitFor({ timeout: T }).then(() => true).catch(() => false))
  const dbAdd = await waitFor(async () => {
    const rows = await prisma.$queryRawUnsafe(`SELECT "name" FROM "MeetingTableSetting" WHERE "name" = '${QA_TABLE}'`)
    return rows.length === 1
  }, T, 'inventory row in DB').then(() => true).catch(() => false)
  check('inventory row persisted to DB', dbAdd)
  await shot(page, 'meeting-tables-added.png')

  console.log('\n[rename + resize]')
  await qaRow.getByRole('button', { name: 'Edit' }).click()
  const nameInput = page.locator(`input[aria-label="New name for ${QA_TABLE}"]`)
  await nameInput.waitFor({ timeout: T })
  await nameInput.fill(QA_RENAMED)
  await page.locator(`input[aria-label="Seats at ${QA_TABLE}"]`).fill('2')
  await inventory.getByRole('button', { name: 'Save', exact: true }).click()
  const renamedRow = inventory.locator('li', { hasText: QA_RENAMED })
  check('renamed row appears', await renamedRow.waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('capacity badge shows 2 seats', await renamedRow.getByText('2 seats').waitFor({ timeout: T }).then(() => true).catch(() => false))
  const dbRename = await waitFor(async () => {
    const rows = await prisma.$queryRawUnsafe(`SELECT "capacity" FROM "MeetingTableSetting" WHERE "name" = '${QA_RENAMED}'`)
    return rows.length === 1 && Number(rows[0].capacity) === 2
  }, T, 'renamed row in DB').then(() => true).catch(() => false)
  check('rename + capacity persisted to DB', dbRename)

  console.log('\n[assign from the board]')
  // The fixture sits in the conference's first block — walk day tabs until its
  // row is on screen (the default tab is the first day, which may differ).
  const meetingSelect = page.locator(`select[aria-label="Table for ${COMPANY} meeting ${BUYER}"]`)
  let found = await meetingSelect.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
  if (!found) {
    const dayTabs = page.locator('[role="tablist"][aria-label="Days"] [role="tab"]')
    const n = await dayTabs.count()
    for (let i = 0; i < n && !found; i++) {
      await dayTabs.nth(i).click()
      found = await meetingSelect.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
    }
  }
  check('fixture meeting row is on the board', found)
  check('fixture starts unassigned', found && (await meetingSelect.inputValue().catch(() => '?')) === '')
  await meetingSelect.selectOption(QA_RENAMED)
  check('DB shows the meeting at the new table',
    await locationEventually(prisma, meeting.id, loc => loc === QA_RENAMED, 'assignment to persist'))
  check('select settles on the new table', await waitFor(async () =>
    (await meetingSelect.inputValue().catch(() => '?')) === QA_RENAMED, T, 'select value').then(() => true).catch(() => false))
  await shot(page, 'meeting-tables-assigned.png')

  console.log('\n[remove guard while assigned]')
  const removeBtn = renamedRow.getByRole('button', { name: 'Remove', exact: true })
  check('table with a meeting shows 1 meeting', await renamedRow.getByText('1 meeting', { exact: true }).waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('Remove is disabled while assigned', await removeBtn.isDisabled().catch(() => false))

  console.log('\n[unassign + remove]')
  await meetingSelect.selectOption('')
  check('DB shows the meeting unassigned again',
    await locationEventually(prisma, meeting.id, loc => loc === null, 'unassignment to persist'))
  await waitFor(async () => !(await removeBtn.isDisabled().catch(() => true)), T, 'Remove to enable').catch(() => {})
  check('Remove enables once unassigned', !(await removeBtn.isDisabled().catch(() => true)))
  await removeBtn.click()
  await renamedRow.getByRole('button', { name: 'Confirm remove' }).click()
  check('row disappears', await renamedRow.waitFor({ state: 'detached', timeout: T }).then(() => true).catch(() => false))
  const dbGone = await waitFor(async () => {
    const rows = await prisma.$queryRawUnsafe(`SELECT 1 AS x FROM "MeetingTableSetting" WHERE "name" IN ('${QA_TABLE}', '${QA_RENAMED}')`)
    return rows.length === 0
  }, T, 'inventory rows deleted').then(() => true).catch(() => false)
  check('inventory row deleted from DB', dbGone)
  await shot(page, 'meeting-tables-removed.png')

  check('no unexpected console errors', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))

  await browser.close()
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ e2e meeting-tables passed' : `❌ ${failures} check(s) failed`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
