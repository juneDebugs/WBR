#!/usr/bin/env node
// Logic + persistence test for the per-sponsor Meeting Tables feature
// (packages/db/src/meeting-engine.ts — "Per-sponsor meeting tables" section).
// No server needed — exercises the pure helpers and the DB layer against a
// scratch SQLite database whose DDL is cloned from the real dev DB, so schema
// drift is impossible. Sponsor.tableNumber is present in that DDL (added by
// `prisma db push`) and also created defensively at runtime by the module under
// test (mirrors the production Turso path).
//
// Covers:
//   1. '@conference/db' re-exports './meeting-engine' and schema.prisma carries
//      Sponsor.tableNumber + the runtime ALTER/ensure guard exists.
//   2. normalizeTableNumber / sponsorTableLabel clamp hostile input.
//   3. getSponsorTables: every sponsor, brand marks, meetingCount, sort, totals.
//   4. assignSponsorTable: assign, backfill location, uniqueness (TABLE_NUMBER_TAKEN),
//      range (BAD_STATUS), unknown sponsor (SPONSOR_NOT_FOUND), clear.
//   5. autoPopulateSponsorTables: fills unassigned deterministically, preserves
//      existing numbers, packs skipping taken, backfills, second run no-op.
//   6. getSponsorFixedTableLabel: label / null / unknown.
//   7. Creation-path wiring: assignMeeting stamps the sponsor's fixed table,
//      overriding the caller's room hint.
//
//   node scripts/test-sponsor-tables.mjs
//
// Exits 0 on all-pass, 1 on failure.

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DB = join(ROOT, 'packages/db/prisma/dev.db')

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
async function expectCode(name, fn, code) {
  try {
    await fn()
    check(name, false, `expected EngineError ${code}, nothing thrown`)
  } catch (err) {
    check(name, err?.name === 'EngineError' && err?.code === code, `got ${err?.code ?? err?.message}`)
  }
}

const mod = await import(join(ROOT, 'packages/db/src/meeting-engine.ts'))
const {
  normalizeTableNumber,
  sponsorTableLabel,
  getSponsorTables,
  assignSponsorTable,
  autoPopulateSponsorTables,
  getSponsorFixedTableLabel,
  assignMeeting,
  MAX_TABLE_NUMBER,
} = mod

// ─── 1. re-export + schema parity ────────────────────────────────────────────
console.log('[@conference/db re-export + schema parity]')
{
  const indexSrc = readFileSync(join(ROOT, 'packages/db/src/index.ts'), 'utf8')
  check("index.ts re-exports './meeting-engine'", /export\s+\*\s+from\s+['"]\.\/meeting-engine['"]/.test(indexSrc))
  const schema = readFileSync(join(ROOT, 'packages/db/prisma/schema.prisma'), 'utf8')
  const model = schema.match(/model Sponsor \{[\s\S]*?\n\}/)?.[0] ?? ''
  check('schema.prisma Sponsor carries tableNumber', /\btableNumber\s+Int\?/.test(model))
  check('schema.prisma has the per-conference unique', /@@unique\(\[conferenceId,\s*tableNumber\]\)/.test(model))
  const engineSrc = readFileSync(join(ROOT, 'packages/db/src/meeting-engine.ts'), 'utf8')
  check('engine adds the column defensively (ALTER ... ADD COLUMN tableNumber)',
    /ALTER TABLE "Sponsor" ADD COLUMN "tableNumber"/.test(engineSrc))
  check('engine exports ensureSponsorTableColumn', typeof mod.ensureSponsorTableColumn === 'function')
}

// ─── 2. pure helpers ─────────────────────────────────────────────────────────
console.log('\n[normalizeTableNumber / sponsorTableLabel]')
{
  check('plain int passes', normalizeTableNumber(7) === 7)
  check('numeric string passes', normalizeTableNumber('12') === 12)
  check('truncates fractions', normalizeTableNumber(3.9) === 3)
  check('zero → null', normalizeTableNumber(0) === null)
  check('negative → null', normalizeTableNumber(-4) === null)
  check(`above ${MAX_TABLE_NUMBER} → null`, normalizeTableNumber(MAX_TABLE_NUMBER + 1) === null)
  check('empty string → null', normalizeTableNumber('') === null)
  check('non-numeric → null', normalizeTableNumber('abc') === null)
  check('null → null', normalizeTableNumber(null) === null)
  check('label formats', sponsorTableLabel(5) === 'Table 5')
  check('label of null → null', sponsorTableLabel(null) === null)
  check('label normalizes', sponsorTableLabel('9') === 'Table 9')
}

// ─── scratch DB ──────────────────────────────────────────────────────────────
const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')
const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-sponsor-tables-'))
const scratchPath = join(scratchDir, 'test.db')

const source = createClient({ url: `file:${SOURCE_DB}` })
const ddl = await source.execute(
  `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
   ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid`,
)
source.close?.()
const scratch = createClient({ url: `file:${scratchPath}` })
for (const row of ddl.rows) await scratch.execute(row.sql)

// Seed: four sponsors under the engine's fallback conference id (conf-2025),
// Beta pre-numbered Table 2 (to prove preservation); three CONFIRMED meetings
// (two for Acme, one for Beta) plus a free block + a pending request for the
// creation-path test.
const NOW = new Date().toISOString()
const T1 = '2026-09-01T18:00:00.000Z', T1E = '2026-09-01T18:30:00.000Z'
const T2 = '2026-09-01T19:00:00.000Z', T2E = '2026-09-01T19:30:00.000Z'
const T3 = '2026-09-01T20:00:00.000Z', T3E = '2026-09-01T20:30:00.000Z'
await scratch.execute('PRAGMA foreign_keys=OFF')
await scratch.execute({
  sql: `INSERT INTO "Sponsor" ("id","conferenceId","name","tier","logoUrl","tableNumber","createdAt") VALUES
        ('sp-a','conf-2025','Acme Corp','PLATINUM','data:image/png;base64,AAA', NULL, ?),
        ('sp-b','conf-2025','Beta LLC','GOLD', NULL, 2, ?),
        ('sp-c','conf-2025','Cypress Inc','GOLD', NULL, NULL, ?),
        ('sp-d','conf-2025','Delta Co','SILVER', NULL, NULL, ?)`,
  args: [NOW, NOW, NOW, NOW],
})
await scratch.execute({
  sql: `INSERT INTO "User" ("id","name","email","company","updatedAt") VALUES
        ('u-1','Uma One','u1@test.com','RetailCo', ?),
        ('u-2','Vic Two','u2@test.com','ShopCo', ?),
        ('u-3','Wes Three','u3@test.com','MartCo', ?)`,
  args: [NOW, NOW, NOW],
})
await scratch.execute({
  sql: `INSERT INTO "TimeBlock" ("id","conferenceId","startsAt","endsAt") VALUES
        ('tb-1','conf-2025',?,?), ('tb-2','conf-2025',?,?), ('tb-free','conf-2025',?,?)`,
  args: [T1, T1E, T2, T2E, T3, T3E],
})
await scratch.execute({
  sql: `INSERT INTO "SponsorMeeting" ("id","sponsorId","userId","timeBlockId","location","status","createdAt") VALUES
        ('sm-1','sp-a','u-1','tb-1', NULL, 'CONFIRMED', ?),
        ('sm-2','sp-a','u-2','tb-2', NULL, 'CONFIRMED', ?),
        ('sm-3','sp-b','u-1','tb-2', 'Table 2', 'CONFIRMED', ?)`,
  args: [NOW, NOW, NOW],
})
await scratch.execute({
  sql: `INSERT INTO "MeetingRequest" ("id","requesterId","targetSponsorId","status","priority","timeBlockId","createdAt","updatedAt") VALUES
        ('req-1','u-3','sp-a','PENDING','MED','tb-free', ?, ?)`,
  args: [NOW, NOW],
})
scratch.close?.()

process.env.DATABASE_URL = `file:${scratchPath}`
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
const { PrismaClient } = req('@prisma/client')
const prisma = new PrismaClient()

// ─── 3. getSponsorTables ─────────────────────────────────────────────────────
console.log('\n[getSponsorTables]')
{
  const board = await getSponsorTables(prisma)
  check('all four sponsors present', board.entries.length === 4, `got ${board.entries.length}`)
  const beta = board.entries.find(e => e.sponsorId === 'sp-b')
  check('pre-set number surfaces', beta?.tableNumber === 2, JSON.stringify(beta))
  check('brand marks ride along (logo/name/tier)',
    board.entries.find(e => e.sponsorId === 'sp-a')?.logoUrl?.startsWith('data:image') === true &&
    board.entries.find(e => e.sponsorId === 'sp-a')?.name === 'Acme Corp' &&
    board.entries.find(e => e.sponsorId === 'sp-a')?.tier === 'PLATINUM')
  check('meetingCount counts confirmed', board.entries.find(e => e.sponsorId === 'sp-a')?.meetingCount === 2)
  check('assigned slots sort ahead of unassigned', board.entries[0].tableNumber !== null)
  check('totals well-formed', board.totals.sponsors === 4 && board.totals.assigned === 1 &&
    board.totals.unassigned === 3 && board.totals.highestNumber === 2, JSON.stringify(board.totals))
}

// ─── 4. assignSponsorTable ───────────────────────────────────────────────────
console.log('\n[assignSponsorTable]')
{
  const board = await assignSponsorTable(prisma, { sponsorId: 'sp-a', tableNumber: 1 })
  check('assigns Acme → 1', board.entries.find(e => e.sponsorId === 'sp-a')?.tableNumber === 1)
  const locs = await prisma.sponsorMeeting.findMany({ where: { sponsorId: 'sp-a' }, select: { id: true, location: true } })
  check('backfills all Acme meetings to Table 1', locs.every(m => m.location === 'Table 1'), JSON.stringify(locs))

  await expectCode('taken number → TABLE_NUMBER_TAKEN',
    () => assignSponsorTable(prisma, { sponsorId: 'sp-c', tableNumber: 2 }), 'TABLE_NUMBER_TAKEN')
  await expectCode('zero → BAD_STATUS',
    () => assignSponsorTable(prisma, { sponsorId: 'sp-c', tableNumber: 0 }), 'BAD_STATUS')
  await expectCode(`over ${MAX_TABLE_NUMBER} → BAD_STATUS`,
    () => assignSponsorTable(prisma, { sponsorId: 'sp-c', tableNumber: MAX_TABLE_NUMBER + 1 }), 'BAD_STATUS')
  await expectCode('unknown sponsor → SPONSOR_NOT_FOUND',
    () => assignSponsorTable(prisma, { sponsorId: 'nope', tableNumber: 9 }), 'SPONSOR_NOT_FOUND')

  // Re-assigning a sponsor its own number is fine (no self-clash).
  const same = await assignSponsorTable(prisma, { sponsorId: 'sp-b', tableNumber: 2 })
  check('re-assigning own number allowed', same.entries.find(e => e.sponsorId === 'sp-b')?.tableNumber === 2)

  // Clear.
  const cleared = await assignSponsorTable(prisma, { sponsorId: 'sp-a', tableNumber: null })
  check('clearing sets tableNumber null', cleared.entries.find(e => e.sponsorId === 'sp-a')?.tableNumber === null)
  const clearedLocs = await prisma.sponsorMeeting.findMany({ where: { sponsorId: 'sp-a' }, select: { location: true } })
  check('clearing nulls the meeting locations', clearedLocs.every(m => m.location === null))
}

// ─── 5. autoPopulateSponsorTables ────────────────────────────────────────────
console.log('\n[autoPopulateSponsorTables]')
{
  // State: sp-b = 2 (kept); sp-a, sp-c, sp-d unassigned.
  const res = await autoPopulateSponsorTables(prisma)
  check('assigns the three unassigned', res.assigned === 3, JSON.stringify({ assigned: res.assigned, total: res.total }))
  const byId = Object.fromEntries(res.board.entries.map(e => [e.sponsorId, e.tableNumber]))
  check('preserves Beta at 2', byId['sp-b'] === 2, JSON.stringify(byId))
  // Deterministic fill order: PLATINUM Acme first (1), then GOLD Cypress (3, since 2 is taken), then SILVER Delta (4).
  check('Acme (PLATINUM) gets 1', byId['sp-a'] === 1, JSON.stringify(byId))
  check('Cypress (GOLD) skips the taken 2 → 3', byId['sp-c'] === 3, JSON.stringify(byId))
  check('Delta (SILVER) gets 4', byId['sp-d'] === 4, JSON.stringify(byId))
  check('no duplicate numbers', new Set(Object.values(byId)).size === 4)

  const acmeLocs = await prisma.sponsorMeeting.findMany({ where: { sponsorId: 'sp-a' }, select: { location: true } })
  check('auto-populate backfills Acme meetings to Table 1', acmeLocs.every(m => m.location === 'Table 1'))

  const again = await autoPopulateSponsorTables(prisma)
  check('second run is a no-op', again.assigned === 0, JSON.stringify({ assigned: again.assigned }))
}

// ─── 6. getSponsorFixedTableLabel ────────────────────────────────────────────
console.log('\n[getSponsorFixedTableLabel]')
{
  check('returns the label', (await getSponsorFixedTableLabel(prisma, 'sp-a')) === 'Table 1')
  check('unknown sponsor → null', (await getSponsorFixedTableLabel(prisma, 'nope')) === null)
  await assignSponsorTable(prisma, { sponsorId: 'sp-d', tableNumber: null })
  check('unassigned sponsor → null', (await getSponsorFixedTableLabel(prisma, 'sp-d')) === null)
}

// ─── 7. creation-path wiring (assignMeeting stamps the fixed table) ──────────
console.log('\n[creation-path wiring]')
{
  // Acme (sp-a) sits at Table 1. A brand-new meeting for Acme must inherit
  // Table 1 even though the caller passes a different room hint.
  const meeting = await assignMeeting(prisma, { requestId: 'req-1', timeBlockId: 'tb-free', room: 'Table 6' })
  check('new meeting inherits the sponsor fixed table, not the room hint',
    meeting.location === 'Table 1', `got ${meeting.location}`)
}

await prisma.$disconnect()

console.log(failures === 0 ? '\n✓ all sponsor-tables logic/persistence checks passed' : `\n✗ ${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
