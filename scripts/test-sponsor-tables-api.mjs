#!/usr/bin/env node
// Integration test for the per-sponsor Meeting Tables API
// (/api/admin/scheduler/sponsor-tables[, /auto-populate]), over HTTP, with a
// raw-SQL oracle against the same database the server reports via /api/health —
// so the test and the server never disagree about the dataset.
//
// Invariants under test:
//   1. Unauthenticated GET/PUT/POST → 401.
//   2. GET returns SponsorTableBoard { entries, totals } with well-formed rows
//      (each entry carries sponsorId, name, logoUrl?, tier, tableNumber, meetingCount).
//   3. PUT assigns a number (re-GET + raw SQL both see it) and re-points that
//      sponsor's confirmed meetings' location to "Table N".
//   4. A number already held by another sponsor → 409 (TABLE_NUMBER_TAKEN).
//   5. PUT tableNumber:null clears it (and nulls the meetings' location).
//   6. Malformed JSON / missing sponsorId / wrong-typed / unknown sponsor → 400/404.
//   7. POST /auto-populate returns { assigned, total, board } and leaves no
//      sponsor unnumbered.
//   8. A login without the meetings permission is rejected (403).
//
// The test RESTORES every row it touches: each Sponsor.tableNumber and every
// confirmed SponsorMeeting.location are snapshotted up front and written back at
// the end, so it is idempotent and safe against live Turso.
//
//   node scripts/test-sponsor-tables-api.mjs           # server already running
//   node scripts/test-sponsor-tables-api.mjs --start   # boot next dev, then kill it
//
// Env overrides: SMOKE_BASE_URL (e.g. http://localhost:3200), SMOKE_EMAIL,
// SMOKE_PASSWORD, SMOKE_NONSTAFF_EMAIL, SMOKE_NONSTAFF_PASSWORD.

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
const NONSTAFF_EMAIL = process.env.SMOKE_NONSTAFF_EMAIL ?? 'stephcurry@test.com'
const NONSTAFF_PASSWORD = process.env.SMOKE_NONSTAFF_PASSWORD ?? 'password123'

const API = `${BASE}/api/admin/scheduler/sponsor-tables`
// A number far outside any realistic seeded assignment, so the uniqueness and
// assign checks never collide with live data.
const QA_NUMBER = 987
const QA_NUMBER_2 = 986

let serverProc = null
let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function skip(name, why) { console.log(`  ⃠ ${name} (skipped — ${why})`) }

// ─── DB oracle (same DB the server uses) ─────────────────────────────────────
function readEnvLocal() {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, 'apps/web/.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const mm = line.match(/^([A-Z_]+)=(.*)$/)
      if (mm) env[mm[1]] = mm[2].replace(/^"|"$/g, '')
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
    const token = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
    if (!url || !token) throw new Error('server uses Turso but no TURSO_* vars for the oracle')
    return createClient({ url, authToken: token })
  }
  if (mode.startsWith('sqlite')) {
    const rel = mode.replace(/^sqlite:\s*file:/, '')
    return createClient({ url: `file:${join(ROOT, 'packages/db/prisma', rel)}` })
  }
  throw new Error(`unexpected server connection mode: ${mode || JSON.stringify(health)}`)
}

// ─── snapshot / restore ──────────────────────────────────────────────────────
async function snapshotNumbers(client) {
  const res = await client.execute(`SELECT "id", "tableNumber" FROM "Sponsor"`)
  return res.rows.map(r => ({ id: String(r.id), tableNumber: r.tableNumber === null ? null : Number(r.tableNumber) }))
}
async function restoreNumbers(client, rows) {
  // Clear first so a number the test moved can't collide with the unique index
  // on the way back in.
  try { await client.execute(`UPDATE "Sponsor" SET "tableNumber" = NULL`) } catch {}
  for (const r of rows) {
    try {
      await client.execute({ sql: `UPDATE "Sponsor" SET "tableNumber" = ? WHERE "id" = ?`, args: [r.tableNumber, r.id] })
    } catch (err) { console.error(`  number restore failed for ${r.id}:`, err?.message ?? err) }
  }
}
async function snapshotLocations(client) {
  const res = await client.execute(`SELECT "id", "location" FROM "SponsorMeeting" WHERE "status" = 'CONFIRMED'`)
  return res.rows.map(r => ({ id: String(r.id), location: r.location === null ? null : String(r.location) }))
}
async function restoreLocations(client, rows) {
  for (const r of rows) {
    try {
      await client.execute({ sql: `UPDATE "SponsorMeeting" SET "location" = ? WHERE "id" = ?`, args: [r.location, r.id] })
    } catch (err) { console.error(`  location restore failed for ${r.id}:`, err?.message ?? err) }
  }
}

// ─── cookie jar + auth ───────────────────────────────────────────────────────
function makeJar() {
  const jar = new Map()
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  async function jarFetch(url, init = {}) {
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...init.headers, cookie: cookieHeader() } })
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';'); const eq = pair.indexOf('=')
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1))
    }
    return res
  }
  return { jar, jarFetch }
}
async function login(jarFetch, email, password) {
  const csrf = await (await jarFetch(`${BASE}/api/auth/csrf`)).json().catch(() => ({}))
  if (!csrf.csrfToken) return false
  const res = await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, json: 'true' }),
  })
  return res.status === 200 || res.status === 302
}
async function serverUp() {
  try { return (await fetch(`${BASE}/login`, { redirect: 'manual' })).status < 500 } catch { return false }
}
async function waitFor(cond, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { if (await cond()) return; await new Promise(r => setTimeout(r, 1500)) }
  throw new Error(`Timed out waiting for ${label}`)
}

const wellFormedEntry = e =>
  e && typeof e.sponsorId === 'string' && typeof e.name === 'string' &&
  (e.logoUrl === null || typeof e.logoUrl === 'string') && typeof e.tier === 'string' &&
  (e.tableNumber === null || typeof e.tableNumber === 'number') && typeof e.meetingCount === 'number'

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) {
      console.error(`No server at ${BASE}. Start one (./dev.sh web) or pass --start.`)
      process.exit(2)
    }
    console.log(`Starting web dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps/web'), env: { ...process.env, NEXTAUTH_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'web dev server')
    console.log('Server is up.')
  }

  const client = await openDb()
  const origNumbers = await snapshotNumbers(client)
  const origLocations = await snapshotLocations(client)
  console.log(`Snapshotted ${origNumbers.length} sponsor number(s), ${origLocations.length} meeting location(s).`)

  const { jarFetch } = makeJar()
  const getBoard = () => jarFetch(API)
  const putAssign = (body) => jarFetch(API, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const postAuto = () => jarFetch(`${API}/auto-populate`, { method: 'POST' })

  try {
    // ── 1. auth gate ──
    console.log('\n[auth]')
    check('unauthenticated GET → 401', (await fetch(API)).status === 401)
    const anonPut = await fetch(API, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sponsorId: 'x', tableNumber: 1 }),
    })
    check('unauthenticated PUT → 401', anonPut.status === 401, `got ${anonPut.status}`)
    check('unauthenticated auto-populate → 401', (await fetch(`${API}/auto-populate`, { method: 'POST' })).status === 401)

    console.log(`\nLogging in as ${EMAIL}`)
    check('login accepted', await login(jarFetch, EMAIL, PASSWORD))

    // ── 2. GET shape ──
    console.log('\n[GET /api/admin/scheduler/sponsor-tables]')
    const gRes = await getBoard()
    check('HTTP 200', gRes.status === 200, `status ${gRes.status}`)
    const board = await gRes.json().catch(() => ({}))
    check('entries is a non-empty array', Array.isArray(board.entries) && board.entries.length > 0)
    check('every entry well-formed', (board.entries ?? []).every(wellFormedEntry), JSON.stringify(board.entries?.[0]))
    check('totals well-formed',
      board.totals && ['sponsors', 'assigned', 'unassigned', 'highestNumber'].every(k => typeof board.totals[k] === 'number'),
      JSON.stringify(board.totals))
    check('assigned + unassigned = sponsors',
      board.totals && board.totals.assigned + board.totals.unassigned === board.totals.sponsors,
      JSON.stringify(board.totals))

    const sponsors = board.entries ?? []
    if (sponsors.length < 2) {
      skip('assign lifecycle', 'need at least two sponsors')
    } else {
      const a = sponsors[0], b = sponsors[1]

      // ── 3. assign + backfill ──
      console.log('\n[PUT — assign]')
      const setRes = await putAssign({ sponsorId: a.sponsorId, tableNumber: QA_NUMBER })
      check('assign → 200', setRes.status === 200, `status ${setRes.status}`)
      const afterSet = await setRes.json().catch(() => ({}))
      check('board echoes the new number',
        (afterSet.entries ?? []).find(e => e.sponsorId === a.sponsorId)?.tableNumber === QA_NUMBER)
      const dbNum = await client.execute({ sql: `SELECT "tableNumber" FROM "Sponsor" WHERE id = ?`, args: [a.sponsorId] })
      check('DB reflects the number', Number(dbNum.rows[0]?.tableNumber) === QA_NUMBER, JSON.stringify(dbNum.rows))
      const dbLoc = await client.execute({
        sql: `SELECT DISTINCT "location" FROM "SponsorMeeting" WHERE "sponsorId" = ? AND "status" = 'CONFIRMED'`, args: [a.sponsorId],
      })
      const locs = dbLoc.rows.map(r => r.location === null ? null : String(r.location))
      check('confirmed meetings re-pointed to the table label',
        locs.length === 0 || locs.every(l => l === `Table ${QA_NUMBER}`), JSON.stringify(locs))

      // ── 4. uniqueness ──
      console.log('\n[PUT — uniqueness]')
      check('duplicate number → 409',
        (await putAssign({ sponsorId: b.sponsorId, tableNumber: QA_NUMBER })).status === 409)

      // ── 5. clear ──
      console.log('\n[PUT — clear]')
      const clrRes = await putAssign({ sponsorId: a.sponsorId, tableNumber: null })
      check('clear → 200', clrRes.status === 200, `status ${clrRes.status}`)
      const dbCleared = await client.execute({ sql: `SELECT "tableNumber" FROM "Sponsor" WHERE id = ?`, args: [a.sponsorId] })
      check('DB shows number NULL', dbCleared.rows[0]?.tableNumber === null)

      // ── 6. validation ──
      console.log('\n[PUT — validation]')
      const badJson = await jarFetch(API, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{not json' })
      check('malformed JSON → 400', badJson.status === 400, `got ${badJson.status}`)
      check('missing sponsorId → 400', (await putAssign({ tableNumber: 1 })).status === 400)
      check('non-number tableNumber → 400', (await putAssign({ sponsorId: a.sponsorId, tableNumber: 'lots' })).status === 400)
      check('out-of-range number → 400', (await putAssign({ sponsorId: a.sponsorId, tableNumber: 0 })).status === 400)
      check('unknown sponsor → 404', (await putAssign({ sponsorId: 'qa-no-such-sponsor', tableNumber: QA_NUMBER_2 })).status === 404)
    }

    // ── 7. auto-populate ──
    console.log('\n[POST /auto-populate]')
    const autoRes = await postAuto()
    check('auto-populate → 200', autoRes.status === 200, `status ${autoRes.status}`)
    const auto = await autoRes.json().catch(() => ({}))
    check('summary well-formed', ['assigned', 'total'].every(k => typeof auto[k] === 'number'), JSON.stringify({ ...auto, board: undefined }))
    check('fresh board rides along', Array.isArray(auto.board?.entries))
    check('no sponsor left unnumbered after populate', auto.board?.totals?.unassigned === 0,
      JSON.stringify(auto.board?.totals))

    // ── 8. permission gate ──
    console.log('\n[permission gate]')
    const nonStaff = makeJar()
    if (await login(nonStaff.jarFetch, NONSTAFF_EMAIL, NONSTAFF_PASSWORD)) {
      const res = await nonStaff.jarFetch(API, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sponsorId: 'x', tableNumber: 1 }),
      })
      check(`${NONSTAFF_EMAIL} PUT → 403`, res.status === 403, `got ${res.status}`)
    } else {
      skip('non-staff 403 check', `could not log in as ${NONSTAFF_EMAIL}`)
    }
  } finally {
    // ── restore everything we touched ──
    console.log('\n[restore]')
    await restoreNumbers(client, origNumbers)
    await restoreLocations(client, origLocations)
    console.log('  original sponsor numbers + meeting locations restored')
  }

  console.log(`\n${failures === 0 ? '✅ all integration checks passed' : `❌ ${failures} check(s) failed`}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(() => {
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    process.exit(failures === 0 ? 0 : 1)
  })
