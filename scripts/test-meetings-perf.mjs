#!/usr/bin/env node
// Correctness tests for the Meetings-section performance optimizations
// (packages/db/src/meeting-engine.ts):
//
//   1. resolveConferenceId in-process cache + invalidateActiveConferenceCache()
//   2. syncAutoMatchesOnRead() read-path throttle (self-heal sweep runs at most
//      once per SWEEP_THROTTLE_MS per conference; portal writes stay unthrottled
//      via the plain syncAutoMatches())
//   3. getAutoMatchBoard(prisma, confId, precomputed) returns a board IDENTICAL
//      to the recompute-from-scratch path — the Auto route reuses the sweep's
//      matches only when the sweep scheduled nothing, so the two must agree.
//
// Runs the real engine functions against the live DB (Turso when creds are in
// apps/*/.env.local, else local dev.db). Builds a fully throwaway INACTIVE
// fixture conference (ids prefixed 'perf-test-') and passes conferenceId
// explicitly to every scheduling/board call, so the real active conference is
// never mutated. Deletes every fixture row in finally.
//
//   node scripts/test-meetings-perf.mjs
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

const PREFIX = 'perf-test-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`
const key = (sponsorId, userId) => `${sponsorId}::${userId}`

async function cleanup() {
  await prisma.autoMatchEvent.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.meetingRequest.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.sponsorMeeting.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.conference.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
}

// Board equality that ignores the GLOBAL, time-ordered event log (which the two
// board computations share) and compares only the derived match/half/totals
// state — exactly the payload the precomputed-reuse path must preserve.
function boardShape(b) {
  return JSON.stringify({ matches: b.matches, halfMatches: b.halfMatches, totals: b.totals })
}

async function main() {
  console.log('\nFixtures — isolated inactive conference')
  const conf = await prisma.conference.create({ data: {
    id: fid('conf'), name: 'Perf Test Conf', active: false,
    startDate: new Date('2034-06-01T00:00:00Z'), endDate: new Date('2034-06-02T23:59:59Z'),
  } })
  const confId = conf.id
  const spA = await prisma.sponsor.create({ data: {
    id: fid('sponsor-a'), conferenceId: confId, name: 'perf-test Apex Corp', tier: 'GOLD',
    solutionsSeeking: JSON.stringify(['Payments']), solutionsOffering: JSON.stringify(['CRM']),
  } })
  const mkUser = (slug, name, extra = {}) => prisma.user.create({ data: {
    id: fid(`user-${slug}`), email: `${PREFIX}${slug}-${stamp}@example.com`, name, role: 'ATTENDEE', ...extra,
  } })
  const rep1 = await mkUser('rep1', 'perf-test Rita Rep', { sponsorId: spA.id })
  const u1 = await mkUser('u1', 'perf-test Uma Buyer', {
    company: 'perf-test Buyer Co',
    solutionsOffering: JSON.stringify(['Payments']), solutionsSeeking: JSON.stringify(['CRM']),
  })
  const u2 = await mkUser('u2', 'perf-test Ugo Buyer') // one-sided pick → a half match
  const tb1 = await prisma.timeBlock.create({ data: { id: fid('tb-1'), conferenceId: confId, startsAt: new Date('2034-06-01T10:00:00Z'), endsAt: new Date('2034-06-01T10:30:00Z') } })
  const tb2 = await prisma.timeBlock.create({ data: { id: fid('tb-2'), conferenceId: confId, startsAt: new Date('2034-06-01T11:00:00Z'), endsAt: new Date('2034-06-01T11:30:00Z') } })
  const mkReq = (slug, data) => prisma.meetingRequest.create({ data: { id: fid(`req-${slug}`), ...data } })
  // Mutual BEST_FIT (A,u1) → a match the sweep schedules. One-sided (A,u2) → a half match.
  await mkReq('u1-a', { requesterId: u1.id, targetSponsorId: spA.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-02-01T09:00:00Z') })
  await mkReq('rep1-u1', { requesterId: rep1.id, targetUserId: u1.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-02-01T10:00:00Z') })
  await mkReq('u2-a', { requesterId: u2.id, targetSponsorId: spA.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-02-02T09:00:00Z') })
  console.log(`  created conference ${confId} (1 sponsor, 3 users, 2 blocks, 3 requests)`)

  // ── conferenceId cache surface ─────────────────────────────────────────────
  console.log('\nresolveConferenceId cache surface')
  check('invalidateActiveConferenceCache is exported and callable',
    typeof E.invalidateActiveConferenceCache === 'function')
  E.invalidateActiveConferenceCache() // must not throw
  check('calling invalidateActiveConferenceCache() does not throw', true)

  // ── syncAutoMatchesOnRead throttle ─────────────────────────────────────────
  // This confId has never been swept-on-read in this process, so the first call
  // runs the real sweep (schedules the (A,u1) pair); the immediate second call
  // is inside SWEEP_THROTTLE_MS and must short-circuit with skipped=true.
  console.log('\nsyncAutoMatchesOnRead — read-path throttle')
  const first = await E.syncAutoMatchesOnRead(prisma, confId)
  check('first read-sweep runs (not skipped) and schedules the ready (A,u1) pair',
    !first.skipped && first.scheduled.length === 1 && first.scheduled[0].userId === u1.id,
    JSON.stringify({ skipped: first.skipped, scheduled: first.scheduled.map(s => s.userId) }))
  const meetingAfterFirst = await prisma.sponsorMeeting.count({ where: { sponsorId: spA.id, userId: u1.id, status: 'CONFIRMED' } })
  check('the sweep actually persisted the (A,u1) meeting', meetingAfterFirst === 1, `count=${meetingAfterFirst}`)

  const t0 = performance.now()
  const second = await E.syncAutoMatchesOnRead(prisma, confId)
  const throttledMs = performance.now() - t0
  check('immediate second read-sweep is throttled (skipped=true, schedules nothing)',
    second.skipped === true && second.scheduled.length === 0, JSON.stringify(second))
  check('a throttled read-sweep short-circuits before any query (fast, no round-trips)',
    throttledMs < 50, `${throttledMs.toFixed(1)}ms`)

  // The unthrottled sweep the portals call on write must ALWAYS run, even inside
  // the read throttle window — it is a distinct function.
  const forced = await E.syncAutoMatches(prisma, confId)
  check('unthrottled syncAutoMatches() still runs during the throttle window (portal write path)',
    forced.skipped === undefined && Array.isArray(forced.scheduled),
    JSON.stringify({ skipped: forced.skipped, scheduled: forced.scheduled.length }))

  // ── getAutoMatchBoard precomputed-reuse equivalence ────────────────────────
  // With the pair already scheduled and nothing new to place, syncAutoMatches
  // returns its `computed` snapshot; feeding it back to getAutoMatchBoard must
  // yield the identical derived board as a full recompute.
  console.log('\ngetAutoMatchBoard — precomputed reuse equivalence')
  const sync = await E.syncAutoMatches(prisma, confId)
  check('a no-op sweep returns its computed snapshot for reuse',
    sync.scheduled.length === 0 && sync.computed && Array.isArray(sync.computed.matches),
    JSON.stringify({ scheduled: sync.scheduled.length, hasComputed: !!sync.computed }))

  const boardFresh = await E.getAutoMatchBoard(prisma, confId)
  const boardReuse = await E.getAutoMatchBoard(prisma, confId, sync.computed)
  check('board(precomputed) equals board(recomputed) — matches, halves, totals identical',
    boardShape(boardFresh) === boardShape(boardReuse),
    `fresh≠reuse`)
  check('the scheduled (A,u1) match is present with its meeting in both',
    boardReuse.matches.find(m => m.key === key(spA.id, u1.id))?.meeting?.timeBlockId &&
    boardReuse.totals.scheduled === 1 && boardReuse.totals.awaitingReciprocation === 1,
    JSON.stringify(boardReuse.totals))

  // ── perf: precomputed board avoids a full re-scan ──────────────────────────
  console.log('\nperf — precomputed board is not slower than a recompute')
  const tR = performance.now(); await E.getAutoMatchBoard(prisma, confId); const recomputeMs = performance.now() - tR
  const tP = performance.now(); await E.getAutoMatchBoard(prisma, confId, sync.computed); const reuseMs = performance.now() - tP
  // Reuse skips one computeAutoMatches (several Turso round-trips); allow slack
  // for network jitter but require it is not materially slower.
  check('board(precomputed) is not slower than board(recompute)',
    reuseMs <= recomputeMs + 30, `reuse=${reuseMs.toFixed(0)}ms recompute=${recomputeMs.toFixed(0)}ms`)
  console.log(`  · recompute ${recomputeMs.toFixed(0)}ms · reuse ${reuseMs.toFixed(0)}ms · throttled-skip ${throttledMs.toFixed(1)}ms`)
}

try {
  await main()
} catch (e) {
  failures++; console.error('  ✗ unexpected error:', e)
} finally {
  await cleanup()
  await prisma.$disconnect()
}

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
