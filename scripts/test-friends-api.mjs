#!/usr/bin/env node
// Acceptance test for the friend-request system over HTTP against the
// attendee app. Follows the same harness conventions as
// test-home-feed-api.mjs: cookie-jar credential login, raw-SQL oracle opened
// against the database the server reports (via /api/debug), --start server
// lifecycle, exit 0/1/2.
//
// What this verifies:
//   1. Auth: unauthenticated GET/POST /api/friend/[userId] and DM-room
//      creation are 401s.
//   2. Request: A sees 'none' → POST (auto) → 'pending_outgoing'; B sees
//      'pending_incoming'; /api/data/people gives B the request in
//      incomingRequests + friendStatuses; friendIds stays mutual-only
//      (oracle-checked: exactly one Follow edge, A→B).
//   3. DM gate: POST /api/chat/rooms while merely pending → 403 with
//      code NOT_FRIENDS.
//   4. Accept: B accepts → 'friends' both sides; /api/data/people friendIds
//      now mutual and contains each other; two Follow edges (oracle-checked).
//   5. DMs once friends: room create 200 (idempotent, both directions),
//      posting into the room and reading it back through
//      /api/chat/rooms/[roomId]/messages works.
//   6. Guardrails: friending yourself 400, unknown target 404; the old
//      /api/follow/[userId] route is gone (POST → 404/405).
//   7. Remove: unfriend → 'none' both sides, edges gone (oracle-checked),
//      but POST /api/chat/rooms still returns the EXISTING room (same id,
//      not 403) — existing conversations keep working.
//
//   node scripts/test-friends-api.mjs           # server already on :3001
//   node scripts/test-friends-api.mjs --start   # boot `next dev`, then kill it
//
// Env overrides: SMOKE_BASE_URL, plus SMOKE_EMAIL / SMOKE_PASSWORD for the
// bootstrap account that opens the oracle (any valid login works).
// The two friend-test users are DEDICATED rows this run inserts directly in
// the database (scrypt-hashed passwords, same format as hashPassword in
// packages/db/src/index.ts) and removes — along with every Follow edge, DM
// room, and message this run created — in teardown.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomBytes, scrypt as scryptCb } from 'node:crypto'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3001'
const PORT = new URL(BASE).port || '3001'
const BOOTSTRAP_EMAIL = process.env.SMOKE_EMAIL ?? 'wbr@test.com'
const BOOTSTRAP_PASSWORD = process.env.SMOKE_PASSWORD ?? 'password123'
const RUN = `${process.pid}-${Date.now()}`
const MARKER = `[friends-test ${RUN}]`

// Dedicated test users — inserted by this run, removed in teardown.
const USER_A = { id: `friendtest-a-${RUN}`, email: `friend-a-${RUN}@apitest.local`, name: 'Friend Test A', password: 'friendtest-a-pw' }
const USER_B = { id: `friendtest-b-${RUN}`, email: `friend-b-${RUN}@apitest.local`, name: 'Friend Test B', password: 'friendtest-b-pw' }

let serverProc = null
let failures = 0
let oracle = null
let usersSeeded = false
let dmRoomId = null

function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Password hashing (mirrors hashPassword in packages/db/src/index.ts) ─────

function scryptAsync(password, salt, keylen, opts) {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const buf = await scryptAsync(password, salt, 64, { N: 2048, r: 8, p: 1 })
  return `${buf.toString('hex')}.${salt}.2048`
}

// ─── Cookie jars (one per signed-in user) ─────────────────────────────────────

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
    jarFetch.hasSession = [...jar.keys()].some(k => k.includes('next-auth.session-token'))
    return res
  }
}

async function login(jarFetch, email, password) {
  const csrfRes = await jarFetch(`${BASE}/api/auth/csrf`)
  const { csrfToken } = csrfRes.headers.get('content-type')?.includes('json') ? await csrfRes.json() : {}
  check(`csrf token issued (${email})`, Boolean(csrfToken),
    `is ${BASE} really the WBR attendee app? got ${csrfRes.status}`)
  if (!csrfToken) return false
  const loginRes = await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
  })
  check(`login accepted (${email})`, loginRes.status === 200 || loginRes.status === 302,
    `status ${loginRes.status}`)
  check(`session cookie set (${email})`, jarFetch.hasSession, 'wrong credentials?')
  return jarFetch.hasSession
}

// ─── Oracle: open the same database the server reports ───────────────────────

function readEnvLocal() {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, 'apps/attendee/.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}

async function openDb(jarFetch) {
  const debug = await (await jarFetch(`${BASE}/api/debug`)).json()
  const modeStep = (debug.steps ?? []).find(s => s.startsWith('DB mode: '))
  const mode = modeStep ? modeStep.slice('DB mode: '.length) : ''
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
    const path = mode.replace(/^sqlite:\s*file:/, '')
    const resolved = path.startsWith('/') ? path : join(ROOT, 'apps/attendee', path)
    return createClient({ url: `file:${resolved}` })
  }
  throw new Error(`unexpected server connection mode: ${mode || JSON.stringify(debug)}`)
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

// ─── Request helpers ─────────────────────────────────────────────────────────

const friendUrl = id => `${BASE}/api/friend/${id}`
const postJson = (jarFetch, url, body) =>
  jarFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
const friendPost = (jarFetch, targetId, action) =>
  postJson(jarFetch, friendUrl(targetId), action ? { action } : {})
const friendStatusOf = async (jarFetch, targetId) => {
  const res = await jarFetch(friendUrl(targetId))
  return res.status === 200 ? (await res.json()).status : `HTTP ${res.status}`
}
const createRoom = (jarFetch, targetUserId) =>
  postJson(jarFetch, `${BASE}/api/chat/rooms`, { targetUserId })
const peopleOf = async jarFetch => (await jarFetch(`${BASE}/api/data/people`)).json()

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) {
      console.error(`No server at ${BASE}. Start one (npx next dev -p ${PORT} in apps/attendee) or pass --start.`)
      process.exit(2)
    }
    console.log(`Starting attendee dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps/attendee'),
      env: { ...process.env, NEXTAUTH_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    serverProc.stdout.on('data', () => {})
    serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'attendee dev server')
    console.log('Server is up.')
  }

  // ── Auth gates ──
  console.log('\n[auth]')
  check('unauthenticated friend-status read rejected',
    (await fetch(friendUrl('whoever'))).status === 401)
  const anonFriend = await fetch(friendUrl('whoever'), { method: 'POST' })
  check('unauthenticated friend action rejected', anonFriend.status === 401,
    `status ${anonFriend.status}`)
  const anonRoom = await fetch(`${BASE}/api/chat/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targetUserId: 'whoever' }),
  })
  check('unauthenticated DM-room create rejected', anonRoom.status === 401,
    `status ${anonRoom.status}`)

  // ── Bootstrap login (only to open the oracle), then seed dedicated users ──
  console.log(`\nLogging in as ${BOOTSTRAP_EMAIL} (bootstrap, oracle only)`)
  const bootstrap = makeJar()
  if (!(await login(bootstrap, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD))) return
  oracle = await openDb(bootstrap)

  console.log(`\nSeeding dedicated test users ${USER_A.email} and ${USER_B.email}`)
  const now = Date.now()
  for (const u of [USER_A, USER_B]) {
    await oracle.execute({
      sql: `INSERT INTO User (id, name, email, role, password, createdAt, updatedAt)
            VALUES (?, ?, ?, 'ATTENDEE', ?, ?, ?)`,
      args: [u.id, u.name, u.email, await hashPassword(u.password), now, now],
    })
  }
  usersSeeded = true
  const idA = USER_A.id
  const idB = USER_B.id

  const userA = makeJar()
  const userB = makeJar()
  if (!(await login(userA, USER_A.email, USER_A.password))) return
  if (!(await login(userB, USER_B.email, USER_B.password))) return

  const pairEdges = async () => {
    const rows = await oracle.execute({
      sql: `SELECT followerId, followingId FROM Follow
            WHERE (followerId = ? AND followingId = ?) OR (followerId = ? AND followingId = ?)`,
      args: [idA, idB, idB, idA],
    })
    return rows.rows
  }

  // ── Friend request: A → B ──
  console.log('\n[friend request]')
  check('A sees status none before anything happens',
    (await friendStatusOf(userA, idB)) === 'none')

  const reqRes = await friendPost(userA, idB) // auto: none → request
  check('POST with no action → request accepted', reqRes.status === 200, `status ${reqRes.status}`)
  const reqBody = await reqRes.json().catch(() => ({}))
  check('request response reports pending_outgoing', reqBody?.status === 'pending_outgoing',
    JSON.stringify(reqBody))
  check('A GET now shows pending_outgoing', (await friendStatusOf(userA, idB)) === 'pending_outgoing')
  check('B GET shows pending_incoming', (await friendStatusOf(userB, idA)) === 'pending_incoming')

  const edgesPending = await pairEdges()
  check('oracle: exactly one Follow edge (A→B) while pending',
    edgesPending.length === 1 && edgesPending[0].followerId === idA && edgesPending[0].followingId === idB,
    JSON.stringify(edgesPending))

  const peopleB = await peopleOf(userB)
  check('B /api/data/people lists A in incomingRequests',
    Array.isArray(peopleB.incomingRequests) && peopleB.incomingRequests.some(u => u.id === idA),
    JSON.stringify(peopleB.incomingRequests ?? null).slice(0, 200))
  check('B friendStatuses maps A → pending_incoming',
    peopleB.friendStatuses?.[idA] === 'pending_incoming',
    JSON.stringify(peopleB.friendStatuses ?? null).slice(0, 200))
  check('B friendIds stays mutual-only (no pending A)',
    Array.isArray(peopleB.friendIds) && !peopleB.friendIds.includes(idA))
  const peopleA = await peopleOf(userA)
  check('A friendStatuses maps B → pending_outgoing',
    peopleA.friendStatuses?.[idB] === 'pending_outgoing')
  check('A friendIds stays mutual-only (no pending B)',
    Array.isArray(peopleA.friendIds) && !peopleA.friendIds.includes(idB))

  // ── DM gate while merely pending ──
  console.log('\n[dm gate while pending]')
  const gated = await createRoom(userA, idB)
  check('DM attempt while pending → 403', gated.status === 403, `status ${gated.status}`)
  const gatedBody = await gated.json().catch(() => ({}))
  check('403 body carries code NOT_FRIENDS', gatedBody?.code === 'NOT_FRIENDS',
    JSON.stringify(gatedBody))

  // ── Accept: B → friends ──
  console.log('\n[accept]')
  const accRes = await friendPost(userB, idA, 'accept')
  check('B accept → 200', accRes.status === 200, `status ${accRes.status}`)
  const accBody = await accRes.json().catch(() => ({}))
  check('accept response reports friends', accBody?.status === 'friends', JSON.stringify(accBody))
  check('A GET shows friends', (await friendStatusOf(userA, idB)) === 'friends')
  check('B GET shows friends', (await friendStatusOf(userB, idA)) === 'friends')
  check('oracle: two Follow edges once friends', (await pairEdges()).length === 2)

  const peopleA2 = await peopleOf(userA)
  const peopleB2 = await peopleOf(userB)
  check('A friendIds now contains B', peopleA2.friendIds?.includes(idB) === true,
    JSON.stringify(peopleA2.friendIds ?? null).slice(0, 200))
  check('B friendIds now contains A', peopleB2.friendIds?.includes(idA) === true)
  check('friends list carries the counterpart projection',
    Array.isArray(peopleA2.friends) && peopleA2.friends.some(u => u.id === idB))
  check('B incomingRequests no longer lists A',
    Array.isArray(peopleB2.incomingRequests) && !peopleB2.incomingRequests.some(u => u.id === idA))
  check('friendStatuses report friends on both sides',
    peopleA2.friendStatuses?.[idB] === 'friends' && peopleB2.friendStatuses?.[idA] === 'friends')

  // ── DMs once friends ──
  console.log('\n[dm once friends]')
  const roomRes = await createRoom(userA, idB)
  check('DM room create → 200 once friends', roomRes.status === 200, `status ${roomRes.status}`)
  const room = await roomRes.json()
  check('room payload has an id', typeof room?.id === 'string' && room.id.length > 0,
    JSON.stringify(room).slice(0, 200))
  dmRoomId = room?.id ?? null
  const roomAgain = await (await createRoom(userA, idB)).json()
  check('second create returns the same room (idempotent)', roomAgain?.id === room.id)
  const roomFromB = await (await createRoom(userB, idA)).json()
  check('reverse direction resolves to the same room', roomFromB?.id === room.id)

  const dmContent = `${MARKER} hello new friend`
  const dmPost = await postJson(userA, `${BASE}/api/chat/rooms/${room.id}/messages`, { content: dmContent })
  check('A can post into the DM room', dmPost.ok, `status ${dmPost.status}`)
  const dmMsg = await dmPost.json().catch(() => ({}))
  const bRead = await userB(`${BASE}/api/chat/rooms/${room.id}/messages`)
  check('B can read the DM room', bRead.status === 200, `status ${bRead.status}`)
  const bMessages = await bRead.json().catch(() => [])
  check("B sees A's message", Array.isArray(bMessages) && bMessages.some(m => m.id === dmMsg?.id))

  // ── Guardrails ──
  console.log('\n[guardrails]')
  const selfRes = await friendPost(userA, idA, 'request')
  check('friending yourself → 400', selfRes.status === 400, `status ${selfRes.status}`)
  const ghostRes = await friendPost(userA, 'no-such-user-xyz')
  check('unknown target → 404', ghostRes.status === 404, `status ${ghostRes.status}`)
  const oldRoute = await postJson(userA, `${BASE}/api/follow/${idB}`, {})
  check('old /api/follow route is gone (404/405)',
    oldRoute.status === 404 || oldRoute.status === 405, `status ${oldRoute.status}`)

  // ── Remove: unfriend, but the existing room keeps working ──
  console.log('\n[remove]')
  const rmRes = await friendPost(userA, idB, 'remove')
  check('remove → 200', rmRes.status === 200, `status ${rmRes.status}`)
  const rmBody = await rmRes.json().catch(() => ({}))
  check('remove response reports none', rmBody?.status === 'none', JSON.stringify(rmBody))
  check('A GET shows none after remove', (await friendStatusOf(userA, idB)) === 'none')
  check('B GET shows none after remove', (await friendStatusOf(userB, idA)) === 'none')
  check('oracle: both Follow edges gone', (await pairEdges()).length === 0)

  const survivorRes = await createRoom(userA, idB)
  check('existing DM room still opens after unfriend (200, not 403)',
    survivorRes.status === 200, `status ${survivorRes.status}`)
  const survivor = await survivorRes.json().catch(() => ({}))
  check('and it is the SAME room, not a new one', survivor?.id === room.id,
    `${survivor?.id} vs ${room.id}`)
  const survivorFromB = await createRoom(userB, idA)
  check('B can still open it too', survivorFromB.status === 200 &&
    (await survivorFromB.json().catch(() => ({})))?.id === room.id)
}

try {
  await main()
} catch (e) {
  failures++
  console.error(`\n  ✗ unexpected error — ${e.message}`)
} finally {
  // Remove every row this run created: messages + room first, then Follow
  // edges, then the dedicated users. The oracle's raw SQL doesn't run with
  // foreign_keys ON, so cascades can't be relied on.
  try {
    if (oracle && usersSeeded) {
      if (dmRoomId) {
        await oracle.execute({ sql: 'DELETE FROM Message WHERE roomId = ?', args: [dmRoomId] })
        await oracle.execute({ sql: 'DELETE FROM ChatMember WHERE roomId = ?', args: [dmRoomId] })
        await oracle.execute({ sql: 'DELETE FROM ChatRoom WHERE id = ?', args: [dmRoomId] })
      }
      await oracle.execute({
        sql: 'DELETE FROM Follow WHERE followerId IN (?, ?) OR followingId IN (?, ?)',
        args: [USER_A.id, USER_B.id, USER_A.id, USER_B.id],
      })
      // Any stray memberships/messages (defensive — the run only writes the DM room).
      await oracle.execute({
        sql: 'DELETE FROM Message WHERE senderId IN (?, ?)',
        args: [USER_A.id, USER_B.id],
      })
      await oracle.execute({
        sql: 'DELETE FROM ChatMember WHERE userId IN (?, ?)',
        args: [USER_A.id, USER_B.id],
      })
      await oracle.execute({
        sql: 'DELETE FROM User WHERE id IN (?, ?)',
        args: [USER_A.id, USER_B.id],
      })
    }
  } catch (e) {
    console.error('cleanup failed:', e.message)
  }
  if (serverProc) {
    console.log('\nStopping dev server...')
    try { process.kill(-serverProc.pid, 'SIGTERM') } catch {}
  }
}

console.log(failures === 0 ? '\nFRIENDS API TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
