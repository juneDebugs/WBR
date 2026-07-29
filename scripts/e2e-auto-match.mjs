#!/usr/bin/env node
// E2E for the ADMIN Auto tab (apps/web /dashboard/meetings?tab=auto) — mutual
// Best Fit auto-matches. Matches schedule AUTOMATICALLY: the tab's GET runs a
// self-healing sweep before reading the board, so simply loading the page
// turns the fixture's mutual picks into a CONFIRMED SponsorMeeting. Drives a
// real browser: login as WBR staff → Auto tab → the fixture company section
// arrives already "✓ Scheduled" (DB row carries the rep + a room) → activity
// log shows the pair's MATCHED and SCHEDULED events → stat tiles render.
// Screenshots at every stage. Fixtures (sponsor + rep + attendee + the two
// BEST_FIT MeetingRequests that form the match, names prefixed 'E2E AutoMatch')
// are created/removed via Prisma; active conference time blocks are used
// READ-ONLY.
//
//   node scripts/e2e-auto-match.mjs           # server already running (repo-standard :3000)
//   node scripts/e2e-auto-match.mjs --start   # boot next dev, then kill it
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

const COMPANY = 'E2E AutoMatch Co'
const REP = 'E2E AutoMatch Rep'
const BUYER = 'E2E AutoMatch Buyer'
const PREFIX = 'am-e2e-'
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

const prisma = makePrisma()
const created = { userIds: [], sponsorIds: [] }
async function cleanup() {
  // Fixture meetings + audit events hang off the fixture sponsor/attendee;
  // requests carry prefixed ids. Active-conference time blocks are never touched.
  if (created.sponsorIds.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { sponsorId: { in: created.sponsorIds } } }).catch(() => {})
  }
  if (created.userIds.length) {
    await prisma.autoMatchEvent.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => {})
  }
  await prisma.meetingRequest.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  if (created.userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  }
  if (created.sponsorIds.length) {
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

  // Fixtures: a fresh sponsor + rep + attendee in the active conference, plus
  // the two BEST_FIT requests (attendee→sponsor, rep→attendee) that make the
  // pair a mutual match. Blocks are read-only — one must exist so the sweep
  // has somewhere to place the meeting.
  const stamp = Date.now()
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const block = await prisma.timeBlock.findFirst({ where: { conferenceId: confId }, orderBy: { startsAt: 'asc' }, select: { id: true } })
  check('active conference has a time block (read-only)', !!block)
  if (!block) throw new Error('no time blocks for the sweep to place the meeting in')
  const sponsor = await prisma.sponsor.create({ data: { id: `${PREFIX}sponsor-${stamp}`, conferenceId: confId, name: COMPANY, tier: 'GOLD' } })
  created.sponsorIds.push(sponsor.id)
  const rep = await prisma.user.create({ data: { id: `${PREFIX}rep-${stamp}`, email: `${PREFIX}rep-${stamp}@example.com`, name: REP, role: 'ATTENDEE', sponsorId: sponsor.id } })
  created.userIds.push(rep.id)
  const attendee = await prisma.user.create({ data: { id: `${PREFIX}buyer-${stamp}`, email: `${PREFIX}buyer-${stamp}@example.com`, name: BUYER, role: 'ATTENDEE', company: 'E2E Buyer Corp' } })
  created.userIds.push(attendee.id)
  await prisma.meetingRequest.create({
    data: { id: `${PREFIX}req-a2s-${stamp}`, requesterId: attendee.id, targetSponsorId: sponsor.id, status: 'PENDING', priority: 'BEST_FIT' },
  })
  await prisma.meetingRequest.create({
    data: { id: `${PREFIX}req-s2a-${stamp}`, requesterId: rep.id, targetUserId: attendee.id, status: 'PENDING', priority: 'BEST_FIT' },
  })
  console.log(`fixture match ${sponsor.id} ↔ ${attendee.id} (rep ${rep.id})`)

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

  console.log('\n[auto-match board — sweep schedules on load]')
  await page.goto(`${BASE}/dashboard/meetings?tab=auto`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  check('Auto tab pill renders', await page.getByRole('link', { name: 'Auto', exact: true }).first().waitFor({ timeout: T }).then(() => true).catch(() => false))

  // The GET behind the board sweeps before it reads, so the fixture pair
  // should land already scheduled inside its own company section.
  const section = page.locator(`section[aria-label="${COMPANY} auto matches"]`)
  check('fixture company section renders', await section.waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('company heading in the section', await section.getByRole('heading', { name: COMPANY }).waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('attendee shown on the card', await section.getByText(BUYER).first().waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('↔ Mutual Best Fit badge present', await section.getByText('↔ Mutual Best Fit').first().waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('section shows its scheduled tally', await section.getByText(/\d+ of \d+ scheduled/).first().waitFor({ timeout: T }).then(() => true).catch(() => false))

  console.log('\n[auto-scheduled meeting]')
  // The sweep wrote the meeting server-side before the board response — poll
  // the DB for the pair's CONFIRMED row, then verify rep + room on it.
  let meeting = null
  const persisted = await waitFor(async () => {
    meeting = await prisma.sponsorMeeting.findFirst({
      where: { sponsorId: sponsor.id, userId: attendee.id, status: 'CONFIRMED' },
      select: { id: true, repId: true, location: true, timeBlockId: true },
    })
    return !!meeting
  }, T, 'CONFIRMED SponsorMeeting for the fixture pair').then(() => true).catch(() => false)
  check('CONFIRMED meeting persists to DB', persisted)
  check('meeting inherits the rep from the sponsor-side pick', meeting?.repId === rep.id, `repId=${meeting?.repId}`)
  check('meeting has a room assigned', !!meeting?.location, `location=${meeting?.location}`)

  let scheduledVisible = await section.getByText('✓ Scheduled').first().waitFor({ timeout: T }).then(() => true).catch(() => false)
  if (!scheduledVisible && persisted) {
    // FALLBACK: the DB has the meeting but this render predates it (React Query
    // refetches on a 30s cadence) — one reload must surface the scheduled state.
    console.log('  … "✓ Scheduled" not on the first render; reloading once')
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 })
    await section.waitFor({ timeout: T }).catch(() => {})
    scheduledVisible = await section.getByText('✓ Scheduled').first().waitFor({ timeout: T }).then(() => true).catch(() => false)
  }
  check('card shows ✓ Scheduled', scheduledVisible)
  await shot(page, 'auto-match-board.png')

  console.log('\n[activity log]')
  const log = page.locator('aside[aria-label="Auto-match activity log"]')
  check('activity log rail renders', await log.waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('Activity heading', await log.getByText('Activity', { exact: true }).waitFor({ timeout: T }).then(() => true).catch(() => false))
  const pairRows = log.locator('li').filter({ hasText: `${COMPANY} ↔ ${BUYER}` })
  check('SCHEDULED event logged for the pair', await pairRows.filter({ hasText: 'Meeting auto-scheduled' }).first().waitFor({ timeout: T }).then(() => true).catch(() => false))
  check('MATCHED event logged for the pair', await pairRows.filter({ hasText: 'Matched · both picked Best Fit' }).first().waitFor({ timeout: T }).then(() => true).catch(() => false))
  await shot(page, 'auto-match-log.png')

  console.log('\n[stat tiles]')
  for (const label of ['Mutual Matches', 'Auto-Scheduled', 'Awaiting Slot']) {
    check(`"${label}" tile renders`, await page.getByText(label, { exact: true }).first().waitFor({ timeout: T }).then(() => true).catch(() => false))
  }
  await shot(page, 'auto-match-final.png')

  check('no app console errors during the flow', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
  await browser.close()
  console.log(`  screenshots → ${SHOT_DIR}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ all auto-match e2e checks passed' : `❌ ${failures} check(s) failed`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
