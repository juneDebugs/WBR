#!/usr/bin/env node
// E2E for the ADMIN on-site Check-In page (apps/web /dashboard/meetings/check-in).
// Drives a real browser: login as WBR staff → Check-In tab → find the fixture
// meeting's day → tick Sponsor arrived (persists to DB) → tick Buyer arrived
// (row flips to ✓ Completed) → type a floor note (persists) → untick Sponsor
// (timestamp cleared). Screenshots at every stage. Fixtures (sponsor + attendee
// + CONFIRMED SponsorMeeting in the active conference's first time block,
// names prefixed 'E2E CheckIn') are created/removed via Prisma; active
// conference time blocks are used READ-ONLY.
//
//   node scripts/e2e-checkin.mjs           # server already running (repo-standard :3000)
//   node scripts/e2e-checkin.mjs --start   # boot next dev, then kill it
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

const COMPANY = 'E2E CheckIn Co'
const BUYER = 'E2E CheckIn Buyer'
const PREFIX = 'chk-e2e-'
const NOTE = 'Buyer met sponsor early at 10 AM'
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

// Poll the DB until the fixture meeting satisfies pred (mutations are async
// behind an optimistic UI, so the checkbox flips before the PATCH lands).
async function meetingEventually(prisma, id, pred, label) {
  try {
    await waitFor(async () => {
      const m = await prisma.sponsorMeeting.findUnique({
        where: { id }, select: { sponsorArrivedAt: true, buyerArrivedAt: true, notes: true },
      })
      return m && pred(m)
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

  // Fixtures: a fresh company + attendee with one CONFIRMED meeting in the
  // active conference's first time block (blocks are read-only).
  const stamp = Date.now()
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const block = await prisma.timeBlock.findFirst({ where: { conferenceId: confId }, orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true } })
  check('active conference has a time block (read-only)', !!block)
  if (!block) throw new Error('no time blocks to pin the fixture meeting to')
  const sponsor = await prisma.sponsor.create({ data: { id: `${PREFIX}sponsor-${stamp}`, conferenceId: confId, name: COMPANY, tier: 'GOLD' } })
  created.sponsorIds.push(sponsor.id)
  const user = await prisma.user.create({ data: { id: `${PREFIX}user-${stamp}`, email: `${PREFIX}${stamp}@example.com`, name: BUYER, role: 'ATTENDEE', company: 'E2E Buyer Corp' } })
  created.userIds.push(user.id)
  const meeting = await prisma.sponsorMeeting.create({
    data: { id: `${PREFIX}mtg-${stamp}`, sponsorId: sponsor.id, userId: user.id, timeBlockId: block.id, status: 'CONFIRMED', location: 'Table 1' },
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

  console.log('\n[check-in board]')
  await page.goto(`${BASE}/dashboard/meetings/check-in`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  const dayTabs = page.locator('[role="tablist"][aria-label="Conference day"] [role="tab"]')
  check('day switcher renders', await dayTabs.first().waitFor({ timeout: T }).then(() => true).catch(() => false))

  // The fixture sits in the conference's first block — walk day tabs until its
  // sponsor row is on screen (default tab is "today", which may differ).
  const sponsorCell = page.getByRole('cell', { name: new RegExp(COMPANY) }).first()
  let found = await sponsorCell.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
  if (!found) {
    const n = await dayTabs.count()
    for (let i = 0; i < n && !found; i++) {
      await dayTabs.nth(i).click()
      found = await sponsorCell.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
    }
  }
  check('fixture meeting row is on the grid', found)
  check('attendee shown on the row', await page.getByText(BUYER).first().waitFor({ timeout: T }).then(() => true).catch(() => false))
  await shot(page, 'checkin-board.png')

  console.log('\n[dashboard]')
  const tracker = page.getByRole('heading', { name: 'Check-In Tracker' })
  check('tracker card renders', await tracker.waitFor({ timeout: T }).then(() => true).catch(() => false))
  for (const name of ['Time Slots', 'Needs Attention', 'Arrival Progress', 'Conference at a glance']) {
    check(`${name} card renders`, await page.getByRole('heading', { name }).isVisible().catch(() => false))
  }
  check('tracker hero completion % renders', await page.locator('section[aria-label="Check-in tracker"] p.text-5xl').innerText().then(t => /^\d+%$/.test(t)).catch(() => false))
  const floorHeading = page.locator('#floor-board')
  check('Floor Board heading anchors the table', await floorHeading.isVisible().catch(() => false))
  // Reconciliation strip is docked in the dashboard (no sticky table footer anymore)
  const summaryBar = page.locator('section[aria-label="Day summary"]')
  check('day summary bar renders in the dashboard', await summaryBar.getByText(/meetings happened/).isVisible().catch(() => false))
  check('summary bar carries the all-days rollup', await summaryBar.getByText(/^All days:/).isVisible().catch(() => false))
  const summaryBox = await summaryBar.boundingBox().catch(() => null)
  const floorBox2 = await floorHeading.boundingBox().catch(() => null)
  check('summary bar sits above the floor board', !!summaryBox && !!floorBox2 && summaryBox.y < floorBox2.y)
  const trackerBox = await tracker.boundingBox().catch(() => null)
  const floorBox = await floorHeading.boundingBox().catch(() => null)
  check('check-in table sits below the dashboard', !!trackerBox && !!floorBox && trackerBox.y < floorBox.y)
  // Tracker chart tooltip: hover a slot column; the tooltip must render its
  // tally INSIDE the chart scroller (the overflow-x strip clips vertically,
  // so a mispositioned tooltip would be invisible even though it "exists").
  const trackerSection = page.locator('section[aria-label="Check-in tracker"]')
  await trackerSection.locator('button[aria-label*="checked in"]').first().hover().catch(() => {})
  const tooltipLine = trackerSection.getByText(/^\d+ of \d+ checked in$/).first()
  check('slot column tooltip appears on hover', await tooltipLine.isVisible().catch(() => false))
  const tipBox = await tooltipLine.boundingBox().catch(() => null)
  const stripBox = await trackerSection.locator('div.overflow-x-auto').boundingBox().catch(() => null)
  check('tooltip sits inside the chart strip (not clipped)', !!tipBox && !!stripBox &&
    tipBox.y >= stripBox.y && tipBox.y + tipBox.height <= stripBox.y + stripBox.height &&
    tipBox.x >= stripBox.x && tipBox.x + tipBox.width <= stripBox.x + stripBox.width,
    JSON.stringify({ tipBox, stripBox }))
  await shot(page, 'checkin-dashboard.png')

  console.log('\n[sponsor arrival]')
  const sponsorBox = page.getByRole('checkbox', { name: new RegExp(`Sponsor arrived — ${COMPANY}`) })
  check('sponsor checkbox present + unchecked', await sponsorBox.isChecked().then(v => !v).catch(() => false))
  await sponsorBox.check()
  check('sponsor arrival persists to DB', await meetingEventually(prisma, meeting.id, m => !!m.sponsorArrivedAt, 'sponsorArrivedAt set'))

  console.log('\n[buyer arrival → completed]')
  const buyerBox = page.getByRole('checkbox', { name: new RegExp(`Buyer arrived — ${COMPANY}`) })
  await buyerBox.check()
  check('buyer arrival persists to DB', await meetingEventually(prisma, meeting.id, m => !!m.buyerArrivedAt, 'buyerArrivedAt set'))
  check('row shows ✓ Completed', await page.getByText('✓ Completed').first().waitFor({ timeout: T }).then(() => true).catch(() => false))
  await shot(page, 'checkin-completed.png')

  console.log('\n[floor note]')
  const note = page.getByRole('textbox', { name: new RegExp(`Note — ${COMPANY}`) })
  await note.fill(NOTE)
  await note.press('Enter')
  check('note persists to DB', await meetingEventually(prisma, meeting.id, m => m.notes === NOTE, 'note saved'))
  await shot(page, 'checkin-note.png')

  console.log('\n[untick sponsor]')
  await sponsorBox.uncheck()
  check('untick clears the timestamp', await meetingEventually(prisma, meeting.id, m => m.sponsorArrivedAt === null, 'sponsorArrivedAt cleared'))
  check('note survives the arrival untick', await meetingEventually(prisma, meeting.id, m => m.notes === NOTE, 'note intact'))
  await shot(page, 'checkin-final.png')

  // The fixture is now buyer-only (half-arrived) → it must surface in the
  // dashboard's Needs Attention chase list, and its quick ✓ marks the sponsor.
  console.log('\n[dashboard quick check-in]')
  const chaseBtn = page.getByRole('button', { name: new RegExp(`Mark sponsor arrived — ${COMPANY}`) })
  check('half-arrived fixture appears in Needs Attention', await chaseBtn.waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('chase row says Awaiting sponsor', await page.getByText('Awaiting sponsor').first().isVisible().catch(() => false))
  await shot(page, 'checkin-needs-attention.png')
  await chaseBtn.click()
  check('quick ✓ persists the sponsor arrival', await meetingEventually(prisma, meeting.id, m => !!m.sponsorArrivedAt, 'sponsorArrivedAt set via dashboard'))
  check('fixture leaves the chase list once complete', await chaseBtn.waitFor({ state: 'detached', timeout: T }).then(() => true).catch(() => false))
  await shot(page, 'checkin-dashboard-after.png')

  check('no app console errors during the flow', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
  await browser.close()
  console.log(`  screenshots → ${SHOT_DIR}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ all check-in e2e checks passed' : `❌ ${failures} check(s) failed`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
