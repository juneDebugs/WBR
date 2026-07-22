#!/usr/bin/env node
// Integration test for the meetings dashboard "Your Team at WBR 2027" module —
// the replica of the sponsor app's module: it must show exactly the Admin
// app's Staff page list (shared packages/db/src/staff-roster.ts definition),
// served through GET /api/dashboard.
//
// Invariants under test:
//   1. Component parity (static): apps/meetings/components/TeamMembers.tsx is
//      byte-identical to apps/sponsor/components/TeamMembers.tsx (it is a
//      deliberate replica — edit the sponsor one and re-copy).
//   2. Source parity (static): apps/meetings/lib/dashboard-data.ts builds its
//      staff query from the shared packages/db/src/staff-roster.ts.
//   3. Unauthenticated GET /api/dashboard → 401.
//   4. For a non-staff user the payload has a `staff` array that matches a
//      raw-SQL oracle of the roster — same membership, same order, same fields.
//   5. No credential leakage: staff rows carry only the whitelisted keys.
//   6. Regression: legacy user-dashboard fields intact; the retired
//      sponsorWithTeam field is gone; the roster is identical for attendee
//      and sponsor-rep logins; the STAFF ops dashboard payload is unchanged
//      (isStaff: true, no staff array).
//
// PII discipline: prints counts/ids only — never names or emails.
//
//   node scripts/test-meetings-team.mjs           # against a server already on :3002
//   node scripts/test-meetings-team.mjs --start   # boot `next dev` on :3002, then kill it
//
// Env overrides: SMOKE_BASE_URL, SMOKE_EMAIL/SMOKE_PASSWORD (attendee),
//                SMOKE_EMAIL_2/SMOKE_PASSWORD_2 (sponsor rep),
//                SMOKE_STAFF_EMAIL/SMOKE_STAFF_PASSWORD (staff).

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3002'
const PORT = new URL(BASE).port || '3002'
const EMAIL = process.env.SMOKE_EMAIL ?? 'stephcurry@test.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'password123'
const EMAIL_2 = process.env.SMOKE_EMAIL_2 ?? 'sponsor@test.com'
const PASSWORD_2 = process.env.SMOKE_PASSWORD_2 ?? 'password123'
const STAFF_EMAIL = process.env.SMOKE_STAFF_EMAIL ?? 'wbr@test.com'
const STAFF_PASSWORD = process.env.SMOKE_STAFF_PASSWORD ?? 'password123'

const ALLOWED_STAFF_KEYS = new Set(['id', 'name', 'image', 'jobTitle', 'company', 'email', 'role'])

let serverProc = null
let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function skip(name, why) { console.log(`  ⃠ ${name} (skipped — ${why})`) }

// ─── DB oracle (same DB the app uses: turso-http everywhere) ────────────────
function readEnvLocal(app) {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, 'apps', app, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const mm = line.match(/^([A-Z_]+)=(.*)$/)
      if (mm) env[mm[1]] = mm[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}
function openDb() {
  const req = createRequire(join(ROOT, 'packages/db/package.json'))
  const { createClient } = req('@libsql/client')
  const envLocal = { ...readEnvLocal('web'), ...readEnvLocal('meetings') }
  const url = process.env.TURSO_DATABASE_URL ?? envLocal.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
  if (url && token && url.startsWith('libsql://')) return createClient({ url, authToken: token })
  return createClient({ url: `file:${join(ROOT, 'packages/db/prisma/dev.db')}` })
}

const { STAFF_ROSTER_ROLE } = await import(
  pathToFileURL(join(ROOT, 'packages/db/src/staff-roster.ts')).href
)

async function oracleStaff(client) {
  const res = await client.execute({
    sql: `SELECT id, name, email, jobTitle, company, role FROM User WHERE role = ? ORDER BY name ASC`,
    args: [STAFF_ROSTER_ROLE],
  })
  return res.rows.map(r => ({
    id: String(r.id), name: r.name ?? null, email: r.email ?? null,
    jobTitle: r.jobTitle ?? null, company: r.company ?? null, role: String(r.role),
  }))
}

// ─── cookie jar + auth (one jar per login) ──────────────────────────────────
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
async function login(jarFetch, jar, email, password) {
  const csrf = await (await jarFetch(`${BASE}/api/auth/csrf`)).json().catch(() => ({}))
  if (!csrf.csrfToken) return false
  const res = await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, json: 'true' }),
  })
  if (res.status !== 200 && res.status !== 302) return false
  return [...jar.keys()].some(k => k.includes('next-auth.session-token'))
}
async function fetchDashboard(email, password) {
  const { jar, jarFetch } = makeJar()
  if (!(await login(jarFetch, jar, email, password))) return null
  return (await jarFetch(`${BASE}/api/dashboard`)).json().catch(() => null)
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
  // ── 1 + 2. static parity (no server needed) ──
  console.log('[component + source parity]')
  const sponsorComponent = readFileSync(join(ROOT, 'apps/sponsor/components/TeamMembers.tsx'), 'utf8')
  const meetingsComponent = readFileSync(join(ROOT, 'apps/meetings/components/TeamMembers.tsx'), 'utf8')
  check('meetings TeamMembers.tsx is byte-identical to the sponsor module',
    meetingsComponent === sponsorComponent,
    'the module is a replica — edit the sponsor copy, then re-copy to apps/meetings')
  const dataSrc = readFileSync(join(ROOT, 'apps/meetings/lib/dashboard-data.ts'), 'utf8')
  check('dashboard-data builds from shared staff-roster.ts',
    dataSrc.includes("from '@conference/db/src/staff-roster'") &&
    dataSrc.includes('staffRosterWhere()') && dataSrc.includes('STAFF_ROSTER_ORDER_BY'))

  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) {
      console.error(`No server at ${BASE}. Start one (cd apps/meetings && npx next dev -p ${PORT}) or pass --start.`)
      process.exit(2)
    }
    console.log(`Starting meetings dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps/meetings'), env: { ...process.env, NEXTAUTH_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'meetings dev server')
    console.log('Server is up.')
  }

  const client = openDb()
  const expected = await oracleStaff(client)
  console.log(`Oracle: ${expected.length} STAFF user(s) in the shared DB`)

  // ── 3. auth gate ──
  console.log('\n[auth]')
  const anon = await fetch(`${BASE}/api/dashboard`)
  check('unauthenticated GET /api/dashboard → 401', anon.status === 401, `got ${anon.status}`)

  // ── 4 + 5. staff mapping for an attendee ──
  console.log('\n[GET /api/dashboard — attendee]')
  const body = await fetchDashboard(EMAIL, PASSWORD)
  check('attendee login + dashboard fetch', !!body, 'wrong credentials? reseed')
  if (body) {
    const staff = body.staff
    check('payload has a `staff` array', Array.isArray(staff))
    if (Array.isArray(staff)) {
      const gotIds = staff.map(u => u.id)
      const expIds = expected.map(u => u.id)
      const firstDiff = gotIds.findIndex((id, i) => id !== expIds[i])
      check('staff ids match the admin list exactly, in order',
        gotIds.length === expIds.length && firstDiff === -1,
        `first divergence at index ${firstDiff} (got ${gotIds[firstDiff] ?? 'nothing'}, expected ${expIds[firstDiff] ?? 'nothing'})`)
      check(`every staff row has role '${STAFF_ROSTER_ROLE}'`, staff.every(u => u.role === STAFF_ROSTER_ROLE))
      const expById = new Map(expected.map(u => [u.id, u]))
      check('name/email/jobTitle/company match the DB row for every member',
        staff.every(u => {
          const e = expById.get(u.id)
          return e && u.name === e.name && u.email === e.email && u.jobTitle === e.jobTitle && u.company === e.company
        }))
      const leaked = [...new Set(staff.flatMap(u => Object.keys(u)))].filter(k => !ALLOWED_STAFF_KEYS.has(k))
      check('staff rows carry only whitelisted keys (no password/pushToken/...)',
        leaked.length === 0, `leaked: ${leaked.join(', ')}`)
    }

    // ── 6a. legacy payload regression ──
    console.log('\n[regression — user dashboard payload]')
    check('isStaff false + core counts intact', body.isStaff === false &&
      ['totalRequests', 'pendingRequests', 'confirmedRequests'].every(k => typeof body[k] === 'number'))
    check('profileUser + myMeetings + inboundRequests intact',
      body.profileUser && Array.isArray(body.myMeetings) && Array.isArray(body.inboundRequests))
    check('retired sponsorWithTeam field is gone', !('sponsorWithTeam' in body))
  }

  // ── 6b. roster identical for a sponsor rep ──
  console.log('\n[sponsor rep]')
  const body2 = await fetchDashboard(EMAIL_2, PASSWORD_2)
  if (!body2) {
    skip('sponsor-rep roster check', 'sponsor rep login unavailable')
  } else {
    const ids1 = (body?.staff ?? []).map(u => u.id)
    const ids2 = (body2.staff ?? []).map(u => u.id)
    check('sponsor rep sees the identical roster, in order',
      ids1.length === ids2.length && ids1.every((id, i) => id === ids2[i]))
  }

  // ── 6c. STAFF ops dashboard unchanged ──
  console.log('\n[staff user]')
  const body3 = await fetchDashboard(STAFF_EMAIL, STAFF_PASSWORD)
  if (!body3) {
    skip('staff dashboard check', 'staff login unavailable')
  } else {
    check('staff user still gets the ops dashboard (isStaff true)', body3.isStaff === true)
    check('ops dashboard payload has no staff roster (section is user-facing)', !('staff' in body3))
  }

  console.log(`\n${failures === 0 ? '✅ all meetings-team checks passed' : `❌ ${failures} check(s) failed`}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(() => {
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    process.exit(failures === 0 ? 0 : 1)
  })
