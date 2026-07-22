#!/usr/bin/env node
// Acceptance test for the removal of the admin Chat page's Direct-Messages
// viewing surface, over HTTP against the admin (apps/web) app. Same harness
// conventions as test-scheduled-messages-api.mjs (cookie-jar login, --start
// server lifecycle, exit 0/1/2) but READ-ONLY — no DB writes, so no oracle and
// no cleanup are needed.
//
// What this verifies at runtime:
//   1. Auth: unauthenticated GET /api/data/chat is rejected (401).
//   2. /api/data/chat still serves the Global Broadcast payload
//      (recentMessages/memberCount/totalUsers/messageCount) but NO LONGER
//      includes a `rooms` (DM conversations) field.
//   3. The deleted admin per-room DM route GET /api/chat/rooms/<id> returns 404
//      for an authenticated admin (the handler is gone).
//   4. Preservation: GET /api/chat/scheduled still works (200 with pending/
//      history), proving the broadcast subsystem is intact.
//   5. The /dashboard/chat page still renders Global Broadcast and no longer
//      renders the "Direct Messages" section.
//
//   node scripts/test-admin-chat-dm-removed-api.mjs           # server already up
//   node scripts/test-admin-chat-dm-removed-api.mjs --start   # boot next dev, then kill it
//
// Env overrides: SMOKE_BASE_URL (default :3000), SMOKE_EMAIL, SMOKE_PASSWORD.

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const PORT = new URL(BASE).port || '3000'
const EMAIL = process.env.SMOKE_EMAIL ?? 'wbr@test.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'password123'

let serverProc = null
let failures = 0

function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Cookie jar ───────────────────────────────────────────────────────────────
const jar = new Map()
function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';')
    const eq = pair.indexOf('=')
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1))
  }
}
async function jarFetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: { ...init.headers, cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
  })
  storeCookies(res)
  return res
}

// ─── Server lifecycle ────────────────────────────────────────────────────────
async function serverUp() {
  try {
    const res = await fetch(`${BASE}/login`, { redirect: 'manual' })
    return res.status < 500
  } catch {
    return false
  }
}
async function waitFor(cond, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) {
      console.error(`No server at ${BASE}. Start one (./dev.sh web) or pass --start.`)
      process.exit(2)
    }
    console.log(`Starting web dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps/web'),
      env: { ...process.env, NEXTAUTH_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    serverProc.stdout.on('data', () => {})
    serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'web dev server')
    console.log('Server is up.')
  }

  // ── Auth gate ──
  console.log('\n[auth]')
  check('unauthenticated GET /api/data/chat rejected', (await fetch(`${BASE}/api/data/chat`)).status === 401)

  console.log(`\nLogging in as ${EMAIL}`)
  const csrfRes = await jarFetch(`${BASE}/api/auth/csrf`)
  const { csrfToken } = csrfRes.headers.get('content-type')?.includes('json') ? await csrfRes.json() : {}
  check('csrf token issued', Boolean(csrfToken), `is ${BASE} really the WBR web app? got ${csrfRes.status}`)
  if (!csrfToken) return
  const loginRes = await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, json: 'true' }),
  })
  check('login accepted', loginRes.status === 200 || loginRes.status === 302, `status ${loginRes.status}`)
  const hasSession = [...jar.keys()].some(k => k.includes('next-auth.session-token'))
  check('session cookie set', hasSession, 'wrong credentials? reseed with pnpm db:seed')
  if (!hasSession) return

  // ── /api/data/chat: broadcast payload kept, DM `rooms` gone ──
  console.log('\n[api/data/chat shape]')
  const chatRes = await jarFetch(`${BASE}/api/data/chat`)
  check('GET /api/data/chat → 200', chatRes.status === 200, `status ${chatRes.status}`)
  const chatData = await chatRes.json()
  check('DM conversations `rooms` field REMOVED', !('rooms' in chatData),
    `keys: ${Object.keys(chatData).join(', ')}`)
  check('Global Broadcast recentMessages preserved', Array.isArray(chatData.recentMessages),
    `recentMessages: ${typeof chatData.recentMessages}`)
  check('Global Broadcast stats preserved',
    typeof chatData.memberCount === 'number' &&
    typeof chatData.totalUsers === 'number' &&
    typeof chatData.messageCount === 'number',
    JSON.stringify({ memberCount: chatData.memberCount, totalUsers: chatData.totalUsers, messageCount: chatData.messageCount }))

  // ── Deleted DM per-room route → 404 for an authenticated admin ──
  console.log('\n[deleted DM route]')
  const goneRes = await jarFetch(`${BASE}/api/chat/rooms/any-room-id-xyz`)
  check('GET /api/chat/rooms/<id> → 404 (handler deleted)', goneRes.status === 404, `status ${goneRes.status}`)

  // ── Preservation: scheduled broadcasts still work ──
  console.log('\n[preservation: scheduled broadcasts]')
  const schedRes = await jarFetch(`${BASE}/api/chat/scheduled`)
  check('GET /api/chat/scheduled → 200', schedRes.status === 200, `status ${schedRes.status}`)
  const sched = schedRes.status === 200 ? await schedRes.json() : {}
  check('scheduled response has pending + history arrays',
    Array.isArray(sched.pending) && Array.isArray(sched.history), JSON.stringify(Object.keys(sched)))

  // ── Page render: Global Broadcast present, Direct Messages gone ──
  console.log('\n[page render]')
  const pageRes = await jarFetch(`${BASE}/dashboard/chat`)
  check('GET /dashboard/chat → 200', pageRes.status === 200, `status ${pageRes.status}`)
  const html = pageRes.status === 200 ? await pageRes.text() : ''
  check('page renders "Global Broadcast"', html.includes('Global Broadcast'))
  check('page no longer renders "Direct Messages"', !/Direct Messages/i.test(html))
}

try {
  await main()
} catch (e) {
  failures++
  console.error(`\n  ✗ unexpected error — ${e.message}`)
} finally {
  if (serverProc) {
    console.log('\nStopping dev server...')
    try { process.kill(-serverProc.pid, 'SIGTERM') } catch {}
  }
}

console.log(failures === 0 ? '\nADMIN CHAT DM-REMOVAL API TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
