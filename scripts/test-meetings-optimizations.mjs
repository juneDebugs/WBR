#!/usr/bin/env node
// Regression test for the Meetings-section performance optimizations
// (packages/db/src/meeting-engine.ts). Locks the behaviour of two engine-level
// changes so a future refactor can't silently break correctness while chasing
// speed:
//
//   M1 — getSponsorScheduleMatrix folded its standalone `sponsor.findUnique`
//        into the seven-query Promise.all (one fewer serial Turso round-trip).
//        The `if (!sponsor) throw REQUEST_NOT_FOUND` guard moved *after* the
//        batch, so this asserts the guard still fires and the happy path is
//        unchanged (sponsor identity + confirmedCount).
//
//   L1 — getMeetingsLog now scopes request messages to the conference's
//        sponsors in SQL (`targetSponsorId in ids` OR `requester.sponsorId in
//        ids`) instead of fetching every request in the DB and filtering in JS.
//        This asserts the two OR branches both surface a message, and — the
//        edge the SQL predicate introduces — that a conference with ZERO
//        sponsors yields an empty `{ in: [] }` predicate that neither throws
//        nor leaks foreign request messages.
//
// Runs the real engine functions against the live DB (Turso when creds are in
// apps/*/.env.local, else local dev.db). Every call passes conferenceId
// explicitly, so the real active conference is never touched. All fixture rows
// are prefixed 'mopt-test-' and swept in finally.
//
//   node scripts/test-meetings-optimizations.mjs
//
// PII discipline: prints ids/counts only.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
async function expectThrow(name, code, fn) {
  try { await fn(); failures++; console.error(`  ✗ ${name} — expected ${code}, but it resolved`) }
  catch (e) {
    if (e?.code === code) console.log(`  ✓ ${name} (threw ${code})`)
    else { failures++; console.error(`  ✗ ${name} — expected ${code}, got ${e?.code ?? e?.message}`) }
  }
}

function readEnvLocal(app) {
  const env = {}
  try {
    for (const line of readFileSync(join(ROOT, 'apps', app, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}

function makePrisma() {
  const env = { ...readEnvLocal('web'), ...readEnvLocal('meetings') }
  const { PrismaClient } = require('@prisma/client')
  const url = process.env.TURSO_DATABASE_URL ?? env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? env.TURSO_AUTH_TOKEN
  if (url && token && url.startsWith('libsql://')) {
    const { PrismaLibSQL } = require('@prisma/adapter-libsql')
    const { createClient } = require('@libsql/client')
    console.log('→ DB: Turso')
    return new PrismaClient({ adapter: new PrismaLibSQL(createClient({ url, authToken: token })) })
  }
  console.log('→ DB: local dev.db')
  process.env.DATABASE_URL = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
  return new PrismaClient()
}

const E = await import(pathToFileURL(join(ROOT, 'packages/db/src/meeting-engine.ts')).href)
const prisma = makePrisma()

const PREFIX = 'mopt-test-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`

async function cleanup() {
  await prisma.sponsorMeeting.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.meetingRequest.deleteMany({ where: { requesterId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.timeBlock.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.sponsor.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.conference.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
}

async function main() {
  console.log('\nFixtures — isolated inactive conferences')
  // confA: has a sponsor + a confirmed sponsor meeting + request messages.
  const confA = await prisma.conference.create({ data: {
    id: fid('conf-a'), name: 'MOpt Conf A', active: false,
    startDate: new Date('2032-04-01T00:00:00Z'), endDate: new Date('2032-04-02T23:59:59Z'),
  } })
  // confB: a second conference whose sponsor is the target of a foreign message.
  const confB = await prisma.conference.create({ data: {
    id: fid('conf-b'), name: 'MOpt Conf B', active: false,
    startDate: new Date('2032-05-01T00:00:00Z'), endDate: new Date('2032-05-02T23:59:59Z'),
  } })
  // confEmpty: a conference with NO sponsors at all → the `{ in: [] }` edge.
  const confEmpty = await prisma.conference.create({ data: {
    id: fid('conf-empty'), name: 'MOpt Conf Empty', active: false,
    startDate: new Date('2032-06-01T00:00:00Z'), endDate: new Date('2032-06-02T23:59:59Z'),
  } })

  const sponsorA = await prisma.sponsor.create({ data: {
    id: fid('sponsor-a'), conferenceId: confA.id, name: 'MOpt Acme', tier: 'GOLD',
  } })
  const sponsorB = await prisma.sponsor.create({ data: {
    id: fid('sponsor-b'), conferenceId: confB.id, name: 'MOpt Beta', tier: 'SILVER',
  } })

  // rep — a user belonging to sponsorA (drives the `requester.sponsorId` OR branch).
  const rep = await prisma.user.create({ data: {
    id: fid('rep'), email: `${PREFIX}rep-${stamp}@example.com`, name: 'MOpt Rep', role: 'SPONSOR', sponsorId: sponsorA.id,
  } })
  const buyer = await prisma.user.create({ data: {
    id: fid('buyer'), email: `${PREFIX}buyer-${stamp}@example.com`, name: 'MOpt Buyer', role: 'ATTENDEE',
  } })

  const tb1 = await prisma.timeBlock.create({ data: {
    id: fid('tb-1'), conferenceId: confA.id,
    startsAt: new Date('2032-04-01T18:00:00Z'), endsAt: new Date('2032-04-01T18:30:00Z'),
  } })

  // A confirmed sponsor meeting for sponsorA in confA (feeds confirmedCount + grid).
  await prisma.sponsorMeeting.create({ data: {
    id: fid('sm-1'), sponsorId: sponsorA.id, userId: buyer.id, timeBlockId: tb1.id,
    status: 'CONFIRMED', location: 'Table 3',
    createdAt: new Date('2032-04-01T17:00:00Z'),
  } })

  // Message 1: attendee → sponsorA (in-conference, targetSponsorId branch).
  await prisma.meetingRequest.create({ data: {
    id: fid('req-target'), requesterId: buyer.id, targetSponsorId: sponsorA.id,
    status: 'PENDING', priority: 'MED', message: 'Interested in your platform.',
    createdAt: new Date('2032-04-01T15:00:00Z'),
  } })
  // Message 2: sponsorA rep → attendee (in-conference via requester.sponsorId branch;
  // NO targetSponsorId, so only the second OR branch can scope it in).
  await prisma.meetingRequest.create({ data: {
    id: fid('req-requester'), requesterId: rep.id, targetUserId: buyer.id,
    status: 'PENDING', priority: 'MED', message: 'Would love 15 minutes at the booth.',
    createdAt: new Date('2032-04-01T15:01:00Z'),
  } })
  // Message 3: attendee → sponsorB (foreign conference — must NOT surface in confA).
  await prisma.meetingRequest.create({ data: {
    id: fid('req-foreign'), requesterId: buyer.id, targetSponsorId: sponsorB.id,
    status: 'PENDING', priority: 'MED', message: 'Foreign-conference message.',
    createdAt: new Date('2032-04-01T15:02:00Z'),
  } })

  console.log('  created 3 conferences, 2 sponsors, 2 users, 1 block, 1 sponsor meeting, 3 requests')

  // ── M1: getSponsorScheduleMatrix — refactored Promise.all + moved guard ──
  console.log('\nM1 — getSponsorScheduleMatrix (matrix Promise.all refactor)')
  const matrix = await E.getSponsorScheduleMatrix(prisma, sponsorA.id, confA.id)
  check('returns the requested sponsor identity', matrix.sponsor.id === sponsorA.id && matrix.sponsor.name === 'MOpt Acme', JSON.stringify(matrix.sponsor))
  check('sponsor tier carried through', matrix.sponsor.tier === 'GOLD', matrix.sponsor.tier)
  check('confirmedCount reflects the one confirmed meeting', matrix.confirmedCount === 1, `got ${matrix.confirmedCount}`)
  check('days grid is present', Array.isArray(matrix.days) && matrix.days.length >= 1, `days=${matrix.days?.length}`)
  const scheduledInGrid = matrix.days.some(d => d.slots?.some(s => (s.meetings ?? []).some(m => m.name === 'MOpt Buyer')))
  check('confirmed meeting appears in the grid', scheduledInGrid)
  await expectThrow('unknown sponsorId → REQUEST_NOT_FOUND (guard preserved past the batch)', 'REQUEST_NOT_FOUND',
    () => E.getSponsorScheduleMatrix(prisma, `${PREFIX}nope-${stamp}`, confA.id))

  // ── L1: getMeetingsLog — SQL conference scoping of request messages ──
  console.log('\nL1 — getMeetingsLog (request-message conference scoping)')
  const logA = await E.getMeetingsLog(prisma, confA.id)
  const idsA = new Set(logA.entries.map(e => e.id))
  check('targetSponsor branch: attendee→sponsorA message surfaces', idsA.has(`REQUEST_MESSAGE:${fid('req-target')}`))
  check('requester.sponsor branch: rep→attendee message surfaces', idsA.has(`REQUEST_MESSAGE:${fid('req-requester')}`))
  check('foreign-conference message is scoped out', !idsA.has(`REQUEST_MESSAGE:${fid('req-foreign')}`))
  check('confA request-message count = 2', logA.counts.REQUEST_MESSAGE === 2, `got ${logA.counts.REQUEST_MESSAGE}`)

  console.log('\nL1 — empty-sponsor conference (the `{ in: [] }` predicate edge)')
  let emptyLog
  let threw = false
  try { emptyLog = await E.getMeetingsLog(prisma, confEmpty.id) } catch { threw = true }
  check('getMeetingsLog on a sponsor-less conference does not throw', !threw)
  check('no request messages leak into the empty conference', (emptyLog?.counts.REQUEST_MESSAGE ?? -1) === 0, `got ${emptyLog?.counts.REQUEST_MESSAGE}`)
  check('empty conference log is entirely empty', (emptyLog?.counts.all ?? -1) === 0, `got ${emptyLog?.counts.all}`)

  console.log(failures === 0 ? '\n✅ ALL PASSED' : `\n❌ ${failures} FAILED`)
}

try {
  await cleanup()
  await main()
} catch (err) {
  console.error('\n💥 Unexpected error:', err)
  failures++
} finally {
  await cleanup()
  await prisma.$disconnect()
}
process.exit(failures === 0 ? 0 : 1)
