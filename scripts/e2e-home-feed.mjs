#!/usr/bin/env node
// Browser E2E for the People → Feed section (attendee app):
//   Goal 1 — /people opens on the Feed tab by default, with the composer and
//            the conference-wide feed visible.
//   Goal 2 — a plain ATTENDEE can post to the feed, sees it appear at the top
//            instantly (optimistic), and it survives a reload (persisted).
//   Goal 3 — another user's post shows a "Message" action that opens the DM
//            modal, and a DM can be sent from it.
//   Goal 4 — the other People tabs (Discover/Friends/Messages) still render.
//
// Drives real Chromium at an iPhone-ish viewport, seeds a second user's feed
// post over HTTP, and writes screenshots to SHOT_DIR for design review.
//
//   node scripts/e2e-home-feed.mjs           # attendee server already on :3001
//   node scripts/e2e-home-feed.mjs --start   # boot next dev, then kill
//
// Env: SMOKE_BASE_URL, SMOKE_EMAIL/SMOKE_PASSWORD (attendee, default steph),
//      SMOKE_EMAIL_B/SMOKE_PASSWORD_B (feed-partner, default june), SHOT_DIR.
// All messages created here carry a unique marker and are deleted afterwards.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
let chromium
try { ({ chromium } = require(join(ROOT, 'node_modules/playwright/index.js'))) }
catch { ({ chromium } = require('playwright')) }

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3001'
const PORT = new URL(BASE).port || '3001'
// Primary actor: a plain attendee — proves feed/DM is not staff-gated.
const CREDS = { email: process.env.SMOKE_EMAIL ?? 'steph@curry.com', password: process.env.SMOKE_PASSWORD ?? 'stephcurry' }
// Partner whose post we DM from.
const CREDS_B = { email: process.env.SMOKE_EMAIL_B ?? 'june@tailor.tech', password: process.env.SMOKE_PASSWORD_B ?? 'admin123' }
const SHOT_DIR = process.env.SHOT_DIR ?? '/tmp'
const MARKER = `[feed-e2e ${process.pid}-${Date.now()}]`

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

// ─── HTTP helper: post to the feed as the partner user ───────────────────────

function makeJar() {
  const jar = new Map()
  return async function jarFetch(url, init = {}) {
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      headers: { ...init.headers, cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
    })
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';')
      const eq = pair.indexOf('=')
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1))
    }
    return res
  }
}

async function postFeedAs(creds, content) {
  const jarFetch = makeJar()
  const { csrfToken } = await (await jarFetch(`${BASE}/api/auth/csrf`)).json()
  await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email: creds.email, password: creds.password, json: 'true' }),
  })
  const res = await jarFetch(`${BASE}/api/chat/global`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`partner feed post failed: ${res.status}`)
  return res.json()
}

// ─── Cleanup oracle (same DB the dev server uses; Turso wins in local dev) ───

function openOracle() {
  const env = {}
  try {
    for (const line of readFileSync(join(ROOT, 'apps/attendee/.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {}
  const req = createRequire(join(ROOT, 'packages/db/package.json'))
  const { createClient } = req('@libsql/client')
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    return createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
  }
  return createClient({ url: `file:${join(ROOT, 'apps/attendee/dev.db')}` })
}

// ─── UI login ────────────────────────────────────────────────────────────────

const onLogin = page => new URL(page.url()).pathname.startsWith('/login')
async function login(page, creds) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    if (!onLogin(page)) return
    const email = page.locator('input[type="email"], input[name="email"]').first()
    await email.waitFor({ state: 'visible', timeout: 90_000 })
    await email.fill(creds.email)
    await page.locator('input[type="password"]').first().fill(creds.password)
    await page.locator('button[type="submit"]').first().click()
    try { await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 }); return }
    catch { if (!onLogin(page)) return }
  }
  throw new Error('login failed after 4 attempts')
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) { console.error(`No server at ${BASE}. Pass --start.`); process.exit(2) }
    console.log(`Starting attendee dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps/attendee'), env: { ...process.env, NEXTAUTH_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'attendee dev server')
    console.log('Server is up.')
  }

  // Seed a partner post so the feed has another user's card to DM from.
  // Retried: a just-booted dev server can drop the first requests while
  // routes compile.
  const partnerContent = `${MARKER} partner post — say hi!`
  let seeded = null
  for (let i = 0; i < 5 && !seeded; i++) {
    try { seeded = await postFeedAs(CREDS_B, partnerContent) }
    catch (e) { console.log(`  … partner seed retry (${e.message})`); await new Promise(r => setTimeout(r, 3000)) }
  }
  if (!seeded) throw new Error('could not seed the partner feed post')

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()

  console.log(`\nLogging in via UI as ${CREDS.email}`)
  await login(page, CREDS)

  // ── Goal 1: Feed is the default People tab ──
  console.log('\n[feed tab default]')
  await page.goto(`${BASE}/people`, { waitUntil: 'domcontentloaded' })
  const composer = page.locator('textarea[placeholder="Share something with everyone at WBR…"]')
  await composer.waitFor({ state: 'visible', timeout: 60_000 })
  check('composer visible without any tab click (Feed is default)', true)
  const feedTab = page.locator('button', { hasText: 'Feed' }).first()
  check('Feed tab present', await feedTab.count() > 0)
  const postBtn = page.locator('button', { hasText: 'Post' }).first()
  check('Post button disabled while composer is empty', await postBtn.isDisabled())
  // The composer renders while the feed itself is still loading — wait for
  // the partner's card rather than sampling instantly.
  const partnerPostVisible = await page.getByText(partnerContent).first()
    .waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false)
  check('partner post visible in the feed', partnerPostVisible)
  await page.screenshot({ path: join(SHOT_DIR, 'feed-01-default.png') })

  // ── Goal 2: post to the feed, verify optimistic + persisted ──
  console.log('\n[post to feed]')
  const myContent = `${MARKER} hello from the e2e attendee`
  await composer.fill(myContent)
  check('Post button enabled once content typed', !(await postBtn.isDisabled()))
  await postBtn.click()
  await page.getByText(myContent).first().waitFor({ state: 'visible', timeout: 15_000 })
  check('own post appears in the feed', true)
  const firstCardText = await page.locator('.card').nth(1).innerText() // nth(0) is the composer card
  check('own post is the top feed card (newest first)', firstCardText.includes(myContent),
    firstCardText.slice(0, 120))
  await page.screenshot({ path: join(SHOT_DIR, 'feed-02-posted.png') })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(myContent).first().waitFor({ state: 'visible', timeout: 60_000 })
  check('post survives reload (persisted server-side)', true)

  // ── Goal 3: DM from a feed card ──
  console.log('\n[dm from feed]')
  const partnerCard = page.locator('.card', { hasText: partnerContent }).first()
  const messageBtn = partnerCard.locator('button', { hasText: 'Message' })
  check('partner card has a Message action', await messageBtn.count() > 0)
  check('own card has no Message action',
    (await page.locator('.card', { hasText: myContent }).first().locator('button', { hasText: 'Message' }).count()) === 0)
  await messageBtn.click()
  const dmInput = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]').first()
  await dmInput.waitFor({ state: 'visible', timeout: 15_000 })
  check('DM modal opened from the feed card', true)
  const dmContent = `${MARKER} dm via feed card`
  await dmInput.fill(dmContent)
  // The modal ignores Enter until its room bootstrap (POST /api/chat/rooms)
  // resolves, leaving the input intact — so retry Enter until the bubble
  // renders instead of pressing once.
  let dmRendered = false
  for (let i = 0; i < 10 && !dmRendered; i++) {
    await dmInput.press('Enter')
    dmRendered = await page.getByText(dmContent).first()
      .waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false)
  }
  check('DM sent and rendered in the thread', dmRendered)
  await page.screenshot({ path: join(SHOT_DIR, 'feed-03-dm-modal.png') })
  // The DM sheet dismisses on backdrop tap (mobile pattern), not Escape.
  await page.mouse.click(195, 40)
  await dmInput.waitFor({ state: 'hidden', timeout: 10_000 })

  // ── Goal 4: other tabs unharmed ──
  console.log('\n[other tabs]')
  for (const label of ['Discover', 'Friends', 'Messages']) {
    await page.locator('button', { hasText: label }).first().click()
    await page.waitForTimeout(400)
    check(`${label} tab renders without crash`,
      (await page.locator('body').innerText()).length > 0 && !(await page.locator('text=Application error').count()))
  }
  await page.locator('button', { hasText: 'Feed' }).first().click()
  await composer.waitFor({ state: 'visible', timeout: 10_000 })
  check('returning to Feed keeps it working', true)
  await page.screenshot({ path: join(SHOT_DIR, 'feed-04-back-to-feed.png') })

  await browser.close()
  console.log(`\nScreenshots: ${SHOT_DIR}/feed-0*.png`)
}

try {
  await main()
} catch (e) {
  failures++
  console.error(`\n  ✗ unexpected error — ${e.message}`)
} finally {
  try {
    const oracle = openOracle()
    await oracle.execute({ sql: 'DELETE FROM Message WHERE content LIKE ?', args: [`%${MARKER}%`] })
  } catch (e) {
    console.error('cleanup failed:', e.message)
  }
  if (serverProc) {
    console.log('\nStopping dev server...')
    try { process.kill(-serverProc.pid, 'SIGTERM') } catch {}
  }
}

console.log(failures === 0 ? '\nHOME FEED E2E PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
