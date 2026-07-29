#!/usr/bin/env node
// Integration test for the Companies → Settings API
// (/api/admin/scheduler/settings), over HTTP, with a raw-SQL oracle against the
// same database the server reports via /api/health — so the test and the
// server never disagree about the dataset.
//
// Invariants under test:
//   1. Unauthenticated GET/PUT → 401.
//   2. GET returns { attendeeRequired, sponsorDefaultRequired, sponsorOverrides,
//      sponsors } with numeric requirements and well-formed sponsor rows.
//   3. PUT attendeeRequired / sponsorDefaultRequired persists; a re-GET and a
//      raw-SQL read of MeetingRequirementSetting both reflect the change.
//   4. PUT a per-sponsor override persists, shows up in the companies directory
//      payload (requiredMeetings), and is deleted again by required: null.
//   5. Out-of-range values are clamped to [0, 99] on write.
//   6. Malformed JSON / wrong-typed fields → 400.
//   7. A login without the meetings permission is rejected (403).
//
// The test RESTORES every row it touches (including deleting rows it created),
// so it is idempotent and safe to re-run against live Turso.
//
//   node scripts/test-meeting-requirements-api.mjs           # server already running
//   node scripts/test-meeting-requirements-api.mjs --start   # boot next dev, then kill it
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

const API = `${BASE}/api/admin/scheduler/settings`
const TABLE = 'MeetingRequirementSetting'

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
// Raw settings text for one row (null when the row does not exist).
async function dbRow(client, scope, subjectId) {
  try {
    const res = await client.execute({
      sql: `SELECT settings FROM "${TABLE}" WHERE scope = ? AND subjectId = ?`,
      args: [scope, subjectId],
    })
    return res.rows.length ? String(res.rows[0].settings) : null
  } catch { return null }
}
async function dbRestoreRow(client, scope, subjectId, originalSettings) {
  if (originalSettings === null) {
    await client.execute({ sql: `DELETE FROM "${TABLE}" WHERE scope = ? AND subjectId = ?`, args: [scope, subjectId] })
  } else {
    await client.execute({
      sql: `INSERT INTO "${TABLE}" ("scope", "subjectId", "settings", "updatedAt") VALUES (?, ?, ?, ?)
            ON CONFLICT("scope", "subjectId") DO UPDATE SET "settings" = excluded."settings", "updatedAt" = excluded."updatedAt"`,
      args: [scope, subjectId, originalSettings, new Date().toISOString()],
    })
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

  // Snapshot every row this test may touch, for exact restoration at the end.
  const origAttendee = await dbRow(client, 'ATTENDEE_GLOBAL', '')
  const origDefault = await dbRow(client, 'SPONSOR_DEFAULT', '')
  let overrideSponsorId = null
  let origOverride = null

  const { jarFetch } = makeJar()
  const getSettings = () => jarFetch(API)
  const putSettings = (body) => jarFetch(API, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

  try {
    // ── 1. auth gate ──
    console.log('\n[auth]')
    check('unauthenticated GET → 401', (await fetch(API)).status === 401)
    const anonPut = await fetch(API, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attendeeRequired: 5 }),
    })
    check('unauthenticated PUT → 401', anonPut.status === 401, `got ${anonPut.status}`)

    console.log(`\nLogging in as ${EMAIL}`)
    check('login accepted', await login(jarFetch, EMAIL, PASSWORD))

    // ── 2. GET shape ──
    console.log('\n[GET /api/admin/scheduler/settings]')
    const gRes = await getSettings()
    check('HTTP 200', gRes.status === 200, `status ${gRes.status}`)
    const view = await gRes.json().catch(() => ({}))
    check('attendeeRequired is a number', typeof view.attendeeRequired === 'number')
    check('sponsorDefaultRequired is a number', typeof view.sponsorDefaultRequired === 'number')
    check('sponsorOverrides is a plain object', !!view.sponsorOverrides && typeof view.sponsorOverrides === 'object' && !Array.isArray(view.sponsorOverrides))
    check('sponsors is an array', Array.isArray(view.sponsors))
    check('every sponsor row well-formed',
      (view.sponsors ?? []).every(s => typeof s.id === 'string' && typeof s.name === 'string' && typeof s.tier === 'string' && (typeof s.logoUrl === 'string' || s.logoUrl === null)),
      `sample=${JSON.stringify({ ...view.sponsors?.[0], logoUrl: view.sponsors?.[0]?.logoUrl ? '<present>' : null })}`)

    // ── 3. global values persist ──
    console.log('\n[PUT — global values persist]')
    const newAttendee = view.attendeeRequired === 6 ? 7 : 6
    const newDefault = view.sponsorDefaultRequired === 11 ? 13 : 11
    const pRes = await putSettings({ attendeeRequired: newAttendee, sponsorDefaultRequired: newDefault })
    check('PUT globals → 200', pRes.status === 200, `status ${pRes.status}`)
    const echoed = await pRes.json().catch(() => ({}))
    check('PUT response echoes the fresh view', echoed.attendeeRequired === newAttendee && echoed.sponsorDefaultRequired === newDefault)
    const after = await (await getSettings()).json()
    check('re-GET reflects attendeeRequired', after.attendeeRequired === newAttendee)
    check('re-GET reflects sponsorDefaultRequired', after.sponsorDefaultRequired === newDefault)
    const dbAtt = JSON.parse((await dbRow(client, 'ATTENDEE_GLOBAL', '')) ?? 'null')
    const dbDef = JSON.parse((await dbRow(client, 'SPONSOR_DEFAULT', '')) ?? 'null')
    check('DB row reflects attendeeRequired', dbAtt?.required === newAttendee, `db=${JSON.stringify(dbAtt)}`)
    check('DB row reflects sponsorDefaultRequired', dbDef?.required === newDefault, `db=${JSON.stringify(dbDef)}`)

    // ── 4. per-sponsor override lifecycle ──
    console.log('\n[PUT — per-sponsor override]')
    if (!view.sponsors?.length) {
      skip('override lifecycle', 'no sponsors in dataset')
    } else {
      overrideSponsorId = view.sponsors[0].id
      origOverride = await dbRow(client, 'SPONSOR', overrideSponsorId)
      const target = 3
      const r = await putSettings({ sponsorOverrides: [{ sponsorId: overrideSponsorId, required: target }] })
      check('PUT override → 200', r.status === 200, `status ${r.status}`)
      const withOverride = await (await getSettings()).json()
      check('re-GET carries the override', withOverride.sponsorOverrides[overrideSponsorId] === target)
      const dbOv = JSON.parse((await dbRow(client, 'SPONSOR', overrideSponsorId)) ?? 'null')
      check('DB row reflects the override', dbOv?.required === target, `db=${JSON.stringify(dbOv)}`)

      const dirRes = await jarFetch(`${BASE}/api/admin/scheduler/companies`)
      check('companies directory → 200', dirRes.status === 200, `status ${dirRes.status}`)
      const dir = await dirRes.json().catch(() => [])
      const dirRow = Array.isArray(dir) ? dir.find(x => x.id === overrideSponsorId) : null
      check('directory row carries requiredMeetings = override', dirRow?.requiredMeetings === target, `row=${JSON.stringify({ id: dirRow?.id, requiredMeetings: dirRow?.requiredMeetings })}`)
      // Rows without any stored override (per the settings view) must carry the default.
      const overridden = new Set(Object.keys(withOverride.sponsorOverrides ?? {}))
      const others = Array.isArray(dir) ? dir.filter(x => !overridden.has(x.id)) : []
      check('non-overridden rows carry the default', others.every(x => x.requiredMeetings === newDefault),
        `sample=${JSON.stringify(others.slice(0, 2).map(x => x.requiredMeetings))}`)

      const clear = await putSettings({ sponsorOverrides: [{ sponsorId: overrideSponsorId, required: null }] })
      check('PUT required:null → 200', clear.status === 200, `status ${clear.status}`)
      check('re-GET shows override cleared', !((await (await getSettings()).json()).sponsorOverrides[overrideSponsorId] !== undefined))
      check('DB row deleted on clear', (await dbRow(client, 'SPONSOR', overrideSponsorId)) === null)
    }

    // ── 5. clamping ──
    console.log('\n[PUT — clamping]')
    const clampRes = await putSettings({ attendeeRequired: 250 })
    check('out-of-range PUT accepted', clampRes.status === 200, `status ${clampRes.status}`)
    check('value clamped to 99', (await (await getSettings()).json()).attendeeRequired === 99)

    // ── 6. validation ──
    console.log('\n[PUT — validation]')
    const badJson = await jarFetch(API, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{not json' })
    check('malformed JSON body → 400', badJson.status === 400, `got ${badJson.status}`)
    check('non-numeric attendeeRequired → 400', (await putSettings({ attendeeRequired: 'abc' })).status === 400)
    check('non-array sponsorOverrides → 400', (await putSettings({ sponsorOverrides: 'nope' })).status === 400)
    check('non-numeric override required → 400', (await putSettings({ sponsorOverrides: [{ sponsorId: 'x', required: 'lots' }] })).status === 400)

    // ── 7. permission gate ──
    console.log('\n[permission gate]')
    const nonStaff = makeJar()
    if (await login(nonStaff.jarFetch, NONSTAFF_EMAIL, NONSTAFF_PASSWORD)) {
      const res = await nonStaff.jarFetch(API, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attendeeRequired: 5 }),
      })
      check(`${NONSTAFF_EMAIL} PUT → 403`, res.status === 403, `got ${res.status}`)
    } else {
      skip('non-staff 403 check', `could not log in as ${NONSTAFF_EMAIL}`)
    }
  } finally {
    // ── restore everything we touched ──
    console.log('\n[restore]')
    await dbRestoreRow(client, 'ATTENDEE_GLOBAL', '', origAttendee)
    await dbRestoreRow(client, 'SPONSOR_DEFAULT', '', origDefault)
    if (overrideSponsorId) await dbRestoreRow(client, 'SPONSOR', overrideSponsorId, origOverride)
    console.log('  original rows restored')
  }

  console.log(`\n${failures === 0 ? '✅ all integration checks passed' : `❌ ${failures} check(s) failed`}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(() => {
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    process.exit(failures === 0 ? 0 : 1)
  })
