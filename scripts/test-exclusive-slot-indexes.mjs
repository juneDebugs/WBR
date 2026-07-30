#!/usr/bin/env node
// Tests the DB-level exclusive-slot backstop: the partial unique indexes from
// scripts/migrate-exclusive-slot-indexes.mjs and the engine's
// exclusiveSlotConstraintError translator. Runs against a throwaway in-memory
// libSQL database (no Turso, no fixtures to clean up).
//
//   node scripts/test-exclusive-slot-indexes.mjs
//
// PII discipline: synthetic ids only.

import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

let failures = 0
const check = (name, cond, detail = '') =>
  cond ? console.log(`  ✓ ${name}`) : (failures++, console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`))
async function expectFail(name, run) {
  try { await run(); failures++; console.error(`  ✗ ${name} — expected a UNIQUE violation, but it succeeded`); return null }
  catch (e) { console.log(`  ✓ ${name} (rejected)`); return e }
}

const E = await import(pathToFileURL(join(ROOT, 'packages/db/src/meeting-engine.ts')).href)

// The exact DDL the migration applies (index names come from the engine so a
// rename there is caught here).
const IDX = E.EXCLUSIVE_SLOT_INDEXES
const INDEX_DDL = [
  `CREATE UNIQUE INDEX "${IDX.sponsorBlock}" ON "SponsorMeeting" ("sponsorId", "timeBlockId") WHERE status = 'CONFIRMED'`,
  `CREATE UNIQUE INDEX "${IDX.userBlock}" ON "SponsorMeeting" ("userId", "timeBlockId") WHERE status = 'CONFIRMED'`,
  `CREATE UNIQUE INDEX "${IDX.sponsorUser}" ON "SponsorMeeting" ("sponsorId", "userId") WHERE status = 'CONFIRMED'`,
]
let seq = 0
const insert = (db, sponsorId, userId, timeBlockId, status = 'CONFIRMED') =>
  db.execute({
    sql: `INSERT INTO "SponsorMeeting" (id, sponsorId, userId, timeBlockId, status) VALUES (?, ?, ?, ?, ?)`,
    args: [`m${++seq}`, sponsorId, userId, timeBlockId, status],
  })

async function main() {
  // ── Unit: the constraint translator maps each index to the right code ──
  console.log('exclusiveSlotConstraintError — message + P2002 shapes')
  const mk = (msg) => ({ message: `SQLITE_CONSTRAINT_UNIQUE: ${msg}` })
  check('sponsor+block → SPONSOR_FULL',
    E.exclusiveSlotConstraintError(mk('UNIQUE constraint failed: SponsorMeeting.sponsorId, SponsorMeeting.timeBlockId'))?.code === 'SPONSOR_FULL')
  check('user+block → CANDIDATE_BUSY',
    E.exclusiveSlotConstraintError(mk('UNIQUE constraint failed: SponsorMeeting.userId, SponsorMeeting.timeBlockId'))?.code === 'CANDIDATE_BUSY')
  check('sponsor+user → ALREADY_SCHEDULED',
    E.exclusiveSlotConstraintError(mk('UNIQUE constraint failed: SponsorMeeting.sponsorId, SponsorMeeting.userId'))?.code === 'ALREADY_SCHEDULED')
  check('Prisma P2002 target array → mapped',
    E.exclusiveSlotConstraintError({ code: 'P2002', meta: { target: ['sponsorId', 'timeBlockId'] } })?.code === 'SPONSOR_FULL')
  check('P2002 target reported as index NAME → mapped',
    E.exclusiveSlotConstraintError({ code: 'P2002', meta: { target: E.EXCLUSIVE_SLOT_INDEXES.sponsorUser } })?.code === 'ALREADY_SCHEDULED')
  check('non-constraint error → null', E.exclusiveSlotConstraintError(new Error('network down')) === null)
  check('foreign-key violation (not unique) → null',
    E.exclusiveSlotConstraintError({ message: 'FOREIGN KEY constraint failed' }) === null)
  check('UNRELATED unique violation (primary key) → null (propagates, not masked)',
    E.exclusiveSlotConstraintError(mk('UNIQUE constraint failed: SponsorMeeting.id')) === null)

  // ── Precheck: the migration must DETECT duplicates before creating indexes ──
  console.log('\nmigration precheck — duplicates block index creation')
  const pre = createClient({ url: ':memory:' })
  await pre.execute(`CREATE TABLE "SponsorMeeting" (id TEXT PRIMARY KEY, sponsorId TEXT, userId TEXT, timeBlockId TEXT, status TEXT)`)
  await insert(pre, 's1', 'u1', 'b1')
  await insert(pre, 's1', 'u2', 'b1')  // same sponsor+block → a violation group
  const dup = await pre.execute(
    `SELECT sponsorId, timeBlockId, COUNT(*) c FROM "SponsorMeeting" WHERE status='CONFIRMED' GROUP BY sponsorId, timeBlockId HAVING c > 1`)
  check('precheck finds the sponsor+block duplicate group', dup.rows.length === 1, `rows=${dup.rows.length}`)
  await expectFail('creating the index over duplicates fails', () => pre.execute(INDEX_DDL[0]))

  // ── Enforcement: on clean data the indexes reject every double-book shape ──
  console.log('\nindex enforcement — clean data')
  const db = createClient({ url: ':memory:' })
  await db.execute(`CREATE TABLE "SponsorMeeting" (id TEXT PRIMARY KEY, sponsorId TEXT, userId TEXT, timeBlockId TEXT, status TEXT)`)
  for (const ddl of INDEX_DDL) await db.execute(ddl)

  await insert(db, 's1', 'u1', 'b1')
  check('first CONFIRMED meeting inserts', true)

  const e1 = await expectFail('second sponsor meeting in the same block → rejected', () => insert(db, 's1', 'u2', 'b1'))
  check('  → translates to SPONSOR_FULL', E.exclusiveSlotConstraintError(e1)?.code === 'SPONSOR_FULL', E.exclusiveSlotConstraintError(e1)?.code)

  const e2 = await expectFail('same attendee in the same block (other sponsor) → rejected', () => insert(db, 's2', 'u1', 'b1'))
  check('  → translates to CANDIDATE_BUSY', E.exclusiveSlotConstraintError(e2)?.code === 'CANDIDATE_BUSY', E.exclusiveSlotConstraintError(e2)?.code)

  const e3 = await expectFail('same pair in a different block → rejected', () => insert(db, 's1', 'u1', 'b2'))
  check('  → translates to ALREADY_SCHEDULED', E.exclusiveSlotConstraintError(e3)?.code === 'ALREADY_SCHEDULED', E.exclusiveSlotConstraintError(e3)?.code)

  await insert(db, 's1', 'u2', 'b1', 'CANCELLED')
  check('a CANCELLED duplicate is allowed (partial index excludes it)', true)

  await insert(db, 's9', 'u9', 'b9')
  check('a fully distinct CONFIRMED meeting inserts', true)
}

try { await main() }
catch (e) { failures++; console.error('  ✗ unexpected error:', e) }
console.log(failures ? `\n❌ ${failures} FAILED` : '\n✅ ALL PASSED')
process.exit(failures ? 1 : 0)
