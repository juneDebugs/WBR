#!/usr/bin/env node
// Integration test for the Chat Settings API (/api/chat/settings), over HTTP,
// with a raw-SQL oracle against the same database the server reports via
// /api/health — so the test and the server never disagree about the dataset.
//
// Invariants under test:
//   1. Unauthenticated GET/PUT /api/chat/settings → 401.
//   2. GET returns { vendorGlobal:{enabled:bool}, vendors:[…], staff:[…] } with
//      every vendor row carrying sponsorId/name/tier + two booleans, and every
//      staff row carrying userId/name/email + three booleans.
//   3. (Staff/Organizer/Admin) PUT vendorGlobal persists; a re-GET and a raw-SQL
//      read of ChatMessagingPermission both reflect the change.
//   4. PUT a per-vendor row persists + reflects (when at least one vendor exists).
//   5. PUT a per-staff row persists + reflects (when at least one staffer exists).
//   6. Malformed JSON body → 400.
//   7. A non-admin PUT is rejected 403 (only checked when the login user is not
//      admin — otherwise reported as skipped; the web app only admits admins).
//
// The test RESTORES every value it touches, so it is idempotent and safe to
// re-run against live Turso.
//
//   node scripts/test-chat-settings-api.mjs           # server already running
//   node scripts/test-chat-settings-api.mjs --start   # boot next dev, then kill it
//
// Env overrides: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const PORT = new URL(BASE).port || '3000'
const EMAIL = process.env.SMOKE_EMAIL ?? 'june@tailor.tech'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'admin123'

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
async function dbPerm(client, scope, subjectId) {
  try {
    const res = await client.execute({
      sql: `SELECT settings FROM "ChatMessagingPermission" WHERE scope = ? AND subjectId = ?`,
      args: [scope, subjectId],
    })
    if (!res.rows.length) return null
    return JSON.parse(res.rows[0].settings)
  } catch { return null }
}
async function dbUserRole(client, email) {
  const res = await client.execute({ sql: `SELECT role FROM User WHERE email = ?`, args: [email] })
  return res.rows.length ? String(res.rows[0].role) : null
}

// ─── cookie jar + auth ───────────────────────────────────────────────────────
const jar = new Map()
function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';'); const eq = pair.indexOf('=')
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1))
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
async function jarFetch(url, init = {}) {
  const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...init.headers, cookie: cookieHeader() } })
  storeCookies(res)
  return res
}
async function serverUp() {
  try { return (await fetch(`${BASE}/login`, { redirect: 'manual' })).status < 500 } catch { return false }
}
async function waitFor(cond, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { if (await cond()) return; await new Promise(r => setTimeout(r, 1500)) }
  throw new Error(`Timed out waiting for ${label}`)
}
const getSettings = () => jarFetch(`${BASE}/api/chat/settings`)
const putSettings = (body) => jarFetch(`${BASE}/api/chat/settings`, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

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
  const loginRole = await dbUserRole(client, EMAIL)
  console.log(`Login user ${EMAIL} has role: ${loginRole}`)
  const canEdit = loginRole === 'STAFF' || loginRole === 'ORGANIZER' || loginRole === 'ADMIN'

  // ── 1. auth gate ──
  console.log('\n[auth]')
  check('unauthenticated GET → 401', (await fetch(`${BASE}/api/chat/settings`)).status === 401)
  const anonPut = await fetch(`${BASE}/api/chat/settings`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vendorGlobal: { enabled: true } }),
  })
  check('unauthenticated PUT → 401', anonPut.status === 401, `got ${anonPut.status}`)

  console.log(`\nLogging in as ${EMAIL}`)
  const csrf = await (await jarFetch(`${BASE}/api/auth/csrf`)).json().catch(() => ({}))
  if (!csrf.csrfToken) { check('csrf token issued', false, 'is this the WBR web app?'); return }
  const loginRes = await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: PASSWORD, json: 'true' }),
  })
  check('login accepted', loginRes.status === 200 || loginRes.status === 302, `status ${loginRes.status}`)
  if (![...jar.keys()].some(k => k.includes('next-auth.session-token'))) {
    check('session cookie set', false, 'wrong credentials? reseed'); return
  }

  // ── 2. GET shape ──
  console.log('\n[GET /api/chat/settings]')
  const gRes = await getSettings()
  check('HTTP 200', gRes.status === 200, `status ${gRes.status}`)
  const view = await gRes.json().catch(() => ({}))
  check('vendorGlobal.enabled is boolean', typeof view?.vendorGlobal?.enabled === 'boolean')
  check('vendors is an array', Array.isArray(view.vendors))
  check('staff is an array', Array.isArray(view.staff))
  check('every vendor row well-formed',
    view.vendors.every(v => typeof v.sponsorId === 'string' && typeof v.name === 'string' && typeof v.tier === 'string' && typeof v.toAttendees === 'boolean' && typeof v.toSpeakers === 'boolean'),
    `sample=${JSON.stringify(view.vendors[0])}`)
  check('every staff row well-formed',
    view.staff.every(s => typeof s.userId === 'string' && typeof s.name === 'string' && typeof s.toAttendees === 'boolean' && typeof s.toVendors === 'boolean' && typeof s.toSpeakers === 'boolean'),
    `sample=${JSON.stringify(view.staff[0])}`)

  if (!canEdit) {
    console.log('\n[PUT — non-editor path]')
    const res = await putSettings({ vendorGlobal: { enabled: true } })
    check('non-admin PUT → 403', res.status === 403, `got ${res.status}`)
    skip('mutation checks', 'login user is not an admin role')
  } else {
    // ── 3. vendorGlobal persists ──
    console.log('\n[PUT — vendorGlobal persists]')
    const origGlobal = view.vendorGlobal.enabled
    const flip = !origGlobal
    const pRes = await putSettings({ vendorGlobal: { enabled: flip } })
    check('PUT vendorGlobal → 200', pRes.status === 200, `status ${pRes.status}`)
    const after = await (await getSettings()).json()
    check('re-GET reflects flipped global', after.vendorGlobal.enabled === flip)
    const dbGlobal = await dbPerm(client, 'VENDOR_GLOBAL', '')
    check('DB row reflects flipped global', dbGlobal?.enabled === flip, `db=${JSON.stringify(dbGlobal)}`)
    // restore
    await putSettings({ vendorGlobal: { enabled: origGlobal } })
    check('vendorGlobal restored', (await (await getSettings()).json()).vendorGlobal.enabled === origGlobal)

    // ── 4. per-vendor persists ──
    console.log('\n[PUT — per-vendor persists]')
    if (view.vendors.length === 0) {
      skip('per-vendor mutation', 'no vendors in dataset')
    } else {
      const v0 = view.vendors[0]
      const newAtt = !v0.toAttendees
      const r = await putSettings({ vendors: [{ sponsorId: v0.sponsorId, toAttendees: newAtt, toSpeakers: v0.toSpeakers }] })
      check('PUT vendor row → 200', r.status === 200, `status ${r.status}`)
      const va = (await (await getSettings()).json()).vendors.find(v => v.sponsorId === v0.sponsorId)
      check('re-GET reflects vendor toAttendees', va?.toAttendees === newAtt)
      const dbV = await dbPerm(client, 'VENDOR', v0.sponsorId)
      check('DB row reflects vendor toAttendees', dbV?.toAttendees === newAtt, `db=${JSON.stringify(dbV)}`)
      // restore
      await putSettings({ vendors: [{ sponsorId: v0.sponsorId, toAttendees: v0.toAttendees, toSpeakers: v0.toSpeakers }] })
      const vr = (await (await getSettings()).json()).vendors.find(v => v.sponsorId === v0.sponsorId)
      check('vendor row restored', vr?.toAttendees === v0.toAttendees && vr?.toSpeakers === v0.toSpeakers)
    }

    // ── 5. per-staff persists ──
    console.log('\n[PUT — per-staff persists]')
    if (view.staff.length === 0) {
      skip('per-staff mutation', 'no staff in dataset')
    } else {
      const s0 = view.staff[0]
      const newVen = !s0.toVendors
      const r = await putSettings({ staff: [{ userId: s0.userId, toAttendees: s0.toAttendees, toVendors: newVen, toSpeakers: s0.toSpeakers }] })
      check('PUT staff row → 200', r.status === 200, `status ${r.status}`)
      const sa = (await (await getSettings()).json()).staff.find(s => s.userId === s0.userId)
      check('re-GET reflects staff toVendors', sa?.toVendors === newVen)
      const dbS = await dbPerm(client, 'STAFF', s0.userId)
      check('DB row reflects staff toVendors', dbS?.toVendors === newVen, `db=${JSON.stringify(dbS)}`)
      // restore
      await putSettings({ staff: [{ userId: s0.userId, toAttendees: s0.toAttendees, toVendors: s0.toVendors, toSpeakers: s0.toSpeakers }] })
      const sr = (await (await getSettings()).json()).staff.find(s => s.userId === s0.userId)
      check('staff row restored', sr?.toVendors === s0.toVendors)
    }

    // ── 6. validation ──
    console.log('\n[PUT — validation]')
    const badJson = await jarFetch(`${BASE}/api/chat/settings`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{not json',
    })
    check('malformed JSON body → 400', badJson.status === 400, `got ${badJson.status}`)
  }

  console.log(`\n${failures === 0 ? '✅ all integration checks passed' : `❌ ${failures} check(s) failed`}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(() => {
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    process.exit(failures === 0 ? 0 : 1)
  })
