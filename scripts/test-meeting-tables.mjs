#!/usr/bin/env node
// Logic + persistence test for the admin Meeting Tables feature
// (packages/db/src/meeting-engine.ts — "Meeting tables" + "Table assignment
// board" sections). No server needed — exercises the pure helpers and the DB
// layer against a scratch SQLite database whose DDL is cloned from the real
// dev DB, so schema drift is impossible. The MeetingTableSetting table itself
// is created defensively at runtime by the module under test (mirrors the
// production Turso path).
//
// Covers:
//   1. '@conference/db' re-exports './meeting-engine' (index.ts static check)
//      and the schema.prisma model matches the runtime DDL columns.
//   2. normalizeTableName / normalizeTableCapacity clamp hostile input.
//   3. getMeetingTables: empty DB → the constant MEETING_ROOMS defaults.
//   4. saveMeetingTables: first write seeds the defaults; add / duplicate /
//      rename (migrating SponsorMeeting.location) / capacity / remove guards
//      (TABLE_IN_USE, LAST_TABLE, TABLE_NOT_FOUND, DUPLICATE_TABLE).
//   5. setMeetingTable: assign, clear, UNKNOWN_ROOM, global per-block capacity
//      (TABLE_TAKEN across different sponsors), status guards.
//   6. getTableBoard: totals, per-slot conflict detection, unknown-table flag.
//   7. autoAssignTables: fills unassigned deterministically, respects existing
//      assignments, only moves conflicts when asked, counts unplaced.
//   8. Engine integration: getSponsorScheduleMatrix.rooms and availability
//      rooms reflect the custom inventory; rescheduleMeeting accepts a custom
//      table and rejects a removed one.
//
//   node scripts/test-meeting-tables.mjs
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
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
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
  MEETING_ROOMS,
  normalizeTableName,
  normalizeTableCapacity,
  getMeetingTables,
  saveMeetingTables,
  setMeetingTable,
  getTableBoard,
  autoAssignTables,
  getSponsorScheduleMatrix,
  getMeetingRescheduleAvailability,
  rescheduleMeeting,
  MAX_TABLE_NAME_LENGTH,
} = mod

// ─── 1. re-export + schema/DDL parity ────────────────────────────────────────
console.log('[@conference/db re-export + schema parity]')
{
  const indexSrc = readFileSync(join(ROOT, 'packages/db/src/index.ts'), 'utf8')
  check("index.ts re-exports './meeting-engine'", /export\s+\*\s+from\s+['"]\.\/meeting-engine['"]/.test(indexSrc))
  const schema = readFileSync(join(ROOT, 'packages/db/prisma/schema.prisma'), 'utf8')
  const model = schema.match(/model MeetingTableSetting \{[\s\S]*?\}/)?.[0] ?? ''
  check('schema.prisma has the MeetingTableSetting model', model.length > 0)
  for (const col of ['name', 'capacity', 'position', 'updatedAt']) {
    check(`model carries "${col}"`, new RegExp(`\\b${col}\\b`).test(model))
  }
  const engineSrc = readFileSync(join(ROOT, 'packages/db/src/meeting-engine.ts'), 'utf8')
  const ddl = engineSrc.match(/CREATE TABLE IF NOT EXISTS "MeetingTableSetting"[\s\S]*?\)`/)?.[0] ?? ''
  for (const col of ['"name" TEXT NOT NULL PRIMARY KEY', '"capacity" INTEGER NOT NULL', '"position" INTEGER NOT NULL', '"updatedAt" DATETIME NOT NULL']) {
    check(`runtime DDL declares ${col.split(' ')[0]}`, ddl.includes(col))
  }
}

// ─── 2. pure helpers ─────────────────────────────────────────────────────────
console.log('\n[normalizeTableName / normalizeTableCapacity]')
{
  check('trims whitespace', normalizeTableName('  Table 9  ') === 'Table 9')
  check('empty → null', normalizeTableName('') === null)
  check('whitespace-only → null', normalizeTableName('   ') === null)
  check('non-string → null', normalizeTableName(42) === null)
  check(`caps at ${MAX_TABLE_NAME_LENGTH} chars`, normalizeTableName('x'.repeat(200)).length === MAX_TABLE_NAME_LENGTH)
  check('capacity passes a plain int', normalizeTableCapacity(4) === 4)
  check('capacity clamps below 1', normalizeTableCapacity(0) === 1)
  check('capacity clamps above 99', normalizeTableCapacity(500) === 99)
  check('capacity truncates fractions', normalizeTableCapacity(2.9) === 2)
  check('capacity non-number → fallback', normalizeTableCapacity('abc') === 1)
  check('capacity null → fallback', normalizeTableCapacity(null, 3) === 3)
}

// ─── scratch DB ──────────────────────────────────────────────────────────────
const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')
const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-meeting-tables-'))
const scratchPath = join(scratchDir, 'test.db')

const source = createClient({ url: `file:${SOURCE_DB}` })
const ddl = await source.execute(
  `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
   ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid`,
)
source.close?.()
const scratch = createClient({ url: `file:${scratchPath}` })
for (const row of ddl.rows) await scratch.execute(row.sql)

// Seed: two sponsors, three attendees, two time blocks under the engine's
// fallback conference id, and three CONFIRMED meetings (two of them clashing
// at Table 1 in block tb-1 — a cross-sponsor conflict the board must flag).
const NOW = new Date().toISOString()
const T1 = '2026-09-01T18:00:00.000Z'
const T1END = '2026-09-01T18:30:00.000Z'
const T2 = '2026-09-01T19:00:00.000Z'
const T2END = '2026-09-01T19:30:00.000Z'
await scratch.execute('PRAGMA foreign_keys=OFF')
await scratch.execute({
  sql: `INSERT INTO "Sponsor" ("id", "conferenceId", "name", "tier", "createdAt") VALUES
        ('sp-a', 'conf-2025', 'Acme Corp', 'GOLD', ?), ('sp-b', 'conf-2025', 'Blue Ridge', 'SILVER', ?)`,
  args: [NOW, NOW],
})
await scratch.execute({
  sql: `INSERT INTO "User" ("id", "name", "email", "company", "updatedAt") VALUES
        ('u-1', 'Uma One', 'u1@test.com', 'RetailCo', ?),
        ('u-2', 'Vic Two', 'u2@test.com', 'ShopCo', ?),
        ('u-3', 'Wes Three', 'u3@test.com', 'MartCo', ?)`,
  args: [NOW, NOW, NOW],
})
await scratch.execute({
  sql: `INSERT INTO "TimeBlock" ("id", "conferenceId", "startsAt", "endsAt") VALUES
        ('tb-1', 'conf-2025', ?, ?), ('tb-2', 'conf-2025', ?, ?)`,
  args: [T1, T1END, T2, T2END],
})
await scratch.execute({
  sql: `INSERT INTO "SponsorMeeting" ("id", "sponsorId", "userId", "timeBlockId", "location", "status", "createdAt") VALUES
        ('sm-1', 'sp-a', 'u-1', 'tb-1', 'Table 1', 'CONFIRMED', ?),
        ('sm-2', 'sp-b', 'u-2', 'tb-1', 'Table 1', 'CONFIRMED', ?),
        ('sm-3', 'sp-a', 'u-3', 'tb-2', NULL, 'CONFIRMED', ?),
        ('sm-4', 'sp-b', 'u-3', 'tb-1', 'Table 2', 'CANCELLED', ?)`,
  args: [NOW, NOW, NOW, NOW],
})
scratch.close?.()

process.env.DATABASE_URL = `file:${scratchPath}`
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
const { PrismaClient } = req('@prisma/client')
const prisma = new PrismaClient()

// ─── 3. read defaults ────────────────────────────────────────────────────────
console.log('\n[getMeetingTables — defaults]')
{
  const tables = await getMeetingTables(prisma)
  check('empty DB → the constant defaults', JSON.stringify(tables) === JSON.stringify(MEETING_ROOMS), JSON.stringify(tables))
}

// ─── 4. inventory ops ────────────────────────────────────────────────────────
console.log('\n[saveMeetingTables]')
{
  // First write seeds the default rows, then applies the op.
  const afterAdd = await saveMeetingTables(prisma, { op: 'add', name: '  Booth X  ', capacity: 2 })
  check('add appends after the seeded defaults', afterAdd.length === MEETING_ROOMS.length + 1)
  check('added name is trimmed', afterAdd[afterAdd.length - 1].name === 'Booth X')
  check('added capacity persisted', afterAdd[afterAdd.length - 1].capacity === 2)
  check('seeded defaults kept their order', afterAdd[0].name === MEETING_ROOMS[0].name && afterAdd[8].name === MEETING_ROOMS[8].name)

  await expectCode('duplicate add → DUPLICATE_TABLE', () => saveMeetingTables(prisma, { op: 'add', name: 'Table 1' }), 'DUPLICATE_TABLE')
  await expectCode('case-insensitive duplicate → DUPLICATE_TABLE', () => saveMeetingTables(prisma, { op: 'add', name: 'booth x' }), 'DUPLICATE_TABLE')
  await expectCode('blank add → BAD_STATUS', () => saveMeetingTables(prisma, { op: 'add', name: '   ' }), 'BAD_STATUS')
  check('add clamps hostile capacity', (await saveMeetingTables(prisma, { op: 'add', name: 'Overflow', capacity: 500 })).find(t => t.name === 'Overflow')?.capacity === 99)
  await saveMeetingTables(prisma, { op: 'remove', name: 'Overflow' })

  // Capacity-only update.
  const resized = await saveMeetingTables(prisma, { op: 'update', name: 'Booth X', capacity: 3 })
  check('capacity update persists', resized.find(t => t.name === 'Booth X')?.capacity === 3)

  // Rename migrates existing assignments (both sm-1 CONFIRMED and any other status).
  const renamed = await saveMeetingTables(prisma, { op: 'update', name: 'Table 1', newName: 'Booth A' })
  check('rename lands in the inventory', renamed.some(t => t.name === 'Booth A') && !renamed.some(t => t.name === 'Table 1'))
  check('rename keeps the slot position', renamed[0].name === 'Booth A')
  const migrated = await prisma.sponsorMeeting.findMany({ where: { location: 'Booth A' }, select: { id: true } })
  check('rename migrates SponsorMeeting.location', migrated.map(m => m.id).sort().join(',') === 'sm-1,sm-2')
  check('no meeting left on the old label', (await prisma.sponsorMeeting.count({ where: { location: 'Table 1' } })) === 0)

  await expectCode('rename onto an existing name → DUPLICATE_TABLE',
    () => saveMeetingTables(prisma, { op: 'update', name: 'Table 2', newName: 'booth a' }), 'DUPLICATE_TABLE')
  await expectCode('update of unknown table → TABLE_NOT_FOUND',
    () => saveMeetingTables(prisma, { op: 'update', name: 'Nope', capacity: 2 }), 'TABLE_NOT_FOUND')

  // Removal guards.
  await expectCode('remove with confirmed meetings → TABLE_IN_USE',
    () => saveMeetingTables(prisma, { op: 'remove', name: 'Booth A' }), 'TABLE_IN_USE')
  // Table 2 only hosts a CANCELLED meeting — cancelled rows must not block removal.
  const withoutT2 = await saveMeetingTables(prisma, { op: 'remove', name: 'Table 2' })
  check('cancelled meetings do not block removal', !withoutT2.some(t => t.name === 'Table 2'))
  await expectCode('remove unknown table → TABLE_NOT_FOUND', () => saveMeetingTables(prisma, { op: 'remove', name: 'Table 2' }), 'TABLE_NOT_FOUND')
}

// ─── 5. setMeetingTable ──────────────────────────────────────────────────────
console.log('\n[setMeetingTable]')
{
  const updated = await setMeetingTable(prisma, { sponsorMeetingId: 'sm-3', table: 'Booth X' })
  check('assigns a custom table', updated.location === 'Booth X')
  const cleared = await setMeetingTable(prisma, { sponsorMeetingId: 'sm-3', table: null })
  check('clears via table: null', cleared.location === null)

  await expectCode('unknown table → UNKNOWN_ROOM', () => setMeetingTable(prisma, { sponsorMeetingId: 'sm-3', table: 'Table 2' }), 'UNKNOWN_ROOM')
  await expectCode('missing meeting → MEETING_NOT_FOUND', () => setMeetingTable(prisma, { sponsorMeetingId: 'nope', table: null }), 'MEETING_NOT_FOUND')
  await expectCode('cancelled meeting → BAD_STATUS', () => setMeetingTable(prisma, { sponsorMeetingId: 'sm-4', table: null }), 'BAD_STATUS')

  // Global per-block capacity: Booth A (capacity 1) already hosts sm-1 AND
  // sm-2 in tb-1 (the seeded conflict). Move sm-2 off, then verify a third
  // meeting still can't join sm-1 — even though it belongs to another sponsor.
  await setMeetingTable(prisma, { sponsorMeetingId: 'sm-2', table: 'Table 3' })
  await expectCode('full table in the same block → TABLE_TAKEN (cross-sponsor)',
    () => setMeetingTable(prisma, { sponsorMeetingId: 'sm-2', table: 'Booth A' }), 'TABLE_TAKEN')
  // A different block is unaffected.
  const otherBlock = await setMeetingTable(prisma, { sponsorMeetingId: 'sm-3', table: 'Booth A' })
  check('same table in another block is free', otherBlock.location === 'Booth A')
  // Re-assigning a meeting to its own current table is a no-op, not TABLE_TAKEN.
  const idempotent = await setMeetingTable(prisma, { sponsorMeetingId: 'sm-1', table: 'Booth A' })
  check('re-assigning its own table is allowed', idempotent.location === 'Booth A')
}

// ─── 6. getTableBoard ────────────────────────────────────────────────────────
console.log('\n[getTableBoard]')
{
  // State: sm-1 tb-1 Booth A · sm-2 tb-1 Table 3 · sm-3 tb-2 Booth A (sm-4 cancelled).
  const board = await getTableBoard(prisma)
  check('inventory rides along', board.tables.some(t => t.name === 'Booth A') && board.tables.some(t => t.name === 'Booth X'))
  check('assignedCount counts confirmed meetings', board.tables.find(t => t.name === 'Booth A')?.assignedCount === 2)
  check('totals count the three confirmed meetings', board.totals.meetings === 3, JSON.stringify(board.totals))
  check('all assigned, none unassigned', board.totals.assigned === 3 && board.totals.unassigned === 0)
  check('no conflicts in this state', board.totals.conflicts === 0)
  const slots = board.days.flatMap(d => d.slots)
  check('two slots (cancelled meeting excluded)', slots.length === 2 && !slots.flatMap(s => s.meetings).some(m => m.sponsorMeetingId === 'sm-4'))

  // Force the seeded-style conflict again: sm-2 joins Booth A in tb-1.
  await prisma.sponsorMeeting.update({ where: { id: 'sm-2' }, data: { location: 'Booth A' } })
  const conflicted = await getTableBoard(prisma)
  const tb1 = conflicted.days.flatMap(d => d.slots).find(s => s.timeBlockId === 'tb-1')
  check('over-capacity table flagged per slot', tb1?.conflictTables.includes('Booth A'), JSON.stringify(tb1?.conflictTables))
  check('conflict counted in totals', conflicted.totals.conflicts === 1)

  // Unknown label: point sm-2 at a table that is not in the inventory.
  await prisma.sponsorMeeting.update({ where: { id: 'sm-2' }, data: { location: 'Ghost Table' } })
  const ghost = await getTableBoard(prisma)
  const ghostRow = ghost.days.flatMap(d => d.slots).flatMap(s => s.meetings).find(m => m.sponsorMeetingId === 'sm-2')
  check('unknown label carries tableKnown: false', ghostRow?.tableKnown === false)
  check('unknown label counted in totals', ghost.totals.unknownTable === 1 && ghost.totals.assigned === 2)
}

// ─── 7. autoAssignTables ─────────────────────────────────────────────────────
console.log('\n[autoAssignTables]')
{
  // State: sm-1 tb-1 Booth A · sm-2 tb-1 Ghost Table (unknown) · sm-3 tb-2 Booth A.
  const r1 = await autoAssignTables(prisma)
  check('reassigns the unknown-label meeting', r1.assigned === 1 && r1.unplaced === 0, JSON.stringify(r1))
  // Deterministic: Booth A (first in the inventory) is full with sm-1, so the
  // next free table in inventory order is Table 3 (Table 2 was removed above).
  const sm2 = await prisma.sponsorMeeting.findUnique({ where: { id: 'sm-2' }, select: { location: true } })
  check('unknown-label meeting lands on the first free table', sm2?.location === 'Table 3', `got ${sm2?.location}`)

  const r2 = await autoAssignTables(prisma)
  check('second run is a no-op', r2.assigned === 0 && r2.unplaced === 0, JSON.stringify(r2))

  // Conflicts stay put without the flag, move with it.
  await prisma.sponsorMeeting.update({ where: { id: 'sm-2' }, data: { location: 'Booth A' } })
  const keep = await autoAssignTables(prisma)
  check('conflict untouched without includeConflicts', keep.assigned === 0, JSON.stringify(keep))
  const fix = await autoAssignTables(prisma, { includeConflicts: true })
  check('conflict moved with includeConflicts', fix.assigned === 1, JSON.stringify(fix))
  check('board is conflict-free after the fix', (await getTableBoard(prisma)).totals.conflicts === 0)

  // Unplaced: shrink the inventory to one capacity-1 table hosting sm-1, so
  // sm-2 in the same block has nowhere to go. (Remove requires empty tables —
  // park both meetings on Booth A first, then delete the rest via raw SQL to
  // keep the engine's remove guards out of this scenario.)
  await prisma.$executeRawUnsafe(`DELETE FROM "MeetingTableSetting" WHERE "name" != 'Booth A'`)
  await prisma.sponsorMeeting.update({ where: { id: 'sm-2' }, data: { location: null } })
  const cramped = await autoAssignTables(prisma)
  check('meeting with no free table counts as unplaced', cramped.assigned === 0 && cramped.unplaced === 1, JSON.stringify(cramped))
  check('unplaced meeting stays unassigned', (await prisma.sponsorMeeting.findUnique({ where: { id: 'sm-2' }, select: { location: true } }))?.location === null)
}

// ─── 8. engine integration ───────────────────────────────────────────────────
console.log('\n[engine integration]')
{
  // Inventory is now the single 'Booth A' — every rooms payload must follow it.
  const matrix = await getSponsorScheduleMatrix(prisma, 'sp-a')
  check('matrix rooms reflect the custom inventory',
    matrix.rooms.length === 1 && matrix.rooms[0].name === 'Booth A', JSON.stringify(matrix.rooms))

  const avail = await getMeetingRescheduleAvailability(prisma, 'sm-1')
  const roomNames = new Set(avail.days.flatMap(d => d.slots).flatMap(s => s.rooms).map(r => r.name))
  check('availability rooms reflect the custom inventory', roomNames.size === 1 && roomNames.has('Booth A'), [...roomNames].join(','))

  // rescheduleMeeting accepts the custom table and rejects a removed one.
  // (Same-block reschedule — sp-a already holds tb-2 via sm-3, so moving
  // there would trip the exclusive-slot guard, which is not under test here.)
  const moved = await rescheduleMeeting(prisma, { sponsorMeetingId: 'sm-1', timeBlockId: 'tb-1', room: 'Booth A' })
  check('rescheduleMeeting accepts a custom table', moved.location === 'Booth A' && moved.timeBlockId === 'tb-1')
  await expectCode('rescheduleMeeting rejects a removed table',
    () => rescheduleMeeting(prisma, { sponsorMeetingId: 'sm-1', timeBlockId: 'tb-1', room: 'Table 5' }), 'UNKNOWN_ROOM')
}

await prisma.$disconnect()

console.log(failures === 0 ? '\n✓ all meeting-tables logic/persistence checks passed' : `\n✗ ${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
