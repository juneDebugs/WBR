#!/usr/bin/env node
// Adds User.loginCount and seeds a plausible historical baseline so the admin
// Meetings → Companies "Num of logins" column is populated for the demo. After
// this, every successful sign-in increments the count live (recordLogin() in
// packages/db, called from each app's authorize()/signIn — see
// packages/db/src/login-tracking.ts).
//
// Two idempotent steps:
//   1. ALTER TABLE "User" ADD COLUMN "loginCount" INTEGER NOT NULL DEFAULT 0
//      (skipped if the column already exists — SQLite has no ADD COLUMN IF NOT
//      EXISTS, so we check PRAGMA table_info first). Matches the User model in
//      packages/db/prisma/schema.prisma.
//   2. Seed a deterministic baseline for every user whose loginCount is still 0.
//      The value is derived from a hash of the user id, so re-running never
//      changes an already-seeded row and never double-counts. Sponsor reps land
//      in a healthy 3–34 range; the per-company column sums across a sponsor's
//      reps.
//
// Targets Turso when TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are present (in env or
// apps/*/.env.local), else the local packages/db/prisma/dev.db fallback — the
// same connection strategy the other seed/migrate scripts use.
//
//   node scripts/migrate-login-count.mjs            # auto-detect Turso, else local
//   node scripts/migrate-login-count.mjs --local    # force local dev.db
//   node scripts/migrate-login-count.mjs --dry-run  # report, change nothing
//
import { readFileSync, copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORCE_LOCAL = process.argv.includes('--local')
const DRY_RUN = process.argv.includes('--dry-run')

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
  if (!FORCE_LOCAL && url && token && url.startsWith('libsql://')) {
    console.log('→ target: Turso', url.replace(/(libsql:\/\/[^.]+).*/, '$1…'))
    return { db: createClient({ url, authToken: token }), isLocal: false }
  }
  const file = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
  console.log('→ target: local', file)
  return { db: createClient({ url: file }), isLocal: true }
}

function fanOutLocal() {
  const src = join(ROOT, 'packages/db/prisma/dev.db')
  const targets = [
    'apps/attendee/dev.db', 'apps/web/dev.db', 'apps/sponsor/dev.db',
    'apps/meetings/dev.db', 'packages/db/dev.db',
  ]
  for (const t of targets) {
    const dest = join(ROOT, t)
    try {
      if (existsSync(dest)) { copyFileSync(src, dest); console.log(`  ↪ synced ${t}`) }
    } catch (e) { console.warn(`  ! could not sync ${t}: ${e.message}`) }
  }
}

// Deterministic FNV-1a hash → stable per-user baseline. Reps get a meaningful
// 3–34 spread; attendees (no sponsorId, not shown in the table) get a lighter
// 1–12 so the data is coherent everywhere without over-inflating.
function seedFor(id, isRep) {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const n = (h >>> 0)
  return isRep ? 3 + (n % 32) : 1 + (n % 12)
}

async function columnExists(db, table, column) {
  const res = await db.execute(`PRAGMA table_info("${table}")`)
  return res.rows.some(r => String(r.name) === column)
}

async function main() {
  const { db, isLocal } = openDb()

  // ── Step 1: add the column ─────────────────────────────────────────────────
  if (await columnExists(db, 'User', 'loginCount')) {
    console.log('= User.loginCount already exists — skipping ADD COLUMN')
  } else if (DRY_RUN) {
    console.log('(dry) would ADD COLUMN User.loginCount INTEGER NOT NULL DEFAULT 0')
  } else {
    await db.execute(`ALTER TABLE "User" ADD COLUMN "loginCount" INTEGER NOT NULL DEFAULT 0`)
    console.log('✓ added User.loginCount')
  }

  // In a pure dry-run against a DB without the column there is nothing to seed.
  if (DRY_RUN && !(await columnExists(db, 'User', 'loginCount'))) {
    console.log('(dry) column not present yet — skipping seed preview')
    return
  }

  // ── Step 2: seed the baseline for un-seeded rows ───────────────────────────
  const users = await db.execute(
    `SELECT id, sponsorId, loginCount FROM "User"`
  )
  let seeded = 0
  let repSeeded = 0
  for (const row of users.rows) {
    if (Number(row.loginCount) !== 0) continue // preserve real/accumulated counts
    const id = String(row.id)
    const isRep = row.sponsorId != null && String(row.sponsorId) !== ''
    const value = seedFor(id, isRep)
    if (!DRY_RUN) {
      await db.execute({
        sql: `UPDATE "User" SET loginCount = ? WHERE id = ?`,
        args: [value, id],
      })
    }
    seeded++
    if (isRep) repSeeded++
  }
  console.log(`${DRY_RUN ? '(dry) ' : ''}seeded ${seeded} user(s) (${repSeeded} sponsor rep(s))`)

  // Per-company totals so the result is easy to eyeball against the table.
  const perCompany = await db.execute(
    `SELECT s.name, COALESCE(SUM(u.loginCount), 0) AS logins, COUNT(u.id) AS reps
     FROM "Sponsor" s
     LEFT JOIN "User" u ON u.sponsorId = s.id
     GROUP BY s.id, s.name
     ORDER BY logins DESC, s.name ASC`
  )
  console.log('\nNum of logins per company:')
  for (const r of perCompany.rows) {
    console.log(`  ${String(r.name).padEnd(18)} ${String(Number(r.logins)).padStart(3)}  (${Number(r.reps)} rep${Number(r.reps) === 1 ? '' : 's'})`)
  }

  if (!DRY_RUN && isLocal) fanOutLocal()
  console.log('\nDone.')
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1) })
