#!/usr/bin/env node
// Browser E2E for the People → Feed section (attendee app), Instagram-style UI:
//   Goal 1 — /people opens on the Feed tab by default: WBR wordmark header,
//            messages rail ("Messages" entry tile, no "Your story"), and feed
//            posts all visible.
//   Goal 2 — a plain ATTENDEE can create a post via the "+" header button and
//            composer sheet, sees it appear at the top instantly (optimistic),
//            and it survives a reload (persisted).
//   Goal 3 — like flow: tapping the heart on another user's post increments
//            the count and flips aria-pressed, survives a reload, and can be
//            unliked again (state left clean).
//   Goal 4 — comments flow: the comments sheet opens, a comment can be posted,
//            it renders in the list, and the post's "View … comment" count
//            updates.
//   Goal 5 — messages rail: a seeded DM conversation appears as a rail tile;
//            tapping the tile opens the DM thread with that person; tapping
//            the "Messages" entry tile switches to the Messages tab, which
//            lists the same conversation.
//   Goal 6 — the other People tabs (Discover/Friends/Messages) still render.
//
// Drives real Chromium at an iPhone-ish viewport, seeds a second user's feed
// post over HTTP, and writes screenshots to SHOT_DIR for design review.
//
//   node scripts/e2e-home-feed.mjs           # attendee server already on :3001
//   node scripts/e2e-home-feed.mjs --start   # boot next dev, then kill
//
// Env: SMOKE_BASE_URL, SMOKE_EMAIL/SMOKE_PASSWORD (attendee, default steph),
//      SMOKE_EMAIL_B/SMOKE_PASSWORD_B (feed-partner, default june), SHOT_DIR.
// All messages/comments created here carry a unique marker and are deleted
// afterwards (comment cleanup is best-effort across candidate table names).

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
// Primary actor: a plain attendee — proves feed/likes/comments are not staff-gated.
const CREDS = { email: process.env.SMOKE_EMAIL ?? 'brand@test.com', password: process.env.SMOKE_PASSWORD ?? 'password123' }
// Partner whose post we like/comment on.
const CREDS_B = { email: process.env.SMOKE_EMAIL_B ?? 'wbr@test.com', password: process.env.SMOKE_PASSWORD_B ?? 'password123' }
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

// Send a DM as `creds` to `targetUserId` so the recipient's messages rail and
// Messages tab have a real conversation to render.
async function sendDmAs(creds, targetUserId, content) {
  const jarFetch = makeJar()
  const { csrfToken } = await (await jarFetch(`${BASE}/api/auth/csrf`)).json()
  await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email: creds.email, password: creds.password, json: 'true' }),
  })
  const roomRes = await jarFetch(`${BASE}/api/chat/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })
  if (!roomRes.ok) throw new Error(`DM room create failed: ${roomRes.status}`)
  const room = await roomRes.json()
  const msgRes = await jarFetch(`${BASE}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!msgRes.ok) throw new Error(`DM message post failed: ${msgRes.status}`)
  return msgRes.json()
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

  // Seed a partner post so the feed has another user's card to like/comment on.
  // Retried: a just-booted dev server can drop the first requests while
  // routes compile.
  const partnerContent = `${MARKER} partner post — say hi!`
  let seeded = null
  for (let i = 0; i < 5 && !seeded; i++) {
    try { seeded = await postFeedAs(CREDS_B, partnerContent) }
    catch (e) { console.log(`  … partner seed retry (${e.message})`); await new Promise(r => setTimeout(r, 3000)) }
  }
  if (!seeded) throw new Error('could not seed the partner feed post')

  // Seed a DM from the partner to the primary actor so the Feed messages rail
  // and the Messages tab have a conversation to show. User ids/names come from
  // the same DB the dev server reads.
  const oracle = openOracle()
  const meRow = await oracle.execute({ sql: 'SELECT id FROM User WHERE email = ?', args: [CREDS.email] })
  const partnerRow = await oracle.execute({ sql: 'SELECT id, name FROM User WHERE email = ?', args: [CREDS_B.email] })
  if (!meRow.rows[0] || !partnerRow.rows[0]) { oracle.close?.(); throw new Error('test users missing from the DB') }

  // DM room creation is gated on friendship (mutual Follow edges) — make the
  // two actors friends before seeding the conversation. OR IGNORE keeps
  // reruns idempotent (unique on the pair and on the deterministic id).
  const meId = meRow.rows[0].id
  const partnerId = partnerRow.rows[0].id
  for (const [a, b] of [[meId, partnerId], [partnerId, meId]]) {
    await oracle.execute({
      sql: 'INSERT OR IGNORE INTO Follow (id, followerId, followingId) VALUES (?, ?, ?)',
      args: [`e2e-fr-${a}-${b}`, a, b],
    })
  }
  oracle.close?.()
  const partnerName = partnerRow.rows[0].name ?? 'Unknown'
  const dmContent = `${MARKER} dm from the feed rail partner`
  await sendDmAs(CREDS_B, meId, dmContent)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()

  console.log(`\nLogging in via UI as ${CREDS.email}`)
  await login(page, CREDS)

  // ── Goal 1: Feed is the default People tab, Instagram chrome renders ──
  console.log('\n[feed tab default]')
  await page.goto(`${BASE}/people`, { waitUntil: 'domcontentloaded' })
  const wordmark = page.getByTestId('feed-wordmark')
  await wordmark.waitFor({ state: 'visible', timeout: 60_000 })
  check('WBR wordmark header visible without any tab click (Feed is default)', true)
  const feedTab = page.locator('button', { hasText: 'Feed' }).first()
  check('Feed tab present', await feedTab.count() > 0)
  // The rail's Messages entry is the only element whose accessible name
  // includes a conversation count (header plane button is plain "Messages").
  const railMessagesTile = () => page.getByRole('button', { name: /^Messages, \d+ conversation/ }).first()
  const railTileVisible = await railMessagesTile()
    .waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false)
  check('messages rail visible ("Messages" entry tile with count)', railTileVisible)
  check('rail no longer shows "Your story"', (await page.getByText('Your story').count()) === 0)
  const partnerPostVisible = await page.getByText(partnerContent).first()
    .waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false)
  check('partner post visible in the feed', partnerPostVisible)
  check('posts render as full-bleed feed cards', await page.getByTestId('feed-post').count() > 0)
  await page.screenshot({ path: join(SHOT_DIR, 'feed-01-default.png') })

  // ── Goal 2: create a post via the composer sheet, optimistic + persisted ──
  console.log('\n[create post]')
  const myContent = `${MARKER} hello from the e2e attendee`
  await page.getByRole('button', { name: 'New post' }).click()
  const sheet = page.getByTestId('composer-sheet')
  await sheet.waitFor({ state: 'visible', timeout: 15_000 })
  check('composer sheet opens from the "+" header button', true)
  const composer = sheet.locator('textarea[placeholder="Share something with everyone at WBR…"]')
  await composer.waitFor({ state: 'visible', timeout: 10_000 })
  const shareBtn = sheet.getByRole('button', { name: 'Share', exact: true })
  check('Share disabled while composer is empty', await shareBtn.isDisabled())
  await composer.fill(myContent)
  check('Share enabled once content typed', !(await shareBtn.isDisabled()))
  await shareBtn.click()
  await page.getByText(myContent).first().waitFor({ state: 'visible', timeout: 15_000 })
  check('own post appears in the feed (optimistic)', true)
  const firstPostText = await page.getByTestId('feed-post').first().innerText()
  check('own post is the top feed card (newest first)', firstPostText.includes(myContent),
    firstPostText.slice(0, 120))
  await page.screenshot({ path: join(SHOT_DIR, 'feed-02-posted.png') })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(myContent).first().waitFor({ state: 'visible', timeout: 60_000 })
  check('post survives reload (persisted server-side)', true)

  // ── Goal 3: like flow on the partner's post ──
  console.log('\n[like flow]')
  const partnerPost = () => page.getByTestId('feed-post').filter({ hasText: partnerContent }).first()
  const likeBtn = () => partnerPost().getByTestId('like-button')
  await likeBtn().waitFor({ state: 'visible', timeout: 15_000 })
  check('like button starts unpressed', (await likeBtn().getAttribute('aria-pressed')) === 'false')
  check('partner post has a share action', await partnerPost().getByRole('button', { name: 'Send as message' }).count() > 0)
  check('own post has no share action',
    (await page.getByTestId('feed-post').filter({ hasText: myContent }).first()
      .getByRole('button', { name: 'Send as message' }).count()) === 0)
  await likeBtn().click()
  await partnerPost().locator('[data-testid="like-button"][aria-pressed="true"]')
    .waitFor({ state: 'visible', timeout: 10_000 })
  check('heart flips to pressed (aria-pressed=true) on tap', true)
  const likeCount = await partnerPost().getByTestId('like-count').innerText().catch(() => '')
  check('like count appears next to the heart', Number(likeCount) >= 1, `count="${likeCount}"`)
  await page.screenshot({ path: join(SHOT_DIR, 'feed-03-liked.png') })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(partnerContent).first().waitFor({ state: 'visible', timeout: 60_000 })
  check('like survives reload (persisted server-side)',
    (await likeBtn().getAttribute('aria-pressed')) === 'true')
  await likeBtn().click()
  await partnerPost().locator('[data-testid="like-button"][aria-pressed="false"]')
    .waitFor({ state: 'visible', timeout: 10_000 })
  check('unlike flips the heart back (state left clean)', true)

  // ── Goal 4: comments flow on the partner's post ──
  console.log('\n[comments flow]')
  const commentContent = `${MARKER} comment via feed e2e`
  await partnerPost().getByTestId('comment-button').click()
  const commentsSheet = page.getByTestId('comments-sheet')
  await commentsSheet.waitFor({ state: 'visible', timeout: 15_000 })
  check('comments sheet opens', true)
  const commentInput = commentsSheet.locator('input[placeholder="Add a comment…"]')
  await commentInput.waitFor({ state: 'visible', timeout: 10_000 })
  await commentInput.fill(commentContent)
  await commentsSheet.getByRole('button', { name: 'Post', exact: true }).click()
  const commentRendered = await commentsSheet.getByText(commentContent).first()
    .waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)
  check('comment posted and rendered in the sheet', commentRendered)
  await page.screenshot({ path: join(SHOT_DIR, 'feed-04-comments.png') })
  await commentsSheet.getByRole('button', { name: 'Close comments' }).click()
  await commentsSheet.waitFor({ state: 'hidden', timeout: 10_000 })
  const viewCommentsVisible = await partnerPost().getByText(/View (all \d+ comments|1 comment)/).first()
    .waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
  check('post shows an updated "View … comment" count', viewCommentsVisible)

  // ── Goal 5: messages rail — tile opens the DM, entry tile opens the tab ──
  console.log('\n[messages rail]')
  const convoTile = page.getByRole('button', { name: `Open conversation with ${partnerName}` }).first()
  const convoTileVisible = await convoTile
    .waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)
  check(`rail shows a conversation tile for ${partnerName}`, convoTileVisible)
  if (convoTileVisible) {
    await convoTile.click()
    const dmVisible = await page.getByText(dmContent).first()
      .waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)
    check('tapping the tile opens the DM thread with that person', dmVisible)
    await page.screenshot({ path: join(SHOT_DIR, 'feed-06-dm-from-rail.png') })
    // Dismiss the DM sheet via its backdrop (tap above the bottom sheet).
    await page.mouse.click(195, 60)
    await page.getByText(dmContent).first().waitFor({ state: 'hidden', timeout: 10_000 })
      .catch(() => {})
  }
  await railMessagesTile().click()
  const messagesSearchVisible = await page.locator('input[placeholder="Search messages…"]').first()
    .waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)
  check('rail "Messages" entry tile switches to the Messages tab', messagesSearchVisible)
  check('Messages tab lists the same conversation',
    (await page.getByText(partnerName).count()) > 0)
  await page.screenshot({ path: join(SHOT_DIR, 'feed-07-messages-tab.png') })

  // ── Goal 6: other tabs unharmed ──
  console.log('\n[other tabs]')
  for (const label of ['Discover', 'Friends', 'Messages']) {
    await page.locator('button', { hasText: label }).first().click()
    await page.waitForTimeout(400)
    check(`${label} tab renders without crash`,
      (await page.locator('body').innerText()).length > 0 && !(await page.locator('text=Application error').count()))
  }
  await page.locator('button', { hasText: 'Feed' }).first().click()
  await wordmark.waitFor({ state: 'visible', timeout: 10_000 })
  check('returning to Feed keeps it working', true)
  await page.screenshot({ path: join(SHOT_DIR, 'feed-08-back-to-feed.png') })

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
    // Comments first (they reference messages). The comment table name is
    // owned by the backend; try candidates best-effort so cleanup works
    // whichever name shipped.
    for (const table of ['MessageComment', 'FeedComment', 'PostComment', 'Comment']) {
      try { await oracle.execute({ sql: `DELETE FROM ${table} WHERE content LIKE ?`, args: [`%${MARKER}%`] }) } catch {}
    }
    await oracle.execute({ sql: 'DELETE FROM Message WHERE content LIKE ?', args: [`%${MARKER}%`] })
    // Best-effort: drop any like/comment rows orphaned by the message delete.
    for (const table of ['MessageLike', 'FeedLike', 'PostLike']) {
      try {
        await oracle.execute({ sql: `DELETE FROM ${table} WHERE messageId NOT IN (SELECT id FROM Message)` })
      } catch {}
    }
    for (const table of ['MessageComment', 'FeedComment', 'PostComment', 'Comment']) {
      try {
        await oracle.execute({ sql: `DELETE FROM ${table} WHERE messageId NOT IN (SELECT id FROM Message)` })
      } catch {}
    }
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
