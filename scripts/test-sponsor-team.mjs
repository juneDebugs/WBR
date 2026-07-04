#!/usr/bin/env node
// Integration test for the sponsor dashboard "Your Team at WBR 2027" mapping:
// the section must show exactly the Admin app's Staff page list (User rows with
// role = 'STAFF', ordered by name), served through GET /api/sponsor-data.
//
// Invariants under test:
//   1. Source parity (static): BOTH apps/web/lib/staff-query.ts (admin
//      definition) and apps/sponsor/lib/server-data.ts (sponsor mapping) build
//      their filter from the shared packages/db/src/staff-roster.ts — the one
//      canonical definition. If either side unbinds from it, this fails.
//   2. Unauthenticated GET /api/sponsor-data → 401.
//   3. Authenticated GET returns a `staff` array that matches a raw-SQL oracle
//      of the admin Staff list — same membership, same fields, name-ascending.
//   4. No credential leakage: staff rows carry only the whitelisted keys.
//   5. Regression: the legacy payload (sponsor with users, stats, conflicts,
//      requestedIds) is still intact for existing consumers.
//   6. The staff roster is global: a second sponsor company sees the same list.
//
// PII discipline: prints counts/ids only — never names or emails.
//
//   node scripts/test-sponsor-team.mjs           # against a server already on :3003
//   node scripts/test-sponsor-team.mjs --start   # boot `next dev` on :3003, then kill it
//
// Env overrides: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD,
//                SMOKE_EMAIL_2, SMOKE_PASSWORD_2 (second sponsor company).

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3003'
const PORT = new URL(BASE).port || '3003'
const EMAIL = process.env.SMOKE_EMAIL ?? 'sponsor@shopify.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'sponsor123'
const EMAIL_2 = process.env.SMOKE_EMAIL_2 ?? 'sponsor@klaviyo.com'
const PASSWORD_2 = process.env.SMOKE_PASSWORD_2 ?? 'sponsor123'

// The keys fetchSponsorData selects for staff rows — anything extra (password,
// pushToken, ...) is a leak.
const ALLOWED_STAFF_KEYS = new Set(['id', 'name', 'image', 'jobTitle', 'company', 'email', 'role'])

let serverProc = null
let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ─── DB oracle (same DB the sponsor app uses: turso-http everywhere) ────────
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
  // The sponsor app has no /api/health, so mirror packages/db/src/client.ts:
  // TURSO_* present → turso-http; otherwise the file-SQLite fallback.
  const req = createRequire(join(ROOT, 'packages/db/package.json'))
  const { createClient } = req('@libsql/client')
  const envLocal = { ...readEnvLocal('web'), ...readEnvLocal('sponsor') }
  const url = process.env.TURSO_DATABASE_URL ?? envLocal.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
  if (url && token && url.startsWith('libsql://')) return createClient({ url, authToken: token })
  return createClient({ url: `file:${join(ROOT, 'packages/db/prisma/dev.db')}` })
}
// The roster definition itself, imported from the shared source both apps use
// (Node strips the TS types natively, same trick as test-role-permissions.mjs).
const { STAFF_ROSTER_ROLE } = await import(
  pathToFileURL(join(ROOT, 'packages/db/src/staff-roster.ts')).href
)

async function oracleStaff(client) {
  // Same semantics as the shared staff-roster definition: role filter from
  // packages/db/src/staff-roster.ts, ORDER BY name ASC.
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

async function serverUp() {
  try { return (await fetch(`${BASE}/login`, { redirect: 'manual' })).status < 500 } catch { return false }
}
async function waitFor(cond, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { if (await cond()) return; await new Promise(r => setTimeout(r, 1500)) }
  throw new Error(`Timed out waiting for ${label}`)
}

async function main() {
  // ── 1. source parity (no server needed) ──
  // Both apps must build their staff filter from the ONE shared definition;
  // a string-contains check on the literal would pass vacuously, so assert
  // the actual binding: each file imports and calls staffRosterWhere().
  console.log('[source parity]')
  const adminSrc = readFileSync(join(ROOT, 'apps/web/lib/staff-query.ts'), 'utf8')
  const sponsorSrc = readFileSync(join(ROOT, 'apps/sponsor/lib/server-data.ts'), 'utf8')
  const boundToRoster = src =>
    src.includes("from '@conference/db/src/staff-roster'") && src.includes('staffRosterWhere()')
  check('admin staff-query builds from shared staff-roster.ts', boundToRoster(adminSrc),
    'apps/web/lib/staff-query.ts no longer imports/calls staffRosterWhere')
  check('sponsor mapping builds from shared staff-roster.ts', boundToRoster(sponsorSrc),
    'apps/sponsor/lib/server-data.ts no longer imports/calls staffRosterWhere')
  check('both apps use the shared STAFF_ROSTER_ORDER_BY',
    adminSrc.includes('STAFF_ROSTER_ORDER_BY') && sponsorSrc.includes('STAFF_ROSTER_ORDER_BY'))

  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) {
      console.error(`No server at ${BASE}. Start one (cd apps/sponsor && npx next dev -p ${PORT}) or pass --start.`)
      process.exit(2)
    }
    console.log(`Starting sponsor dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps/sponsor'), env: { ...process.env, NEXTAUTH_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'sponsor dev server')
    console.log('Server is up.')
  }

  const client = openDb()
  const expected = await oracleStaff(client)
  console.log(`Oracle: ${expected.length} STAFF user(s) in the shared DB`)

  // ── 2. auth gate ──
  console.log('\n[auth]')
  const anon = await fetch(`${BASE}/api/sponsor-data`)
  check('unauthenticated GET /api/sponsor-data → 401', anon.status === 401, `got ${anon.status}`)

  const { jar, jarFetch } = makeJar()
  console.log(`\nLogging in as sponsor rep #1`)
  check('login accepted + session cookie set', await login(jarFetch, jar, EMAIL, PASSWORD),
    'wrong credentials? reseed (sponsor@shopify.com / sponsor123)')

  // ── 3. staff mapping matches the admin Staff list ──
  console.log('\n[GET /api/sponsor-data — staff mapping]')
  const res = await jarFetch(`${BASE}/api/sponsor-data`)
  check('HTTP 200', res.status === 200, `status ${res.status}`)
  const body = await res.json().catch(() => ({}))
  const staff = body.staff
  check('payload has a `staff` array', Array.isArray(staff))
  if (Array.isArray(staff)) {
    check(`staff count matches admin list (${expected.length})`, staff.length === expected.length,
      `got ${staff.length}`)
    const gotIds = staff.map(u => u.id)
    const expIds = expected.map(u => u.id)
    // Exact ordered sequence equality against the oracle — one check covers
    // membership AND ordering, since the oracle runs the same ORDER BY the
    // shared definition mandates.
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
    // ── 4. no credential leakage ──
    const leaked = [...new Set(staff.flatMap(u => Object.keys(u)))].filter(k => !ALLOWED_STAFF_KEYS.has(k))
    check('staff rows carry only whitelisted keys (no password/pushToken/...)',
      leaked.length === 0, `leaked: ${leaked.join(', ')}`)
  }

  // ── 5. legacy payload regression ──
  console.log('\n[regression — legacy payload intact]')
  check('sponsor object present', body.sponsor && typeof body.sponsor === 'object')
  check('sponsor.users still present (legacy consumers)', Array.isArray(body.sponsor?.users))
  check('stats shape intact', body.stats &&
    ['pendingCount', 'confirmedCount', 'totalMeetings'].every(k => typeof body.stats[k] === 'number'))
  check('conflicts + requestedIds arrays intact', Array.isArray(body.conflicts) && Array.isArray(body.requestedIds))

  // ── 6. roster is global across sponsor companies ──
  console.log('\n[second sponsor company]')
  const j2 = makeJar()
  const ok2 = await login(j2.jarFetch, j2.jar, EMAIL_2, PASSWORD_2)
  if (!ok2) {
    console.log('  ⃠ second sponsor login unavailable — skipping cross-company check')
  } else {
    const body2 = await (await j2.jarFetch(`${BASE}/api/sponsor-data`)).json().catch(() => ({}))
    const ids1 = new Set((staff ?? []).map(u => u.id))
    const ids2 = (body2.staff ?? []).map(u => u.id)
    check('second company sees the same WBR staff roster',
      ids2.length === ids1.size && ids2.every(id => ids1.has(id)),
      `company1=${ids1.size} company2=${ids2.length}`)
    check('but a different sponsor object', body2.sponsor?.id !== body.sponsor?.id)
  }

  console.log(`\n${failures === 0 ? '✅ all sponsor-team checks passed' : `❌ ${failures} check(s) failed`}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(() => {
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    process.exit(failures === 0 ? 0 : 1)
  })
