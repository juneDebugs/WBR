#!/usr/bin/env node
// Integration test for the Roles & Permissions API (/api/roles), over HTTP,
// with a raw-SQL oracle against the same database the server reports via
// /api/health — so the test and the server never disagree about the dataset.
//
// Invariants under test:
//   1. Unauthenticated GET/PUT /api/roles → 401.
//   2. GET returns exactly STAFF + ORGANIZER, every permission key drawn from
//      the known universe, ORGANIZER always holding the locked `staff` key.
//   3. (Organizer/Admin only) PUT persists description + permissions; a re-GET
//      and a raw-SQL read of RolePermission both reflect the change.
//   4. Anti-lockout: PUT ORGANIZER with permissions:[] still yields `staff`.
//   5. Validation: unknown role, non-array permissions, and non-string
//      description are each rejected 400.
//   6. A non-organizer PUT is rejected 403 (only checked when the login user
//      is not an organizer/admin — otherwise reported as skipped).
//   7. The server-rendered /dashboard nav reflects the signed-in role's
//      allowed destinations (organizer sees the Administration links).
//
// The test RESTORES both roles to their defaults at the end, so it is
// idempotent and safe to re-run.
//
//   node scripts/test-role-permissions-api.mjs           # against a server already on :3000
//   node scripts/test-role-permissions-api.mjs --start   # boot `next dev` on :3000, then kill it
//
// Env overrides: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const PORT = new URL(BASE).port || '3000'
const EMAIL = process.env.SMOKE_EMAIL ?? 'wbr@test.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'password123'

let serverProc = null
let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function skip(name, why) { console.log(`  ⃠ ${name} (skipped — ${why})`) }

// The permission universe, as an independent oracle (mirrors permissions.ts).
const { ALL_PERMISSION_KEYS } = await import(pathToFileURL(join(ROOT, 'apps/web/lib/permissions.ts')).href)
const KEY_SET = new Set(ALL_PERMISSION_KEYS)

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
async function dbRolePerms(client, role) {
  // RolePermission is created lazily by the API; treat a missing table/row as null.
  try {
    const res = await client.execute({
      sql: `SELECT permissions, description FROM "RolePermission" WHERE role = ?`,
      args: [role],
    })
    if (!res.rows.length) return null
    return { permissions: JSON.parse(res.rows[0].permissions), description: res.rows[0].description }
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
const putRoles = (body) => jarFetch(`${BASE}/api/roles`, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const getRoles = () => jarFetch(`${BASE}/api/roles`)

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
  const canEdit = loginRole === 'ORGANIZER' || loginRole === 'ADMIN'

  // ── 1. auth gate ──
  console.log('\n[auth]')
  check('unauthenticated GET /api/roles → 401', (await fetch(`${BASE}/api/roles`)).status === 401)
  const anonPut = await fetch(`${BASE}/api/roles`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'STAFF' }),
  })
  check('unauthenticated PUT /api/roles → 401', anonPut.status === 401, `got ${anonPut.status}`)

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
  console.log('\n[GET /api/roles]')
  const gRes = await getRoles()
  check('HTTP 200', gRes.status === 200, `status ${gRes.status}`)
  const g = await gRes.json().catch(() => ({}))
  const roles = g.roles ?? []
  const byRole = Object.fromEntries(roles.map(r => [r.role, r]))
  check('returns exactly STAFF + ORGANIZER',
    roles.length === 2 && byRole.STAFF && byRole.ORGANIZER, `got ${JSON.stringify(roles.map(r => r.role))}`)
  check('every returned key is in the known universe',
    roles.every(r => r.permissions.every(k => KEY_SET.has(k))))
  check('ORGANIZER holds the locked `staff` key', byRole.ORGANIZER?.permissions.includes('staff'))
  check('each role carries a string description',
    roles.every(r => typeof r.description === 'string'))

  if (!canEdit) {
    console.log('\n[PUT — non-editor path]')
    const res = await putRoles({ role: 'STAFF', description: 'x', permissions: [] })
    check('non-organizer PUT → 403', res.status === 403, `got ${res.status}`)
    skip('mutation/anti-lockout/validation', 'login user is not an organizer')
  } else {
    // Snapshot originals to restore later.
    const origStaff = byRole.STAFF
    const origOrg = byRole.ORGANIZER

    // ── 3. mutation persists ──
    console.log('\n[PUT — mutation persists]')
    const marker = 'TEST role desc marker'
    const staffPlusExport = [...new Set([...origStaff.permissions, 'export'])]
    const pRes = await putRoles({ role: 'STAFF', description: marker, permissions: staffPlusExport })
    check('PUT STAFF → 200', pRes.status === 200, `status ${pRes.status}`)
    const afterGet = (await (await getRoles()).json()).roles
    const staffAfter = afterGet.find(r => r.role === 'STAFF')
    check('re-GET shows STAFF now has export', staffAfter.permissions.includes('export'))
    check('re-GET shows updated description', staffAfter.description === marker, `got "${staffAfter.description}"`)
    const dbStaff = await dbRolePerms(client, 'STAFF')
    check('DB row reflects export', dbStaff?.permissions.includes('export'), `db=${JSON.stringify(dbStaff)}`)
    check('DB row reflects description', dbStaff?.description === marker)

    // ── 4. anti-lockout ──
    console.log('\n[PUT — anti-lockout]')
    const lockRes = await putRoles({ role: 'ORGANIZER', description: origOrg.description, permissions: [] })
    check('PUT ORGANIZER permissions:[] → 200', lockRes.status === 200, `status ${lockRes.status}`)
    const lockBody = await lockRes.json()
    check('response coerces `staff` back in', lockBody.role?.permissions.includes('staff'))
    const orgAfter = (await (await getRoles()).json()).roles.find(r => r.role === 'ORGANIZER')
    check('re-GET ORGANIZER still has `staff`', orgAfter.permissions.includes('staff'))
    const dbOrg = await dbRolePerms(client, 'ORGANIZER')
    check('DB ORGANIZER row still has `staff`', dbOrg?.permissions.includes('staff'))

    // ── 5. validation ──
    console.log('\n[PUT — validation]')
    check('unknown role → 400',
      (await putRoles({ role: 'ATTENDEE', description: '', permissions: [] })).status === 400)
    check('non-array permissions → 400',
      (await putRoles({ role: 'STAFF', description: '', permissions: 'nope' })).status === 400)
    check('non-string description → 400',
      (await putRoles({ role: 'STAFF', description: 123, permissions: [] })).status === 400)
    const badJson = await jarFetch(`${BASE}/api/roles`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{not json',
    })
    check('malformed JSON body → 400', badJson.status === 400, `got ${badJson.status}`)

    // ── 6. restore originals (idempotent re-runs) ──
    console.log('\n[restore]')
    const r1 = await putRoles({ role: 'STAFF', description: origStaff.description, permissions: origStaff.permissions })
    const r2 = await putRoles({ role: 'ORGANIZER', description: origOrg.description, permissions: origOrg.permissions })
    check('restored STAFF + ORGANIZER', r1.status === 200 && r2.status === 200)
    const restored = (await (await getRoles()).json()).roles
    const rs = restored.find(r => r.role === 'STAFF')
    check('STAFF restored (export gone iff it was not original)',
      rs.permissions.includes('export') === origStaff.permissions.includes('export'))
  }

  // ── 7. sidebar SSR reflects role ──
  console.log('\n[dashboard nav SSR]')
  const html = await (await jarFetch(`${BASE}/dashboard`)).text()
  check('nav renders Overview', html.includes('href="/dashboard"') || html.includes("href='/dashboard'"))
  if (canEdit) {
    check('organizer nav includes Administration links (export)',
      html.includes('/dashboard/export'), 'organizer should see all sections')
  }

  console.log(`\n${failures === 0 ? '✅ all integration checks passed' : `❌ ${failures} check(s) failed`}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(() => {
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    process.exit(failures === 0 ? 0 : 1)
  })
