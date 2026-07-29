#!/usr/bin/env node
// Logic + persistence test for the admin meeting-requirements feature
// (packages/db/src/meeting-engine.ts — Meeting requirement settings section).
// No server needed — exercises the pure helpers and the DB layer against a
// scratch SQLite database whose DDL is cloned from the real dev DB, so schema
// drift is impossible. The MeetingRequirementSetting table itself is created
// defensively at runtime by the module under test (mirrors the production
// Turso path).
//
// Covers:
//   1. '@conference/db' re-exports './meeting-engine' (index.ts static check).
//   2. normalizeRequiredCount clamps arbitrary input to an int in [0, 99].
//   3. requiredMeetingsForSponsor — override wins, default otherwise.
//   4. Persistence: defaults before any write; partial saves touch only their
//      slice; upsert; override cleared via required: null; values clamped on
//      write; hostile stored JSON ignored (fail-open to defaults).
//   5. Engine integration: getCompanyDirectory carries requiredMeetings and a
//      fill rate with the per-company denominator (0 ⇒ fully met), and
//      getSponsorScheduleMatrix carries requiredMeetings +
//      requiredMeetingsPerPerson.
//
//   node scripts/test-meeting-requirements.mjs
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

const mod = await import(join(ROOT, 'packages/db/src/meeting-engine.ts'))
const {
  DEFAULT_MEETING_REQUIREMENTS,
  normalizeRequiredCount,
  requiredMeetingsForSponsor,
  getMeetingRequirementSettings,
  saveMeetingRequirementSettings,
  getCompanyDirectory,
  getSponsorScheduleMatrix,
  FILL_TARGET,
  REQUIRED_MEETINGS_PER_PERSON,
} = mod

// ─── 1. re-export ─────────────────────────────────────────────────────────────
console.log('[@conference/db re-export]')
{
  const indexSrc = readFileSync(join(ROOT, 'packages/db/src/index.ts'), 'utf8')
  check("index.ts re-exports './meeting-engine'", /export\s+\*\s+from\s+['"]\.\/meeting-engine['"]/.test(indexSrc))
  check('defaults mirror the legacy constants',
    DEFAULT_MEETING_REQUIREMENTS.attendeeRequired === REQUIRED_MEETINGS_PER_PERSON &&
    DEFAULT_MEETING_REQUIREMENTS.sponsorDefaultRequired === FILL_TARGET)
}

// ─── 2. normalizeRequiredCount ────────────────────────────────────────────────
console.log('\n[normalizeRequiredCount]')
{
  check('passes a plain int through', normalizeRequiredCount(7, 5) === 7)
  check('zero is a valid value', normalizeRequiredCount(0, 5) === 0)
  check('clamps above 99', normalizeRequiredCount(250, 5) === 99)
  check('clamps below 0', normalizeRequiredCount(-5, 5) === 0)
  check('truncates fractions to an int', Number.isInteger(normalizeRequiredCount(3.7, 5)))
  check('non-number → fallback', normalizeRequiredCount('abc', 5) === 5)
  check('null → fallback', normalizeRequiredCount(null, 5) === 5)
  check('undefined → fallback', normalizeRequiredCount(undefined, 5) === 5)
  check('NaN → fallback', normalizeRequiredCount(NaN, 5) === 5)
}

// ─── 3. requiredMeetingsForSponsor ────────────────────────────────────────────
console.log('\n[requiredMeetingsForSponsor]')
{
  const s = { attendeeRequired: 5, sponsorDefaultRequired: 12, sponsorOverrides: { 'sp-a': 3 } }
  check('override wins', requiredMeetingsForSponsor(s, 'sp-a') === 3)
  check('default otherwise', requiredMeetingsForSponsor(s, 'sp-b') === 12)
}

// ─── 4. persistence (scratch DB) ──────────────────────────────────────────────
console.log('\n[persistence]')

const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')
const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-meeting-req-'))
const scratchPath = join(scratchDir, 'test.db')

const source = createClient({ url: `file:${SOURCE_DB}` })
const ddl = await source.execute(
  `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
   ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid`,
)
source.close?.()
const scratch = createClient({ url: `file:${scratchPath}` })
for (const row of ddl.rows) await scratch.execute(row.sql)

// Seed two sponsor companies under the engine's fallback conference id, one of
// them with two confirmed meetings. Raw inserts with FK enforcement off for
// this seeding connection — the dangling conference/user/timeBlock ids are
// never joined by the paths under test.
const NOW = new Date().toISOString()
await scratch.execute('PRAGMA foreign_keys=OFF')
await scratch.execute({
  sql: `INSERT INTO "Sponsor" ("id", "conferenceId", "name", "tier", "createdAt") VALUES
        ('sp-a', 'conf-2025', 'Acme Corp', 'GOLD', ?), ('sp-b', 'conf-2025', 'Blue Ridge', 'SILVER', ?)`,
  args: [NOW, NOW],
})
await scratch.execute({
  sql: `INSERT INTO "SponsorMeeting" ("id", "sponsorId", "userId", "timeBlockId", "status", "createdAt") VALUES
        ('sm-1', 'sp-a', 'u-x', 'tb-x', 'CONFIRMED', ?), ('sm-2', 'sp-a', 'u-y', 'tb-y', 'CONFIRMED', ?)`,
  args: [NOW, NOW],
})
scratch.close?.()

process.env.DATABASE_URL = `file:${scratchPath}`
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
const { PrismaClient } = req('@prisma/client')
const prisma = new PrismaClient()

{
  // Defaults before any write (table auto-created by the ensure helper).
  const empty = await getMeetingRequirementSettings(prisma)
  check('empty DB → defaults',
    empty.attendeeRequired === 5 && empty.sponsorDefaultRequired === 10 && Object.keys(empty.sponsorOverrides).length === 0,
    JSON.stringify(empty))

  // Partial save touches only its slice.
  await saveMeetingRequirementSettings(prisma, { attendeeRequired: 7 })
  const s1 = await getMeetingRequirementSettings(prisma)
  check('attendeeRequired persisted', s1.attendeeRequired === 7)
  check('sponsor default untouched by partial save', s1.sponsorDefaultRequired === 10)

  await saveMeetingRequirementSettings(prisma, {
    sponsorDefaultRequired: 12,
    sponsorOverrides: [{ sponsorId: 'sp-a', required: 3 }],
  })
  const s2 = await getMeetingRequirementSettings(prisma)
  check('sponsor default persisted', s2.sponsorDefaultRequired === 12)
  check('override persisted', s2.sponsorOverrides['sp-a'] === 3)
  check('attendee value untouched', s2.attendeeRequired === 7)

  // Upsert (ON CONFLICT) updates in place.
  await saveMeetingRequirementSettings(prisma, { sponsorOverrides: [{ sponsorId: 'sp-a', required: 4 }] })
  check('override upserted to 4', (await getMeetingRequirementSettings(prisma)).sponsorOverrides['sp-a'] === 4)

  // Clearing an override deletes the row.
  await saveMeetingRequirementSettings(prisma, { sponsorOverrides: [{ sponsorId: 'sp-a', required: null }] })
  const s3 = await getMeetingRequirementSettings(prisma)
  check('override cleared via required: null', !('sp-a' in s3.sponsorOverrides), JSON.stringify(s3.sponsorOverrides))

  // Values are clamped on write.
  await saveMeetingRequirementSettings(prisma, { attendeeRequired: 250, sponsorDefaultRequired: -5 })
  const s4 = await getMeetingRequirementSettings(prisma)
  check('attendee clamped to 99 on write', s4.attendeeRequired === 99)
  check('sponsor default clamped to 0 on write', s4.sponsorDefaultRequired === 0)

  // Entries without a sponsorId are skipped, not thrown.
  await saveMeetingRequirementSettings(prisma, { sponsorOverrides: [{ sponsorId: '', required: 9 }] })
  check('empty sponsorId override skipped', !('' in (await getMeetingRequirementSettings(prisma)).sponsorOverrides))

  // Hostile stored JSON is ignored rather than breaking the read.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "MeetingRequirementSetting" ("scope", "subjectId", "settings", "updatedAt")
     VALUES ('ATTENDEE_GLOBAL', '', '{not json', ?)
     ON CONFLICT("scope", "subjectId") DO UPDATE SET "settings" = excluded."settings"`,
    NOW,
  )
  const hostile = await getMeetingRequirementSettings(prisma)
  check('bad stored JSON falls back to default', hostile.attendeeRequired === DEFAULT_MEETING_REQUIREMENTS.attendeeRequired,
    `got ${hostile.attendeeRequired}`)
}

// ─── 5. engine integration ────────────────────────────────────────────────────
console.log('\n[engine integration]')
{
  // Known state: attendee 7, default 12, sp-a overridden to 4 (2 confirmed).
  await saveMeetingRequirementSettings(prisma, {
    attendeeRequired: 7,
    sponsorDefaultRequired: 12,
    sponsorOverrides: [{ sponsorId: 'sp-a', required: 4 }],
  })

  const dir = await getCompanyDirectory(prisma)
  const a = dir.find(r => r.id === 'sp-a')
  const b = dir.find(r => r.id === 'sp-b')
  check('directory returns both seeded sponsors', !!a && !!b)
  check('overridden company carries its own requiredMeetings', a?.requiredMeetings === 4, `got ${a?.requiredMeetings}`)
  check('non-overridden company carries the default', b?.requiredMeetings === 12, `got ${b?.requiredMeetings}`)
  check('fill rate uses the per-company denominator (2/4)', a?.fillRate === 0.5, `got ${a?.fillRate}`)
  check('zero-confirmed company has zero fill', b?.fillRate === 0, `got ${b?.fillRate}`)

  // required = 0 means "no requirement" → meter reads fully met, no divide-by-zero.
  await saveMeetingRequirementSettings(prisma, { sponsorOverrides: [{ sponsorId: 'sp-a', required: 0 }] })
  const dir0 = await getCompanyDirectory(prisma)
  check('required 0 → fillRate 1 (no divide-by-zero)', dir0.find(r => r.id === 'sp-a')?.fillRate === 1)
  await saveMeetingRequirementSettings(prisma, { sponsorOverrides: [{ sponsorId: 'sp-a', required: 4 }] })

  const matrix = await getSponsorScheduleMatrix(prisma, 'sp-a')
  check('matrix carries the company requiredMeetings', matrix.requiredMeetings === 4, `got ${matrix.requiredMeetings}`)
  check('matrix carries requiredMeetingsPerPerson', matrix.requiredMeetingsPerPerson === 7, `got ${matrix.requiredMeetingsPerPerson}`)
}

await prisma.$disconnect()

console.log(failures === 0 ? '\n✓ all meeting-requirements logic/persistence checks passed' : `\n✗ ${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
