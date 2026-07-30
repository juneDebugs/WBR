#!/usr/bin/env node
// Integration test for the Meeting Tables API
// (/api/admin/scheduler/tables[, /assign, /auto-assign]), over HTTP, with a
// raw-SQL oracle against the same database the server reports via /api/health
// — so the test and the server never disagree about the dataset.
//
// Invariants under test:
//   1. Unauthenticated GET/PUT/POST → 401.
//   2. GET returns TableBoard { tables, days, totals } with well-formed rows.
//   3. PUT op:add persists (re-GET + raw SQL both see the row); duplicate → 409.
//   4. PUT op:update renames/resizes; unknown table → 404.
//   5. PUT op:remove deletes; removing it again → 404.
//   6. Malformed JSON / bad op / wrong-typed fields → 400.
//   7. /assign clears and restores one meeting's table (board + DB agree);
//      unknown table → 400; unknown meeting → 404.
//   8. /auto-assign returns a placement summary + board and leaves no
//      unassigned meeting behind when tables have room.
//   9. A login without the meetings permission is rejected (403).
//
// The test RESTORES every row it touches: the full MeetingTableSetting row set
// and every confirmed SponsorMeeting.location are snapshotted up front and
// written back at the end, so it is idempotent and safe against live Turso.
//
//   node scripts/test-meeting-tables-api.mjs           # server already running
//   node scripts/test-meeting-tables-api.mjs --start   # boot next dev, then kill it
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

const API = `${BASE}/api/admin/scheduler/tables`
const TEST_TABLE = 'QA Smoke Table'
const TEST_TABLE_RENAMED = 'QA Smoke Table 2'

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
async function snapshotInventory(client) {
  try {
    const res = await client.execute(`SELECT "name", "capacity", "position", "updatedAt" FROM "MeetingTableSetting"`)
    return res.rows.map(r => ({
      name: String(r.name), capacity: Number(r.capacity), position: Number(r.position), updatedAt: String(r.updatedAt),
    }))
  } catch { return [] } // table may not exist yet — restore then means "delete all"
}
async function restoreInventory(client, rows) {
  try {
    await client.execute(`DELETE FROM "MeetingTableSetting"`)
    for (const r of rows) {
      await client.execute({
        sql: `INSERT INTO "MeetingTableSetting" ("name", "capacity", "position", "updatedAt") VALUES (?, ?, ?, ?)`,
        args: [r.name, r.capacity, r.position, r.updatedAt],
      })
    }
  } catch (err) { console.error('  inventory restore failed:', err?.message ?? err) }
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

const wellFormedTable = t =>
  t && typeof t.name === 'string' && typeof t.capacity === 'number' && typeof t.assignedCount === 'number'
const wellFormedMeeting = m =>
  m && typeof m.sponsorMeetingId === 'string' && typeof m.sponsorName === 'string' &&
  typeof m.attendeeName === 'string' && (m.table === null || typeof m.table === 'string') &&
  typeof m.tableKnown === 'boolean'

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
  const origInventory = await snapshotInventory(client)
  const origLocations = await snapshotLocations(client)
  console.log(`Snapshotted ${origInventory.length} inventory row(s), ${origLocations.length} meeting location(s).`)

  const { jarFetch } = makeJar()
  const getBoard = () => jarFetch(API)
  const putOp = (body) => jarFetch(API, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const putAssign = (body) => jarFetch(`${API}/assign`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const postAuto = (body) => jarFetch(`${API}/auto-assign`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

  try {
    // ── 1. auth gate ──
    console.log('\n[auth]')
    check('unauthenticated GET → 401', (await fetch(API)).status === 401)
    const anonPut = await fetch(API, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'add', name: 'x' }),
    })
    check('unauthenticated PUT → 401', anonPut.status === 401, `got ${anonPut.status}`)
    const anonAuto = await fetch(`${API}/auto-assign`, { method: 'POST' })
    check('unauthenticated auto-assign → 401', anonAuto.status === 401, `got ${anonAuto.status}`)

    console.log(`\nLogging in as ${EMAIL}`)
    check('login accepted', await login(jarFetch, EMAIL, PASSWORD))

    // ── 2. GET shape ──
    console.log('\n[GET /api/admin/scheduler/tables]')
    const gRes = await getBoard()
    check('HTTP 200', gRes.status === 200, `status ${gRes.status}`)
    const board = await gRes.json().catch(() => ({}))
    check('tables is a non-empty array', Array.isArray(board.tables) && board.tables.length > 0)
    check('every table row well-formed', (board.tables ?? []).every(wellFormedTable),
      JSON.stringify(board.tables?.[0]))
    check('days is an array', Array.isArray(board.days))
    check('every board meeting well-formed',
      (board.days ?? []).flatMap(d => d.slots).flatMap(s => s.meetings).every(wellFormedMeeting))
    check('totals well-formed',
      board.totals && ['meetings', 'assigned', 'unassigned', 'unknownTable', 'conflicts'].every(k => typeof board.totals[k] === 'number'),
      JSON.stringify(board.totals))
    check('totals add up',
      board.totals && board.totals.meetings === board.totals.assigned + board.totals.unassigned + board.totals.unknownTable,
      JSON.stringify(board.totals))

    // ── 3. inventory op lifecycle ──
    console.log('\n[PUT — add / update / remove]')
    const addRes = await putOp({ op: 'add', name: TEST_TABLE, capacity: 2 })
    check('add → 200', addRes.status === 200, `status ${addRes.status}`)
    const afterAdd = await addRes.json().catch(() => ({}))
    check('add echoes the fresh board with the new table',
      (afterAdd.tables ?? []).some(t => t.name === TEST_TABLE && t.capacity === 2))
    const dbAdd = await client.execute({ sql: `SELECT capacity FROM "MeetingTableSetting" WHERE name = ?`, args: [TEST_TABLE] })
    check('DB row reflects the add', Number(dbAdd.rows[0]?.capacity) === 2, JSON.stringify(dbAdd.rows))

    check('duplicate add → 409', (await putOp({ op: 'add', name: TEST_TABLE })).status === 409)

    const renameRes = await putOp({ op: 'update', name: TEST_TABLE, newName: TEST_TABLE_RENAMED, capacity: 3 })
    check('rename+resize → 200', renameRes.status === 200, `status ${renameRes.status}`)
    const afterRename = await renameRes.json().catch(() => ({}))
    check('rename lands in the board',
      (afterRename.tables ?? []).some(t => t.name === TEST_TABLE_RENAMED && t.capacity === 3) &&
      !(afterRename.tables ?? []).some(t => t.name === TEST_TABLE))
    check('update of unknown table → 404', (await putOp({ op: 'update', name: TEST_TABLE, capacity: 1 })).status === 404)

    const rmRes = await putOp({ op: 'remove', name: TEST_TABLE_RENAMED })
    check('remove → 200', rmRes.status === 200, `status ${rmRes.status}`)
    check('removed from the board', !((await rmRes.json().catch(() => ({}))).tables ?? []).some(t => t.name === TEST_TABLE_RENAMED))
    check('re-remove → 404', (await putOp({ op: 'remove', name: TEST_TABLE_RENAMED })).status === 404)
    const dbGone = await client.execute({ sql: `SELECT 1 FROM "MeetingTableSetting" WHERE name IN (?, ?)`, args: [TEST_TABLE, TEST_TABLE_RENAMED] })
    check('DB rows gone after remove', dbGone.rows.length === 0)

    // ── 4. validation ──
    console.log('\n[PUT — validation]')
    const badJson = await jarFetch(API, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{not json' })
    check('malformed JSON body → 400', badJson.status === 400, `got ${badJson.status}`)
    check('unknown op → 400', (await putOp({ op: 'explode', name: 'x' })).status === 400)
    check('missing name → 400', (await putOp({ op: 'add' })).status === 400)
    check('non-numeric capacity → 400', (await putOp({ op: 'add', name: 'x', capacity: 'lots' })).status === 400)

    // ── 5. assign lifecycle ──
    console.log('\n[PUT /assign]')
    const meetings = (board.days ?? []).flatMap(d => d.slots).flatMap(s => s.meetings)
    if (meetings.length === 0) {
      skip('assign lifecycle', 'no confirmed meetings in dataset')
    } else {
      const m = meetings[0]
      const slot = (board.days ?? []).flatMap(d => d.slots)
        .find(s => s.meetings.some(x => x.sponsorMeetingId === m.sponsorMeetingId))
      const clearRes = await putAssign({ sponsorMeetingId: m.sponsorMeetingId, table: null })
      check('clear table → 200', clearRes.status === 200, `status ${clearRes.status}`)
      const afterClear = await clearRes.json().catch(() => ({}))
      const clearedRow = (afterClear.days ?? []).flatMap(d => d.slots).flatMap(s => s.meetings)
        .find(x => x.sponsorMeetingId === m.sponsorMeetingId)
      check('board shows the meeting unassigned', clearedRow?.table === null, JSON.stringify(clearedRow?.table))
      const dbCleared = await client.execute({ sql: `SELECT location FROM "SponsorMeeting" WHERE id = ?`, args: [m.sponsorMeetingId] })
      check('DB shows location NULL', dbCleared.rows[0]?.location === null)

      // Capacity is a GLOBAL per-block guard, so assign to a table with free
      // seats in this meeting's block (its original label may legitimately be
      // over-subscribed in seeded data — that's the conflict this feature
      // surfaces). The oracle restores the original location at the end.
      const occupancy = new Map()
      for (const x of slot?.meetings ?? []) {
        if (x.table && x.sponsorMeetingId !== m.sponsorMeetingId) {
          occupancy.set(x.table, (occupancy.get(x.table) ?? 0) + 1)
        }
      }
      const freeTable = (board.tables ?? []).find(t => (occupancy.get(t.name) ?? 0) < t.capacity)
      if (freeTable) {
        const setRes = await putAssign({ sponsorMeetingId: m.sponsorMeetingId, table: freeTable.name })
        check('assign to a free table → 200', setRes.status === 200, `status ${setRes.status}`)
        const dbSet = await client.execute({ sql: `SELECT location FROM "SponsorMeeting" WHERE id = ?`, args: [m.sponsorMeetingId] })
        check('DB shows the new table', String(dbSet.rows[0]?.location) === freeTable.name, `got ${dbSet.rows[0]?.location}`)
      } else {
        skip('assign to a free table', 'every table is full in this block')
      }
      const fullTable = (board.tables ?? []).find(t => (occupancy.get(t.name) ?? 0) >= t.capacity)
      if (fullTable) {
        const takenRes = await putAssign({ sponsorMeetingId: m.sponsorMeetingId, table: fullTable.name })
        check('assign to a full table → 409 TABLE_TAKEN', takenRes.status === 409, `status ${takenRes.status}`)
      } else {
        skip('full-table 409 check', 'no full table in this block')
      }

      check('unknown table → 400', (await putAssign({ sponsorMeetingId: m.sponsorMeetingId, table: 'No Such Table QA' })).status === 400)
      check('unknown meeting → 404', (await putAssign({ sponsorMeetingId: 'qa-no-such-meeting', table: null })).status === 404)
      check('missing sponsorMeetingId → 400', (await putAssign({ table: null })).status === 400)
      check('non-string table → 400', (await putAssign({ sponsorMeetingId: m.sponsorMeetingId, table: 42 })).status === 400)
    }

    // ── 6. auto-assign ──
    console.log('\n[POST /auto-assign]')
    const autoRes = await postAuto({ includeConflicts: false })
    check('auto-assign → 200', autoRes.status === 200, `status ${autoRes.status}`)
    const auto = await autoRes.json().catch(() => ({}))
    check('summary well-formed',
      ['assigned', 'unplaced', 'totalMeetings'].every(k => typeof auto[k] === 'number'), JSON.stringify({ ...auto, board: undefined }))
    check('fresh board rides along', Array.isArray(auto.board?.tables) && Array.isArray(auto.board?.days))
    // Every still-unassigned meeting must be one the run reported unplaced
    // (unplaced can also cover unknown-label meetings that kept their label).
    check('no unassigned meetings left unless tables were full',
      auto.board?.totals?.unassigned <= auto.unplaced,
      `unassigned=${auto.board?.totals?.unassigned} unplaced=${auto.unplaced}`)
    check('bad includeConflicts type → 400', (await postAuto({ includeConflicts: 'yes' })).status === 400)

    // ── 7. permission gate ──
    console.log('\n[permission gate]')
    const nonStaff = makeJar()
    if (await login(nonStaff.jarFetch, NONSTAFF_EMAIL, NONSTAFF_PASSWORD)) {
      const res = await nonStaff.jarFetch(API, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'add', name: 'x' }),
      })
      check(`${NONSTAFF_EMAIL} PUT → 403`, res.status === 403, `got ${res.status}`)
    } else {
      skip('non-staff 403 check', `could not log in as ${NONSTAFF_EMAIL}`)
    }
  } finally {
    // ── restore everything we touched ──
    console.log('\n[restore]')
    await restoreInventory(client, origInventory)
    await restoreLocations(client, origLocations)
    console.log('  original inventory + meeting locations restored')
  }

  console.log(`\n${failures === 0 ? '✅ all integration checks passed' : `❌ ${failures} check(s) failed`}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(() => {
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    process.exit(failures === 0 ? 0 : 1)
  })
