#!/usr/bin/env node
// Acceptance test for the redone WBR test accounts.
//
// Verifies three independent layers so they can never silently drift:
//
//   1. POLICY — the shared single-source-of-truth access module
//      (packages/db/src/app-access.ts) grants exactly the goal access matrix
//      for the three account tiers:
//         App            | WBR | Brand | Sponsor
//         web (Admin)    |  ✓  |   ✗   |   ✗
//         meetings       |  ✓  |   ✓   |   ✗
//         sponsor        |  ✓  |   ✗   |   ✓
//         attendee (PWA) |  ✓  |   ✓   |   ✓
//
//   2. WIRING — every app's login path (app/api/login/route.ts AND
//      lib/auth.ts) actually calls canAccessApp() for its own app, so the
//      policy is enforced on the code path the login form hits.
//
//   3. DATA — the live database (the same Turso DB the apps read) holds exactly
//      the 3 new accounts with the right role/sponsor wiring and a password
//      that verifies to `password123`, the 5 legacy demo accounts are gone, and
//      the ~1,000 seeded directory users are untouched.
//
//   node scripts/test-test-accounts.mjs
//
// No running server required. Reads TURSO_* from apps/web/.env.local (or env).

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scryptAsync = promisify(scrypt)

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function section(t) { console.log(`\n${t}`) }

// ── The spec ─────────────────────────────────────────────────────────────────
// The three accounts and the app-access matrix straight from the goal. The test
// hardcodes the DESIRED matrix here (the requirement) and checks the shared
// policy module against it — so a regression in the module is caught.
const ACCOUNTS = {
  WBR:     { email: 'wbr@test.com',     password: 'password123', role: 'ORGANIZER', sponsorId: null, name: 'WBR' },
  Brand:   { email: 'stephcurry@test.com',   password: 'password123', role: 'BRAND',     sponsorId: null, name: 'Steph Curry' },
  Sponsor: { email: 'sponsor@test.com', password: 'password123', role: 'SPONSOR',   sponsorId: 'cmngb2h4h0007vm28mbcpxjg5', name: 'Sponsor' },
}
const GOAL = {
  web:      { WBR: true, Brand: false, Sponsor: false },
  meetings: { WBR: true, Brand: true,  Sponsor: false },
  sponsor:  { WBR: true, Brand: false, Sponsor: true  },
  attendee: { WBR: true, Brand: true,  Sponsor: true  },
}
const LEGACY_EMAILS = ['june@tailor.tech', 'steph@curry.com', 'staff@wbr.com', 'sponsor@shopify.com', 'sponsor@klaviyo.com']

// ── Password verify (mirrors packages/db/src/index.ts) ───────────────────────
async function verifyPassword(password, stored) {
  const [hashed, salt, costStr] = String(stored).split('.')
  if (!hashed || !salt) return false
  const N = costStr ? parseInt(costStr, 10) : 16384
  const buf = await scryptAsync(password, salt, 64, { N, r: 8, p: 1 })
  const a = Buffer.from(hashed, 'hex')
  return a.length === buf.length && timingSafeEqual(a, buf)
}

function readEnvLocal() {
  const env = {}
  try {
    for (const line of readFileSync(join(ROOT, 'apps/web/.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}

async function main() {
  // ── Layer 1: POLICY ────────────────────────────────────────────────────────
  section('1. Access policy (packages/db/src/app-access.ts) matches the goal matrix')
  const policy = await import(join(ROOT, 'packages/db/src/app-access.ts'))
  const { canAccessApp, APP_ALLOWED_ROLES } = policy
  check('module exports canAccessApp + APP_ALLOWED_ROLES', typeof canAccessApp === 'function' && !!APP_ALLOWED_ROLES)
  for (const app of Object.keys(GOAL)) {
    for (const acct of Object.keys(ACCOUNTS)) {
      const got = canAccessApp(app, ACCOUNTS[acct].role)
      const want = GOAL[app][acct]
      check(`${app.padEnd(9)} ${acct.padEnd(8)} (${ACCOUNTS[acct].role}) → ${want ? 'allow' : 'deny'}`, got === want, `got ${got}`)
    }
  }
  // A disallowed role must be rejected, and a null role must never pass.
  check('canAccessApp(null) is false', canAccessApp('web', null) === false)
  check('sponsor app denies a plain ATTENDEE', canAccessApp('sponsor', 'ATTENDEE') === false)
  check('meetings app denies a SPONSOR', canAccessApp('meetings', 'SPONSOR') === false)

  // ── Layer 2: WIRING ──────────────────────────────────────────────────────────
  section('2. Every app login path calls canAccessApp() for its own app')
  for (const app of ['web', 'meetings', 'sponsor', 'attendee']) {
    const loginRoute = readFileSync(join(ROOT, `apps/${app}/app/api/login/route.ts`), 'utf8')
    check(`${app}/app/api/login/route.ts gates canAccessApp('${app}', …)`, loginRoute.includes(`canAccessApp('${app}'`))
    const authTs = readFileSync(join(ROOT, `apps/${app}/lib/auth.ts`), 'utf8')
    check(`${app}/lib/auth.ts gates canAccessApp('${app}', …)`, authTs.includes(`canAccessApp('${app}'`))
  }

  // ── Layer 3: DATA (live Turso) ───────────────────────────────────────────────
  section('3. Live database holds the 3 accounts, legacy gone, directory intact')
  const envLocal = readEnvLocal()
  const url = process.env.TURSO_DATABASE_URL ?? envLocal.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
  if (!url || !token) { console.error('  ✗ no TURSO_* credentials found'); failures++; return }
  const req = createRequire(join(ROOT, 'packages/db/package.json'))
  const { createClient } = req('@libsql/client')
  const db = createClient({ url, authToken: token })
  console.log(`  (Turso ${url.slice(0, 40)}…)`)

  for (const [label, a] of Object.entries(ACCOUNTS)) {
    const r = await db.execute({ sql: 'SELECT id, email, name, role, sponsorId, password FROM User WHERE email = ?', args: [a.email] })
    const u = r.rows[0]
    check(`${label} account exists (${a.email})`, !!u)
    if (!u) continue
    check(`${label} role = ${a.role}`, u.role === a.role, `got ${u.role}`)
    check(`${label} sponsorId = ${a.sponsorId ?? 'null'}`, (u.sponsorId ?? null) === a.sponsorId, `got ${u.sponsorId}`)
    check(`${label} name = ${a.name}`, u.name === a.name, `got ${u.name}`)
    const ok = u.password ? await verifyPassword(a.password, u.password) : false
    check(`${label} password verifies to '${a.password}'`, ok)
  }

  const legacy = await db.execute({
    sql: `SELECT COUNT(*) c FROM User WHERE email IN (${LEGACY_EMAILS.map(() => '?').join(',')})`,
    args: LEGACY_EMAILS,
  })
  check('all 5 legacy demo accounts are erased', Number(legacy.rows[0].c) === 0, `${legacy.rows[0].c} remain`)

  const total = await db.execute('SELECT COUNT(*) c FROM User')
  check('directory population intact (≥ 990 users)', Number(total.rows[0].c) >= 990, `${total.rows[0].c} users`)
  const attendees = await db.execute("SELECT COUNT(*) c FROM User WHERE role = 'ATTENDEE'")
  check('seeded attendees intact (≥ 900)', Number(attendees.rows[0].c) >= 900, `${attendees.rows[0].c} attendees`)

  // Exactly one account per new tier — no stray duplicates.
  const brandCnt = await db.execute("SELECT COUNT(*) c FROM User WHERE role = 'BRAND'")
  check('exactly one BRAND account', Number(brandCnt.rows[0].c) === 1, `${brandCnt.rows[0].c}`)
  const sponsorCnt = await db.execute("SELECT COUNT(*) c FROM User WHERE role = 'SPONSOR'")
  check('exactly one SPONSOR account', Number(sponsorCnt.rows[0].c) === 1, `${sponsorCnt.rows[0].c}`)
}

main()
  .then(() => {
    console.log(`\n${failures === 0 ? '✅ PASS' : `❌ FAIL (${failures})`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
  .catch((e) => { console.error(e); process.exit(1) })
