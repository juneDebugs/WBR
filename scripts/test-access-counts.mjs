#!/usr/bin/env node
// Acceptance test for the Access & Roles page stat cards, over HTTP.
//
// The Access & Roles page (/dashboard/access) shows exactly THREE stat cards —
// Attendees, Speakers, Staff — and each card's number is the total of the
// section it links to. The "Organizers" card was removed. The invariant under
// test is that a tile can never disagree with the list you land on when you tap
// it, because every count is a DB aggregate produced by the *same* query the
// destination section uses:
//
//   attendees  = ATTENDEE + SPEAKER accounts   → the Attendees section's
//                                                 unfiltered total
//   speakers   = the Speaker directory count   → the Speakers section total
//   staff      = role STAFF                     → the NEW Staff section total
//   totalUsers = every user account            → the "All Users" tab count
//
// counts no longer carries an `organizers` field.
//
// What this verifies:
//   1. /api/data/access counts (attendees, speakers, staff, totalUsers) match
//      raw SQL against the same database the server reads.
//   2. counts.organizers is gone (undefined).
//   3. Tile ⇔ section mapping: each tile equals its destination section total —
//      attendees vs /api/data/attendees?page=0 (UNFILTERED), speakers vs the
//      length of /api/data/speakers, staff vs /api/data/staff?page=0.
//   4. The Staff section is fully reachable through pagination (no row cap).
//   5. Unauthenticated /api/data/access and /api/data/staff both return 401.
//   6. Server-rendered /dashboard/access HTML carries the same three numbers
//      (data-stat attendees/speakers/staff) and NO data-stat="organizers".
//   7. Server-rendered /dashboard/staff returns HTTP 200.
//
//   node scripts/test-access-counts.mjs           # use a server already running on :3000
//   node scripts/test-access-counts.mjs --start   # boot `next dev` on :3000 (loads
//                                                 # apps/web/.env.local like a normal run), then kill it
//
// Env overrides: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD.
// The expected values are computed with raw SQL against the database the server
// actually connected to, as reported by /api/health (Turso remote or the local
// SQLite file) — so oracle and server can never disagree about which dataset is
// under test. No dataset-specific literals are baked in.

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

let serverProc = null
let failures = 0

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Resolve the same database the web server uses ───────────────────────────

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

// Open the same database the running server reports via /api/health, so the
// raw-SQL oracle and the server always look at one dataset.
async function openDb() {
  const health = await (await fetch(`${BASE}/api/health`)).json()
  const mode = String(health.connectionMode ?? '')
  console.log(`Server connection mode: ${mode}`)

  // @libsql/client lives under packages/db in this pnpm workspace.
  const req = createRequire(join(ROOT, 'packages/db/package.json'))
  const { createClient } = req('@libsql/client')

  // Match 'turso-http' / 'turso-http-dev' but NOT 'turso-failed: …' (which
  // means the server actually fell back to local SQLite).
  if (mode.startsWith('turso-http')) {
    const envLocal = readEnvLocal()
    const tursoUrl = process.env.TURSO_DATABASE_URL ?? envLocal.TURSO_DATABASE_URL
    const tursoToken = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
    if (!tursoUrl || !tursoToken) throw new Error('server uses Turso but no TURSO_* vars found for the oracle')
    console.log(`Comparing against Turso (${tursoUrl.slice(0, 40)}…)`)
    return { client: createClient({ url: tursoUrl, authToken: tursoToken }), isTurso: true }
  }
  if (mode.startsWith('sqlite')) {
    // DATABASE_URL file paths resolve relative to the Prisma schema directory.
    const rel = mode.replace(/^sqlite:\s*file:/, '')
    const file = join(ROOT, 'packages/db/prisma', rel)
    console.log(`Comparing against local SQLite (${file})`)
    return { client: createClient({ url: `file:${file}` }), isTurso: false }
  }
  throw new Error(`unexpected server connection mode: ${mode || JSON.stringify(health)}`)
}

async function count(client, sql) {
  const res = await client.execute(sql)
  return Number(res.rows[0].n)
}

// ─── Minimal cookie jar ──────────────────────────────────────────────────────

const jar = new Map()
function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';')
    const eq = pair.indexOf('=')
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1))
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}
async function jarFetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: { ...init.headers, cookie: cookieHeader() },
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
    console.log(`Starting web dev server on :${PORT} (apps/web/.env.local applies, like a normal run)...`)
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

  // ── Expected values via raw SQL (independent of Prisma and the app code) ──
  // Mirrors fetchAccessCounts(): attendees is ATTENDEE + SPEAKER (the Attendees
  // section's unfiltered total), speakers is the Speaker directory, staff is
  // role STAFF (the new Staff section). No organizers count anymore.
  const { client } = await openDb()
  const expected = {
    attendees: await count(client, "SELECT COUNT(*) AS n FROM User WHERE role IN ('ATTENDEE','SPEAKER')"),
    speakers: await count(client, 'SELECT COUNT(*) AS n FROM Speaker'),
    staff: await count(client, "SELECT COUNT(*) AS n FROM User WHERE role = 'STAFF'"),
    totalUsers: await count(client, 'SELECT COUNT(*) AS n FROM User'),
  }
  console.log('Expected (raw SQL):', JSON.stringify(expected))

  // ── Auth gate ──
  console.log('\n[auth]')
  const anonAccess = await fetch(`${BASE}/api/data/access`)
  check('unauthenticated /api/data/access rejected', anonAccess.status === 401, `status ${anonAccess.status}`)
  const anonStaff = await fetch(`${BASE}/api/data/staff`)
  check('unauthenticated /api/data/staff rejected', anonStaff.status === 401, `status ${anonStaff.status}`)

  console.log(`\nLogging in as ${EMAIL}`)
  const csrfRes = await jarFetch(`${BASE}/api/auth/csrf`)
  const csrfBody = csrfRes.headers.get('content-type')?.includes('json') ? await csrfRes.json() : {}
  const csrfToken = csrfBody.csrfToken
  check('csrf token issued', Boolean(csrfToken),
    `is ${BASE} really the WBR web app? got ${csrfRes.status} ${csrfRes.headers.get('content-type')}`)
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

  // ── Access counts vs raw SQL ──
  console.log('\n[access counts vs database]')
  const accessRes = await jarFetch(`${BASE}/api/data/access`)
  check('HTTP 200', accessRes.status === 200, `status ${accessRes.status}`)
  if (accessRes.status !== 200) return
  const access = await accessRes.json()
  check('payload has counts', Boolean(access.counts))
  if (!access.counts) return
  const c = access.counts
  check(`attendees = ${expected.attendees}`, c.attendees === expected.attendees, `got ${c.attendees}`)
  check(`speakers = ${expected.speakers}`, c.speakers === expected.speakers, `got ${c.speakers}`)
  check(`staff = ${expected.staff}`, c.staff === expected.staff, `got ${c.staff}`)
  check(`total users = ${expected.totalUsers}`, c.totalUsers === expected.totalUsers, `got ${c.totalUsers}`)
  // Optional: the original "500 attendees / 0 speakers" truncation signature.
  check('truncation signature gone (not 500/0)', !(c.attendees === 500 && c.speakers === 0))

  // ── Organizers card removed ──
  console.log('\n[organizers card removed]')
  check('counts.organizers is undefined', c.organizers === undefined, `got ${c.organizers}`)

  // ── Tile ⇔ section mapping: each tile === its destination section total ──
  console.log('\n[tile ⇔ section mapping]')

  // Attendees tile === the Attendees section's UNFILTERED total (no role param).
  const attRes = await jarFetch(`${BASE}/api/data/attendees?page=0`)
  check('attendees endpoint HTTP 200', attRes.status === 200, `status ${attRes.status}`)
  if (attRes.status === 200) {
    const att = await attRes.json()
    check(`attendees tile (${c.attendees}) === Attendees section total (${att.total})`,
      c.attendees === att.total)
  }

  // Speakers tile === length of the /api/data/speakers array (the directory).
  const spkRes = await jarFetch(`${BASE}/api/data/speakers`)
  check('speakers endpoint HTTP 200', spkRes.status === 200, `status ${spkRes.status}`)
  if (spkRes.status === 200) {
    const speakers = await spkRes.json()
    check('speakers endpoint returns an array', Array.isArray(speakers))
    if (Array.isArray(speakers)) {
      check(`speakers tile (${c.speakers}) === speaker directory length (${speakers.length})`,
        c.speakers === speakers.length)
    }
  }

  // Staff tile === the Staff section's total. Fetch page 0 once and reuse it
  // for the pagination checks below.
  const staffRes = await jarFetch(`${BASE}/api/data/staff?page=0`)
  check('staff endpoint HTTP 200', staffRes.status === 200, `status ${staffRes.status}`)
  let staff0 = null
  if (staffRes.status === 200) {
    staff0 = await staffRes.json()
    check(`staff tile (${c.staff}) === Staff section total (${staff0.total})`,
      c.staff === staff0.total)
  }

  // ── Staff section fully reachable through pagination (no row cap) ──
  console.log('\n[staff pagination]')
  if (staff0) {
    const total = staff0.total
    const pageSize = staff0.pageSize
    check('first page present', Array.isArray(staff0.rows) && (total === 0 || staff0.rows.length > 0))
    check(`staff total = oracle (${expected.staff})`, total === expected.staff, `got ${total}`)

    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
    const lastRes = await jarFetch(`${BASE}/api/data/staff?page=${lastPage}`)
    if (lastRes.status === 200) {
      const last = await lastRes.json()
      const expectedLastRows = total === 0 ? 0 : total - lastPage * pageSize
      check(`last page (${lastPage}) reachable with ${expectedLastRows} rows`,
        last.rows.length === expectedLastRows, `got ${last.rows.length}`)
      check('last page reports hasMore = false', last.hasMore === false)
    } else {
      check('last page reachable', false, `status ${lastRes.status}`)
    }

    // The original Access bug capped results at 500 rows. Only assert we serve
    // past row 500 when the dataset is actually large enough to prove it;
    // otherwise say so rather than passing a check that proves nothing.
    if (total > 500) {
      const beyondCap = await (await jarFetch(`${BASE}/api/data/staff?page=10`)).json() // rows 500–549
      check('rows beyond the old 500-row cap are served', beyondCap.rows.length > 0,
        `page 10 returned ${beyondCap.rows.length} rows`)
    } else {
      console.log(`  • cap check skipped — only ${total} staff, need > 500 to exercise the old cap`)
    }
  }

  // ── Server-rendered page carries the same numbers, and no organizers card ──
  console.log('\n[server-rendered /dashboard/access]')
  const pageRes = await jarFetch(`${BASE}/dashboard/access`)
  check('page HTTP 200', pageRes.status === 200, `status ${pageRes.status}`)
  if (pageRes.status === 200) {
    const html = await pageRes.text()
    const stat = key => {
      const m = html.match(new RegExp(`data-stat="${key}"[^>]*data-value="(\\d+)"`))
      return m ? Number(m[1]) : null
    }
    check(`HTML attendees stat = ${expected.attendees}`, stat('attendees') === expected.attendees,
      `got ${stat('attendees')}`)
    check(`HTML speakers stat = ${expected.speakers}`, stat('speakers') === expected.speakers,
      `got ${stat('speakers')}`)
    check(`HTML staff stat = ${expected.staff}`, stat('staff') === expected.staff,
      `got ${stat('staff')}`)
    check('no organizers stat card in HTML', !/data-stat="organizers"/.test(html))
  }

  // ── The Staff section page renders ──
  console.log('\n[server-rendered /dashboard/staff]')
  const staffPageRes = await jarFetch(`${BASE}/dashboard/staff`)
  check('page HTTP 200', staffPageRes.status === 200, `status ${staffPageRes.status}`)
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

console.log(failures === 0 ? '\nACCESS COUNTS TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
