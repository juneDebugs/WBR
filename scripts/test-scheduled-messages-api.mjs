#!/usr/bin/env node
// Acceptance test for scheduled chat broadcasts, over HTTP against the admin
// app. Follows the same harness conventions as test-access-counts.mjs: cookie
// jar login, raw-SQL oracle opened against the exact database the server
// reports via /api/health, --start server lifecycle, exit 0/1/2.
//
// What this verifies:
//   1. Auth: unauthenticated list/create/dispatch are rejected (401).
//   2. Validation: empty message, past time, and >1-year time are 400s.
//   3. Create: POST /api/chat/scheduled persists a PENDING row (oracle-checked)
//      and it appears in the GET pending queue.
//   4. Edit: PATCH updates content + send time of a pending item.
//   5. Cancel: DELETE marks it CANCELED (oracle-checked); double-cancel → 409,
//      editing a canceled item → 409, unknown id → 404.
//   6. Delivery: an item due in a few seconds is materialized into a real
//      Message row in room-general by the next GET (the read-path dispatch
//      tick), lands in scheduled history as SENT with sentMessageId linking to
//      the message, and shows up in /api/data/chat recentMessages (proving the
//      admin chat cache was revalidated).
//   7. The dedicated dispatch endpoint works for a staff session.
//
//   node scripts/test-scheduled-messages-api.mjs           # server already on :3000
//   node scripts/test-scheduled-messages-api.mjs --start   # boot `next dev`, then kill it
//
// Env overrides: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD.
// All rows created here carry a unique marker and are deleted afterwards.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const PORT = new URL(BASE).port || '3000'
const EMAIL = process.env.SMOKE_EMAIL ?? 'wbr@test.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'password123'
const MARKER = `[sched-test ${process.pid}-${Date.now()}]`

let serverProc = null
let failures = 0
let oracle = null

function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Oracle: open the same database the server reports ───────────────────────

function readEnvLocal() {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, 'apps/web/.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}

async function openDb() {
  const health = await (await fetch(`${BASE}/api/health`)).json()
  const mode = String(health.connectionMode ?? '')
  console.log(`Server connection mode: ${mode}`)
  const req = createRequire(join(ROOT, 'packages/db/package.json'))
  const { createClient } = req('@libsql/client')
  if (mode.startsWith('turso-http')) {
    const envLocal = readEnvLocal()
    const url = process.env.TURSO_DATABASE_URL ?? envLocal.TURSO_DATABASE_URL
    const authToken = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
    if (!url || !authToken) throw new Error('server uses Turso but no TURSO_* vars found for the oracle')
    return createClient({ url, authToken })
  }
  if (mode.startsWith('sqlite')) {
    const rel = mode.replace(/^sqlite:\s*file:/, '')
    return createClient({ url: `file:${join(ROOT, 'packages/db/prisma', rel)}` })
  }
  throw new Error(`unexpected server connection mode: ${mode || JSON.stringify(health)}`)
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

const api = {
  list: () => jarFetch(`${BASE}/api/chat/scheduled`),
  create: (message, scheduledFor) =>
    jarFetch(`${BASE}/api/chat/scheduled`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, scheduledFor }),
    }),
  patch: (id, body) =>
    jarFetch(`${BASE}/api/chat/scheduled/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  cancel: (id) => jarFetch(`${BASE}/api/chat/scheduled/${id}`, { method: 'DELETE' }),
  dispatch: () => jarFetch(`${BASE}/api/chat/scheduled/dispatch`, { method: 'POST' }),
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

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

  oracle = await openDb()

  // ── Auth gates ──
  console.log('\n[auth]')
  check('unauthenticated list rejected', (await fetch(`${BASE}/api/chat/scheduled`)).status === 401)
  const anonCreate = await fetch(`${BASE}/api/chat/scheduled`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'nope', scheduledFor: new Date(Date.now() + 3_600_000).toISOString() }),
  })
  check('unauthenticated create rejected', anonCreate.status === 401, `status ${anonCreate.status}`)
  check('unauthenticated dispatch rejected',
    (await fetch(`${BASE}/api/chat/scheduled/dispatch`)).status === 401)

  console.log(`\nLogging in as ${EMAIL}`)
  const csrfRes = await jarFetch(`${BASE}/api/auth/csrf`)
  const { csrfToken } = csrfRes.headers.get('content-type')?.includes('json') ? await csrfRes.json() : {}
  check('csrf token issued', Boolean(csrfToken),
    `is ${BASE} really the WBR web app? got ${csrfRes.status}`)
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

  // ── Validation ──
  console.log('\n[validation]')
  const inAnHour = new Date(Date.now() + 3_600_000).toISOString()
  check('empty message → 400', (await api.create('', inAnHour)).status === 400)
  check('past time → 400',
    (await api.create(`${MARKER} past`, new Date(Date.now() - 60_000).toISOString())).status === 400)
  check('over one year out → 400',
    (await api.create(`${MARKER} far`, new Date(Date.now() + 370 * 86_400_000).toISOString())).status === 400)

  // ── Create ──
  console.log('\n[create]')
  const contentA = `${MARKER} queue item`
  const createRes = await api.create(contentA, inAnHour)
  check('create → 201', createRes.status === 201, `status ${createRes.status}`)
  const created = (await createRes.json()).scheduled
  check('created row is PENDING', created?.status === 'PENDING', JSON.stringify(created))
  check('created row echoes content + time',
    created?.content === contentA && new Date(created?.scheduledFor).toISOString() === inAnHour)

  const listRes = await api.list()
  check('list → 200', listRes.status === 200, `status ${listRes.status}`)
  const list = await listRes.json()
  check('created item in pending queue', list.pending?.some(p => p.id === created.id))

  const dbRow = await oracle.execute({
    sql: 'SELECT status FROM ScheduledMessage WHERE id = ?',
    args: [created.id],
  })
  check('oracle: row persisted as PENDING', dbRow.rows[0]?.status === 'PENDING',
    JSON.stringify(dbRow.rows))

  // ── Edit ──
  console.log('\n[edit]')
  const newTime = new Date(Date.now() + 7_200_000).toISOString()
  const contentEdited = `${MARKER} queue item (edited)`
  const patchRes = await api.patch(created.id, { message: contentEdited, scheduledFor: newTime })
  check('edit → 200', patchRes.status === 200, `status ${patchRes.status}`)
  const patched = (await patchRes.json()).scheduled
  check('edit reflected', patched?.content === contentEdited &&
    new Date(patched?.scheduledFor).toISOString() === newTime, JSON.stringify(patched))
  check('edit with past time → 400',
    (await api.patch(created.id, { scheduledFor: new Date(Date.now() - 60_000).toISOString() })).status === 400)
  check('edit of unknown id → 404',
    (await api.patch('nonexistent-id-xyz', { message: 'x' })).status === 404)

  // ── Cancel ──
  console.log('\n[cancel]')
  const cancelRes = await api.cancel(created.id)
  check('cancel → 200', cancelRes.status === 200, `status ${cancelRes.status}`)
  const afterCancel = await (await api.list()).json()
  check('canceled item left the pending queue', !afterCancel.pending?.some(p => p.id === created.id))
  const canceledRow = await oracle.execute({
    sql: 'SELECT status FROM ScheduledMessage WHERE id = ?',
    args: [created.id],
  })
  check('oracle: row is CANCELED', canceledRow.rows[0]?.status === 'CANCELED')
  check('double cancel → 409', (await api.cancel(created.id)).status === 409)
  check('edit after cancel → 409', (await api.patch(created.id, { message: 'x' })).status === 409)
  check('cancel of unknown id → 404', (await api.cancel('nonexistent-id-xyz')).status === 404)

  // ── Delivery ──
  console.log('\n[delivery]')
  const contentB = `${MARKER} due soon`
  const dueTime = new Date(Date.now() + 6_000).toISOString()
  const dueRes = await api.create(contentB, dueTime)
  check('due-soon create → 201', dueRes.status === 201, `status ${dueRes.status}`)
  const due = (await dueRes.json()).scheduled

  console.log('  … waiting 8s for it to come due')
  await sleep(8_000)
  const tickList = await (await api.list()).json() // GET runs the dispatch tick
  check('delivered item left the pending queue', !tickList.pending?.some(p => p.id === due.id))
  const inHistory = tickList.history?.find(h => h.id === due.id)
  check('delivered item in history as SENT', inHistory?.status === 'SENT', JSON.stringify(inHistory))

  const sentRow = await oracle.execute({
    sql: 'SELECT status, sentMessageId FROM ScheduledMessage WHERE id = ?',
    args: [due.id],
  })
  check('oracle: row SENT with sentMessageId', sentRow.rows[0]?.status === 'SENT' && !!sentRow.rows[0]?.sentMessageId)
  if (sentRow.rows[0]?.sentMessageId) {
    const msgRow = await oracle.execute({
      sql: 'SELECT roomId, content FROM Message WHERE id = ?',
      args: [sentRow.rows[0].sentMessageId],
    })
    check('oracle: real Message created in room-general',
      msgRow.rows[0]?.roomId === 'room-general' && msgRow.rows[0]?.content === contentB,
      JSON.stringify(msgRow.rows))
  }

  const chatData = await (await jarFetch(`${BASE}/api/data/chat`)).json()
  check('delivered message visible in /api/data/chat (cache revalidated)',
    chatData.recentMessages?.some(m => m.content === contentB),
    `recent: ${JSON.stringify((chatData.recentMessages ?? []).slice(-3).map(m => m.content))}`)

  // ── Dispatch endpoint ──
  console.log('\n[dispatch endpoint]')
  const dispatchRes = await api.dispatch()
  check('staff dispatch → 200', dispatchRes.status === 200, `status ${dispatchRes.status}`)
  const dispatchBody = await dispatchRes.json()
  check('dispatch reports counters', dispatchBody.ok === true &&
    typeof dispatchBody.due === 'number' && typeof dispatchBody.sent === 'number')
}

try {
  await main()
} catch (e) {
  failures++
  console.error(`\n  ✗ unexpected error — ${e.message}`)
} finally {
  // Remove every row this run created (messages first, then scheduled rows).
  try {
    if (oracle) {
      await oracle.execute({ sql: 'DELETE FROM Message WHERE content LIKE ?', args: [`%${MARKER}%`] })
      await oracle.execute({ sql: 'DELETE FROM ScheduledMessage WHERE content LIKE ?', args: [`%${MARKER}%`] })
    }
  } catch (e) {
    console.error('cleanup failed:', e.message)
  }
  if (serverProc) {
    console.log('\nStopping dev server...')
    try { process.kill(-serverProc.pid, 'SIGTERM') } catch {}
  }
}

console.log(failures === 0 ? '\nSCHEDULED MESSAGES API TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
