#!/usr/bin/env node
// Visual QA for the Check-In dashboard: seeds throwaway fixture meetings in
// the active conference's first three time blocks with a mix of arrival
// states (completed / sponsor-only / buyer-only / awaiting), then captures
// element-level screenshots of every dashboard card. Fixtures are removed in
// finally — same scaffolding as e2e-checkin.mjs.
//
//   SMOKE_BASE_URL=http://localhost:3200 node scripts/visual-checkin-dashboard.mjs

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

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3200'
const CREDS = { email: 'wbr@test.com', password: 'password123' }
const SHOT_DIR = join(ROOT, 'scripts', '.screenshots')
mkdirSync(SHOT_DIR, { recursive: true })
const PREFIX = 'chk-vis-'
const COMPANY = 'Visual QA Co'

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

const prisma = makePrisma()
const created = { userIds: [], sponsorIds: [] }
async function cleanup() {
  if (created.userIds.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  }
  if (created.sponsorIds.length) await prisma.sponsor.deleteMany({ where: { id: { in: created.sponsorIds } } }).catch(() => {})
  await prisma.$disconnect().catch(() => {})
}

async function main() {
  const stamp = Date.now()
  const now = new Date()
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const blocks = await prisma.timeBlock.findMany({ where: { conferenceId: confId }, orderBy: { startsAt: 'asc' }, take: 3, select: { id: true } })
  if (blocks.length < 3) throw new Error('need 3 time blocks')

  const sponsor = await prisma.sponsor.create({ data: { id: `${PREFIX}sponsor-${stamp}`, conferenceId: confId, name: COMPANY, tier: 'GOLD' } })
  created.sponsorIds.push(sponsor.id)

  // Mixed states: block 1 → completed + sponsor-only; block 2 → buyer-only +
  // awaiting; block 3 → completed. Enough to light the chart, the chase list
  // and every tick strip.
  const states = [
    { block: 0, sponsorArrivedAt: now, buyerArrivedAt: now },
    { block: 0, sponsorArrivedAt: now, buyerArrivedAt: null },
    { block: 1, sponsorArrivedAt: null, buyerArrivedAt: now },
    { block: 1, sponsorArrivedAt: null, buyerArrivedAt: null },
    { block: 2, sponsorArrivedAt: now, buyerArrivedAt: now },
  ]
  for (let i = 0; i < states.length; i++) {
    const s = states[i]
    const user = await prisma.user.create({ data: { id: `${PREFIX}user-${stamp}-${i}`, email: `${PREFIX}${stamp}-${i}@example.com`, name: `Visual Buyer ${i + 1}`, role: 'ATTENDEE', company: 'QA Corp' } })
    created.userIds.push(user.id)
    await prisma.sponsorMeeting.create({
      data: {
        id: `${PREFIX}mtg-${stamp}-${i}`, sponsorId: sponsor.id, userId: user.id, timeBlockId: blocks[s.block].id,
        status: 'CONFIRMED', location: `Table ${i + 1}`, sponsorArrivedAt: s.sponsorArrivedAt, buyerArrivedAt: s.buyerArrivedAt,
      },
    })
  }
  console.log('fixtures seeded')

  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 })).newPage()

  // Retry: submitting before hydration turns the form into a GET navigation.
  const onLogin = () => new URL(page.url()).pathname.startsWith('/login')
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    if (!onLogin()) break
    await page.locator('input[type="email"]').fill(CREDS.email)
    await page.locator('input[type="password"]').fill(CREDS.password)
    await page.locator('button[type="submit"]').first().click()
    try { await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 }); break }
    catch { if (!onLogin()) break }
  }
  if (onLogin()) throw new Error('login failed after 3 attempts')

  await page.goto(`${BASE}/dashboard/meetings/check-in`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Check-In Tracker' }).waitFor({ timeout: 30_000 })
  // fixtures live in the first blocks → first day tab
  await page.locator('[role="tablist"][aria-label="Conference day"] [role="tab"]').first().click()
  await page.waitForTimeout(600)

  const grab = async (sel, name) => {
    const el = typeof sel === 'string' ? page.locator(sel).first() : sel
    await el.screenshot({ path: join(SHOT_DIR, name) }).catch(e => console.error(`${name}: ${e.message}`))
    console.log(`  → ${name}`)
  }
  await grab('section[aria-label="Check-in tracker"]', 'vis-tracker.png')
  await grab('section[aria-label="Time slots"]', 'vis-slots.png')
  await grab('section[aria-label="Needs attention"]', 'vis-attention.png')
  await grab('section[aria-label="Conference at a glance"]', 'vis-pulse.png')
  await grab('section[aria-label="Arrival progress"]', 'vis-progress.png')

  // tooltip open on the first slot column
  await page.locator('section[aria-label="Check-in tracker"] button[aria-label*="checked in"]').first().hover()
  await page.waitForTimeout(200)
  await grab('section[aria-label="Check-in tracker"]', 'vis-tracker-tooltip.png')

  // whole dashboard + top of table
  await page.screenshot({ path: join(SHOT_DIR, 'vis-dashboard-full.png') })
  console.log('  → vis-dashboard-full.png')

  await browser.close()
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); process.exitCode = 1 })
  .finally(cleanup)
