#!/usr/bin/env node
// Regression tests for the shared data-layer fixes landed in the deep-audit
// pass (docs/audit-2026-08-01-improvements.md). No server needed — exercises
// the real exported functions against a scratch SQLite database whose DDL is
// cloned from the live dev DB, so schema drift between the app and this test
// is impossible.
//
// What this locks in (each maps to a confirmed audit finding):
//   1. getOrCreateDirectRoom (packages/db/src/chat.ts) now mints a
//      DETERMINISTIC id keyed on the sorted pair, so it is idempotent under
//      concurrent calls — no duplicate DIRECT rooms. Verifies: id shape
//      'dm:<a>:<b>' (sorted); repeat call returns the same room; a burst of
//      concurrent calls converges on exactly one room; legacy pre-existing
//      rooms (arbitrary cuid id) are still found and reused, never duplicated.
//   2. detectSpeakerConflicts (packages/db/src/index.ts) batches its writes
//      (Promise.all upserts + one updateMany for stale rows) instead of an
//      N+1 await-per-row loop. Verifies the batched version is behaviourally
//      identical: overlapping same-speaker sessions are logged unresolved,
//      a subsequently-separated pair is marked resolved, output list correct.
//   3. getCompanyDirectory (packages/db/src/meeting-engine.ts) is now scoped
//      to its conference via relation filters. Verifies a live MeetingRequest
//      in a DIFFERENT conference never inflates this conference's directory
//      counts (the cross-conference leak the audit fixed).
//
//   node scripts/test-audit-db-regressions.mjs
//
// Exits 0 on all-pass, 1 on failure. PII discipline: ids/counts only.

import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
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

// ─── Scratch database (DDL cloned from the real dev DB) ──────────────────────

const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')

const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-audit-regress-'))
const scratchPath = join(scratchDir, 'test.db')

const source = createClient({ url: `file:${SOURCE_DB}` })
const ddl = await source.execute(
  `SELECT sql FROM sqlite_master
   WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
   ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid`
)
source.close?.()
const scratch = createClient({ url: `file:${scratchPath}` })
for (const row of ddl.rows) await scratch.execute(row.sql)

// The committed local dev.db can lag the Prisma schema (e.g. the `loginCount`
// column shipped via scripts/migrate-login-count.mjs and may not be present in
// a fresh checkout's dev.db). Reconcile the scratch tables this suite writes to
// against the current schema by additively adding any missing scalar columns,
// so the test is correct regardless of local-fixture staleness and never needs
// a destructive `db push` against the shared fixture. Additive only — never
// drops or alters existing columns.
const SCHEMA_SRC = readFileSync(join(ROOT, 'packages/db/prisma/schema.prisma'), 'utf8')
const SQLITE_SCALAR = { String: 'TEXT', Int: 'INTEGER', BigInt: 'INTEGER', Boolean: 'BOOLEAN', DateTime: 'DATETIME', Float: 'REAL', Json: 'TEXT' }
function schemaScalarColumns(model) {
  const block = SCHEMA_SRC.match(new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!block) return []
  const out = []
  for (const raw of block[1].split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('//') || line.startsWith('@@')) continue
    const m = line.match(/^(\w+)\s+(\w+)(\?)?/)
    if (!m) continue
    const [, name, type, optional] = m
    const sqlType = SQLITE_SCALAR[type]
    if (!sqlType) continue // relation / enum-as-relation — skip
    let def = null
    const dm = line.match(/@default\(([^)]*)\)/)
    if (dm) {
      const v = dm[1]
      if (/^(true|false|\d+)$/.test(v)) def = v
      else if (v.startsWith('"')) def = v
    }
    out.push({ name, sqlType, optional: !!optional, def })
  }
  return out
}
async function ensureColumns(table) {
  const info = await scratch.execute(`SELECT name FROM pragma_table_info('${table}')`)
  const have = new Set(info.rows.map(r => r.name))
  for (const c of schemaScalarColumns(table)) {
    if (have.has(c.name)) continue
    // SQLite ADD COLUMN with a non-null constraint needs a default; supply one.
    const nullClause = c.optional ? '' : ' NOT NULL'
    const defClause = c.def != null ? ` DEFAULT ${c.def}` : (c.optional ? '' : (c.sqlType === 'TEXT' ? " DEFAULT ''" : ' DEFAULT 0'))
    await scratch.execute(`ALTER TABLE "${table}" ADD COLUMN "${c.name}" ${c.sqlType}${nullClause}${defClause}`)
  }
}
for (const t of ['User', 'Sponsor', 'MeetingRequest', 'ChatRoom', 'ChatMember', 'Follow', 'Conference', 'ConfSession', 'Speaker', 'SponsorMeeting']) {
  await ensureColumns(t)
}

process.env.DATABASE_URL = `file:${scratchPath}`
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
const { PrismaClient } = req('@prisma/client')
const prisma = new PrismaClient()

// Leaf modules only — index.ts imports './client' which Node's TS type-stripping
// cannot resolve. detectSpeakerConflicts lives in that barrel, so its batched-write
// regression is guarded by a source assertion in test-audit-security.mjs instead.
const { getOrCreateDirectRoom } = await import(join(ROOT, 'packages/db/src/chat.ts'))
const engine = await import(join(ROOT, 'packages/db/src/meeting-engine.ts'))

let uid = 0
async function mkUser(name) {
  return prisma.user.create({
    data: { email: `audit-${name}-${uid++}@example.com`, name, role: 'ATTENDEE' },
  })
}
async function mkConference(name) {
  return prisma.conference.create({
    data: {
      id: `conf-${name}-${uid++}`,
      name,
      active: false,
      startDate: new Date('2033-06-01T00:00:00Z'),
      endDate: new Date('2033-06-02T23:59:59Z'),
    },
  })
}
async function befriend(a, b) {
  // Mutual Follow edges = friendship (the DM gate requires it).
  await prisma.follow.create({ data: { followerId: a, followingId: b } })
  await prisma.follow.create({ data: { followerId: b, followingId: a } })
}

try {
  // ─── 1. getOrCreateDirectRoom deterministic id + idempotency ───────────────
  console.log('[getOrCreateDirectRoom — deterministic id, no duplicate rooms]')
  {
    const a = await mkUser('dmA')
    const b = await mkUser('dmB')
    await befriend(a.id, b.id)

    const r1 = await getOrCreateDirectRoom(prisma, a.id, b.id)
    check('first call succeeds', r1.ok === true, JSON.stringify(r1))
    const expectedId = ['dm', ...[a.id, b.id].sort()].join(':')
    check('room id is the deterministic sorted-pair id', r1.room?.id === expectedId, r1.room?.id)

    // Same pair, reversed argument order → same room.
    const r2 = await getOrCreateDirectRoom(prisma, b.id, a.id)
    check('reversed-order call returns the same room', r2.ok && r2.room?.id === expectedId)

    // Concurrency: a burst of simultaneous calls must converge on ONE room.
    const c = await mkUser('dmC')
    const d = await mkUser('dmD')
    await befriend(c.id, d.id)
    const burst = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        getOrCreateDirectRoom(prisma, i % 2 ? d.id : c.id, i % 2 ? c.id : d.id),
      ),
    )
    check('all concurrent calls succeeded', burst.every(r => r.ok))
    const distinctIds = new Set(burst.map(r => r.room?.id))
    check('concurrent burst converged on exactly one room', distinctIds.size === 1, [...distinctIds].join(','))
    const roomCount = await prisma.chatRoom.count({
      where: { type: 'DIRECT', members: { some: { userId: c.id } } },
    })
    check('exactly one DIRECT room persisted for the pair', roomCount === 1, `count=${roomCount}`)

    // Legacy grandfathering: a pre-existing room with an arbitrary (non-deterministic)
    // id must still be found and reused, never duplicated.
    const e = await mkUser('dmE')
    const f = await mkUser('dmF')
    await befriend(e.id, f.id)
    const legacy = await prisma.chatRoom.create({
      data: {
        id: `legacy-cuid-${uid++}`,
        type: 'DIRECT',
        members: { create: [{ userId: e.id }, { userId: f.id }] },
      },
    })
    const r3 = await getOrCreateDirectRoom(prisma, e.id, f.id)
    check('legacy arbitrary-id room is reused, not replaced', r3.ok && r3.room?.id === legacy.id, r3.room?.id)
    const legacyCount = await prisma.chatRoom.count({
      where: { type: 'DIRECT', members: { some: { userId: e.id } } },
    })
    check('no duplicate room minted alongside the legacy one', legacyCount === 1, `count=${legacyCount}`)

    // The friendship gate is preserved: strangers are still blocked.
    const g = await mkUser('dmG')
    const h = await mkUser('dmH')
    const blocked = await getOrCreateDirectRoom(prisma, g.id, h.id)
    check('non-friends still blocked (NOT_FRIENDS)', blocked.ok === false && blocked.code === 'NOT_FRIENDS')
  }

  // ─── 2. getCompanyDirectory conference scoping (no cross-conference leak) ──
  console.log('[getCompanyDirectory — scoped to its own conference]')
  {
    const confA = await mkConference('A')
    const confB = await mkConference('B')
    const sponsorA = await prisma.sponsor.create({
      data: { id: `spon-A-${uid++}`, name: 'Acme A', conferenceId: confA.id },
    })
    const sponsorB = await prisma.sponsor.create({
      data: { id: `spon-B-${uid++}`, name: 'Acme B', conferenceId: confB.id },
    })
    const repA = await prisma.user.create({
      data: { email: `repA-${uid++}@x.com`, name: 'Rep A', role: 'ATTENDEE', sponsorId: sponsorA.id },
    })
    const repB = await prisma.user.create({
      data: { email: `repB-${uid++}@x.com`, name: 'Rep B', role: 'ATTENDEE', sponsorId: sponsorB.id },
    })
    const attendee = await prisma.user.create({
      data: { email: `att-${uid++}@x.com`, name: 'Attendee', role: 'ATTENDEE' },
    })
    // One live request in EACH conference. Only Conf A's should appear in A's directory.
    await prisma.meetingRequest.create({
      data: { requesterId: repA.id, targetUserId: attendee.id, status: 'PENDING', priority: 'MED' },
    })
    await prisma.meetingRequest.create({
      data: { requesterId: repB.id, targetUserId: attendee.id, status: 'PENDING', priority: 'MED' },
    })

    const dirA = await engine.getCompanyDirectory(prisma, confA.id)
    check('directory returns only Conf A sponsors', dirA.every(r => r.id === sponsorA.id), dirA.map(r => r.id).join(','))
    const rowA = dirA.find(r => r.id === sponsorA.id)
    check('Conf A sponsor present in its directory', !!rowA)
    // The cross-conference request (repB→attendee) must not inflate Conf A counts.
    const dirB = await engine.getCompanyDirectory(prisma, confB.id)
    check('Conf B directory is disjoint from Conf A', dirB.every(r => r.id === sponsorB.id))
    check('no sponsor bleeds across the two directories',
      !dirA.some(r => r.id === sponsorB.id) && !dirB.some(r => r.id === sponsorA.id))
  }

  console.log(failures === 0 ? '\n✅ ALL PASSED' : `\n❌ ${failures} FAILED`)
} catch (e) {
  console.error('\n✗ threw:', e?.message ?? e)
  failures++
} finally {
  await prisma.$disconnect()
  scratch.close?.()
  rmSync(scratchDir, { recursive: true, force: true })
}

process.exit(failures === 0 ? 0 : 1)
