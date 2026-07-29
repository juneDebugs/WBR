#!/usr/bin/env node
// Engine test for mutual Best Fit auto-matching (packages/db/src/meeting-engine.ts
// — getAutoMatchBoard / scheduleAutoMatches / syncAutoMatches + AutoMatchEvent log).
//
// Runs the real engine functions against the live DB (Turso when creds are in
// apps/*/.env.local, else local dev.db). Creates a fully throwaway world — an
// INACTIVE fixture conference with its own sponsors, reps, attendees, time
// blocks and MeetingRequests (ids prefixed 'am-test-', explicit createdAt for
// determinism) — and passes conferenceId explicitly to every call, so the real
// active conference is never touched. Exercises match derivation (mutual
// BEST_FIT only; one-directional / MED / REJECTED pairs excluded; earliest
// duplicate rep pick wins), pick metadata (byName, pickedAt, matchedAt =
// later pick), fit scoring, totals math, dry-run planning (nothing persisted),
// real scheduling (sponsor-side request preferred → meeting inherits repId,
// request flips CONFIRMED, earliest free block + Table 1 first), post-schedule
// board state and ordering, idempotence, the syncAutoMatches sweep (schedules
// ready pairs, writes MATCHED/SCHEDULED AutoMatchEvent rows, backfills
// SCHEDULED for pre-existing meetings, skips unschedulable pairs, writes
// nothing on a second run), and the board meeting actions —
// rescheduleAutoMatchMeeting (guarded move + RESCHEDULED event) and
// cancelAutoMatchMeeting (cancel + both-direction pick withdrawal + CANCELLED
// event, sweep does not resurrect, fresh mutual picks re-match with fresh log
// entries via the cancellation-aware dedup). The event log is GLOBAL (not
// conference-scoped), so board.log assertions always filter to fixture pairs —
// never global length/order. Deletes every fixture row in finally.
//
//   node scripts/test-auto-match.mjs
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

// Every fixture row's id (and every fixture user's email) starts with PREFIX,
// so cleanup() can sweep by prefix even after a crashed earlier run.
const PREFIX = 'am-test-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`
const key = (sponsorId, userId) => `${sponsorId}::${userId}`

async function cleanup() {
  // Children first; Conference delete cascades TimeBlocks + Sponsors.
  await prisma.autoMatchEvent.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.meetingRequest.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.sponsorMeeting.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.conference.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
}

async function main() {
  console.log('\nFixtures — isolated inactive conference')
  const conf = await prisma.conference.create({ data: {
    id: fid('conf'), name: 'Auto-Match Test Conf', active: false,
    startDate: new Date('2033-06-01T00:00:00Z'), endDate: new Date('2033-06-02T23:59:59Z'),
  } })
  const confId = conf.id
  // Sponsor A has solutions so the (A, u1) match scores > 0; B is plain (score 0);
  // C exists only to pre-book u2 in tb1, forcing the (B, u2) meeting into tb2.
  const spA = await prisma.sponsor.create({ data: {
    id: fid('sponsor-a'), conferenceId: confId, name: 'am-test Apex Corp', tier: 'GOLD',
    solutionsSeeking: JSON.stringify(['Payments', 'Analytics']),
    solutionsOffering: JSON.stringify(['CRM']),
  } })
  const spB = await prisma.sponsor.create({ data: {
    id: fid('sponsor-b'), conferenceId: confId, name: 'am-test Basis Inc', tier: 'SILVER',
  } })
  const spC = await prisma.sponsor.create({ data: {
    id: fid('sponsor-c'), conferenceId: confId, name: 'am-test Clutter Co', tier: 'BRONZE',
  } })
  const mkUser = (slug, name, extra = {}) => prisma.user.create({ data: {
    id: fid(`user-${slug}`), email: `${PREFIX}${slug}-${stamp}@example.com`, name, role: 'ATTENDEE', ...extra,
  } })
  const rep1 = await mkUser('rep1', 'am-test Rita Rep', { sponsorId: spA.id })
  const rep2 = await mkUser('rep2', 'am-test Ray Rep', { sponsorId: spA.id })
  const repB = await mkUser('repb', 'am-test Bea Rep', { sponsorId: spB.id })
  // u1's solutions overlap sponsor A's seeking/offering → score > 0, matched non-empty.
  const u1 = await mkUser('u1', 'am-test Uma Buyer', {
    company: 'am-test Buyer Co',
    solutionsOffering: JSON.stringify(['Payments']), solutionsSeeking: JSON.stringify(['CRM']),
  })
  const u2 = await mkUser('u2', 'am-test Ugo Buyer')
  const u3 = await mkUser('u3', 'am-test Una Buyer')
  const u4 = await mkUser('u4', 'am-test Uri Buyer')
  const tb1 = await prisma.timeBlock.create({ data: { id: fid('tb-1'), conferenceId: confId, startsAt: new Date('2033-06-01T10:00:00Z'), endsAt: new Date('2033-06-01T10:30:00Z') } })
  const tb2 = await prisma.timeBlock.create({ data: { id: fid('tb-2'), conferenceId: confId, startsAt: new Date('2033-06-01T11:00:00Z'), endsAt: new Date('2033-06-01T11:30:00Z') } })
  // u2 is pre-booked with sponsor C in tb1, so the scheduler must place (B, u2)
  // in tb2 — proving the earliest-FREE-block rule and giving the post-schedule
  // board two distinct startsAt values to sort.
  await prisma.sponsorMeeting.create({ data: { id: fid('m-busy'), sponsorId: spC.id, userId: u2.id, timeBlockId: tb1.id, status: 'CONFIRMED', location: 'Table 1' } })

  // MeetingRequests — explicit ids and createdAt for full determinism.
  //   (A, u1)  mutual BEST_FIT; two rep picks (rep2's row INSERTED first but
  //            CREATED later) → sponsorPick must be rep1's (earliest createdAt).
  //   (A, u2)  attendee side only → not a match.
  //   (A, u3)  mutual, but rep side is MED → not a match.
  //   (A, u4)  mutual BEST_FIT, but rep side REJECTED → not a match.
  //   (B, u2)  mutual BEST_FIT (rep side APPROVED) → second match, second company.
  const T_U1_PICK = new Date('2026-01-01T09:00:00Z')
  const T_REP1_PICK = new Date('2026-01-01T10:00:00Z')
  const T_REP2_PICK = new Date('2026-01-01T11:00:00Z')
  const mkReq = (slug, data) => prisma.meetingRequest.create({ data: { id: fid(`req-${slug}`), ...data } })
  const rRep2U1 = await mkReq('rep2-u1', { requesterId: rep2.id, targetUserId: u1.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: T_REP2_PICK })
  const rRep1U1 = await mkReq('rep1-u1', { requesterId: rep1.id, targetUserId: u1.id, priority: 'BEST_FIT', status: 'PENDING', message: 'am-test rep note', createdAt: T_REP1_PICK })
  const rU1A = await mkReq('u1-a', { requesterId: u1.id, targetSponsorId: spA.id, priority: 'BEST_FIT', status: 'PENDING', message: 'am-test buyer note', createdAt: T_U1_PICK })
  const rU2A = await mkReq('u2-a', { requesterId: u2.id, targetSponsorId: spA.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-01-02T09:00:00Z') })
  await mkReq('u3-a', { requesterId: u3.id, targetSponsorId: spA.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-01-02T10:00:00Z') })
  await mkReq('rep1-u3', { requesterId: rep1.id, targetUserId: u3.id, priority: 'MED', status: 'PENDING', createdAt: new Date('2026-01-02T10:30:00Z') })
  await mkReq('u4-a', { requesterId: u4.id, targetSponsorId: spA.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-01-02T11:00:00Z') })
  await mkReq('rep1-u4', { requesterId: rep1.id, targetUserId: u4.id, priority: 'BEST_FIT', status: 'REJECTED', createdAt: new Date('2026-01-02T11:30:00Z') })
  const rU2B = await mkReq('u2-b', { requesterId: u2.id, targetSponsorId: spB.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-01-03T09:00:00Z') })
  const rRepBU2 = await mkReq('repb-u2', { requesterId: repB.id, targetUserId: u2.id, priority: 'BEST_FIT', status: 'APPROVED', createdAt: new Date('2026-01-03T10:00:00Z') })
  console.log(`  created conference ${confId} (3 sponsors, 7 users, 2 blocks, 1 pre-booked meeting, 10 requests)`)

  console.log('\nBoard — match derivation')
  let board = await E.getAutoMatchBoard(prisma, confId)
  const keysOf = b => b.matches.map(m => m.key)
  check('exactly the two mutual pairs match: (A,u1) and (B,u2)',
    board.matches.length === 2 && keysOf(board).includes(key(spA.id, u1.id)) && keysOf(board).includes(key(spB.id, u2.id)),
    `keys=${keysOf(board).map(k => k.replaceAll(PREFIX, '')).join(' ')}`)
  check('one-directional (A,u2) is not a match', !keysOf(board).includes(key(spA.id, u2.id)))
  check('mutual-but-MED (A,u3) is not a match', !keysOf(board).includes(key(spA.id, u3.id)))
  check('mutual-but-REJECTED (A,u4) is not a match', !keysOf(board).includes(key(spA.id, u4.id)))
  check('totals: matches=2, ready=2, scheduled=0',
    board.totals.matches === 2 && board.totals.ready === 2 && board.totals.scheduled === 0, JSON.stringify(board.totals))
  // The event log is global, so only its shape — and the ABSENCE of fixture
  // entries before any sweep — can be asserted here.
  const ourLog = b => (b.log ?? []).filter(e => e.sponsorId?.startsWith(PREFIX) || e.userId?.startsWith(PREFIX))
  check('board carries a log[] (audit trail), no fixture entries before any sweep',
    Array.isArray(board.log) && ourLog(board).length === 0, `ours=${ourLog(board).length}`)

  const mA = board.matches.find(m => m.key === key(spA.id, u1.id))
  const mB = board.matches.find(m => m.key === key(spB.id, u2.id))
  check('(A,u1) is ready (meeting null) and carries sponsor + attendee identity',
    mA?.meeting === null && mA.sponsor.id === spA.id && mA.sponsor.tier === 'GOLD' &&
    mA.attendee.id === u1.id && mA.attendee.company === 'am-test Buyer Co')
  check('(A,u1) sponsorPick is the EARLIEST rep request (rep1, not rep2)',
    mA?.sponsorPick.requestId === rRep1U1.id, `got ${mA?.sponsorPick.requestId}`)
  check('(A,u1) sponsorPick.byName = rep name, attendeePick.byName = attendee name',
    mA?.sponsorPick.byName === rep1.name && mA?.attendeePick.byName === u1.name)
  check('(A,u1) attendeePick is the attendee→sponsor request with its message',
    mA?.attendeePick.requestId === rU1A.id && mA?.attendeePick.message === 'am-test buyer note' && mA?.attendeePick.status === 'PENDING')
  check('(A,u1) matchedAt = the later pick (rep1 createdAt)',
    mA?.matchedAt === T_REP1_PICK.toISOString(),
    `matchedAt=${mA?.matchedAt}`)
  check('(A,u1) pickedAt round-trips both explicit createdAt values',
    mA?.attendeePick.pickedAt === T_U1_PICK.toISOString() && mA?.sponsorPick.pickedAt === T_REP1_PICK.toISOString())
  check('(A,u1) score > 0 with non-empty matchedSolutions (Payments overlap)',
    typeof mA?.score === 'number' && mA.score > 0 && Array.isArray(mA.matchedSolutions) && mA.matchedSolutions.includes('Payments'),
    `score=${mA?.score} matched=${JSON.stringify(mA?.matchedSolutions)}`)
  check('(B,u2) matches too (second company) with APPROVED sponsor pick and score 0',
    !!mB && mB.meeting === null && mB.sponsorPick.requestId === rRepBU2.id && mB.sponsorPick.status === 'APPROVED' &&
    mB.attendeePick.requestId === rU2B.id && mB.score === 0)
  check('ready ordering: best score first — (A,u1) before (B,u2)',
    board.matches[0]?.key === key(spA.id, u1.id) && board.matches[1]?.key === key(spB.id, u2.id))

  console.log('\nscheduleAutoMatches — dry run')
  const dry = await E.scheduleAutoMatches(prisma, { conferenceId: confId, dryRun: true })
  check('dryRun flag echoes true with matchedPairs = 2 ready matches', dry.dryRun === true && dry.matchedPairs === 2, JSON.stringify({ dryRun: dry.dryRun, matchedPairs: dry.matchedPairs }))
  const dryReqIds = dry.scheduled.map(s => s.requestId)
  check('plan schedules exactly the two matched-pair requests (sponsor-side picks)',
    dry.scheduled.length === 2 && dryReqIds.includes(rRep1U1.id) && dryReqIds.includes(rRepBU2.id),
    `requestIds=${dryReqIds.map(id => id.replaceAll(PREFIX, '')).join(' ')}`)
  check('the one-directional (u2→A) request is NOT in the plan', !dryReqIds.includes(rU2A.id))
  const dryA = dry.scheduled.find(s => s.requestId === rRep1U1.id)
  const dryB = dry.scheduled.find(s => s.requestId === rRepBU2.id)
  check('plan places (A,u1) in the earliest block, Table 1 first',
    dryA?.timeBlockId === tb1.id && dryA?.room === 'Table 1')
  check('plan places (B,u2) in tb2 — u2 is pre-booked in tb1', dryB?.timeBlockId === tb2.id, `got ${dryB?.timeBlockId}`)
  const afterDry = await prisma.sponsorMeeting.count({ where: { userId: { startsWith: PREFIX } } })
  check('dry run persisted nothing (only the pre-booked meeting exists)', afterDry === 1, `count=${afterDry}`)
  const reqAfterDry = await prisma.meetingRequest.findUnique({ where: { id: rRep1U1.id }, select: { status: true } })
  check('dry run left request statuses untouched', reqAfterDry?.status === 'PENDING')

  console.log('\nscheduleAutoMatches — real run')
  const run = await E.scheduleAutoMatches(prisma, { conferenceId: confId })
  check('real run: dryRun false, matchedPairs=2, scheduled=2, skipped=0',
    run.dryRun === false && run.matchedPairs === 2 && run.scheduled.length === 2 && run.skipped.length === 0,
    JSON.stringify({ matchedPairs: run.matchedPairs, scheduled: run.scheduled.length, skipped: run.skipped.length }))
  const mtgA = await prisma.sponsorMeeting.findFirst({ where: { sponsorId: spA.id, userId: u1.id }, select: { status: true, repId: true, timeBlockId: true, location: true } })
  check('(A,u1) meeting persisted CONFIRMED in tb1 / Table 1',
    mtgA?.status === 'CONFIRMED' && mtgA.timeBlockId === tb1.id && mtgA.location === 'Table 1', JSON.stringify(mtgA))
  check('(A,u1) meeting inherits repId = the EARLIEST rep (rep1)', mtgA?.repId === rep1.id, `repId=${mtgA?.repId}`)
  const mtgB = await prisma.sponsorMeeting.findFirst({ where: { sponsorId: spB.id, userId: u2.id }, select: { status: true, repId: true, timeBlockId: true } })
  check('(B,u2) meeting persisted CONFIRMED in tb2 with repId = repB', mtgB?.status === 'CONFIRMED' && mtgB.timeBlockId === tb2.id && mtgB.repId === repB.id, JSON.stringify(mtgB))
  const reqStates = Object.fromEntries((await prisma.meetingRequest.findMany({
    where: { id: { in: [rRep1U1.id, rRep2U1.id, rU1A.id, rRepBU2.id] } }, select: { id: true, status: true, timeBlockId: true },
  })).map(r => [r.id, r]))
  check('scheduled sponsor-side requests flipped to CONFIRMED with the booked block',
    reqStates[rRep1U1.id]?.status === 'CONFIRMED' && reqStates[rRep1U1.id]?.timeBlockId === tb1.id &&
    reqStates[rRepBU2.id]?.status === 'CONFIRMED' && reqStates[rRepBU2.id]?.timeBlockId === tb2.id)
  check('the attendee pick and the duplicate rep pick stay PENDING',
    reqStates[rU1A.id]?.status === 'PENDING' && reqStates[rRep2U1.id]?.status === 'PENDING')

  console.log('\nBoard after scheduling')
  board = await E.getAutoMatchBoard(prisma, confId)
  check('totals: matches=2, ready=0, scheduled=2',
    board.totals.matches === 2 && board.totals.ready === 0 && board.totals.scheduled === 2, JSON.stringify(board.totals))
  const mA2 = board.matches.find(m => m.key === key(spA.id, u1.id))
  check('(A,u1) shows its meeting with room + ISO startsAt/endsAt',
    mA2?.meeting?.room === 'Table 1' && mA2.meeting.timeBlockId === tb1.id &&
    mA2.meeting.startsAt === tb1.startsAt.toISOString() && mA2.meeting.endsAt === tb1.endsAt.toISOString(),
    JSON.stringify(mA2?.meeting))
  check('match survives one side flipping to CONFIRMED (sponsorPick.status)', mA2?.sponsorPick.status === 'CONFIRMED')
  check('scheduled matches sorted by meeting startsAt: (A,u1) tb1 before (B,u2) tb2',
    board.matches[0]?.key === key(spA.id, u1.id) && board.matches[1]?.key === key(spB.id, u2.id))

  // A late third pair whose two picks are both status CONFIRMED (legacy state,
  // no meeting): it matches — so it must sort BEFORE the scheduled pairs — but
  // has no PENDING/APPROVED pick, so the scheduler must leave it alone.
  console.log('\nReady-before-scheduled ordering')
  const u5 = await mkUser('u5', 'am-test Ute Buyer')
  await mkReq('u5-a', { requesterId: u5.id, targetSponsorId: spA.id, priority: 'BEST_FIT', status: 'CONFIRMED', createdAt: new Date('2026-01-04T09:00:00Z') })
  await mkReq('rep1-u5', { requesterId: rep1.id, targetUserId: u5.id, priority: 'BEST_FIT', status: 'CONFIRMED', createdAt: new Date('2026-01-04T10:00:00Z') })
  board = await E.getAutoMatchBoard(prisma, confId)
  check('totals now: matches=3, ready=1, scheduled=2',
    board.totals.matches === 3 && board.totals.ready === 1 && board.totals.scheduled === 2, JSON.stringify(board.totals))
  check('the ready (A,u5) match sorts before both scheduled matches',
    board.matches[0]?.key === key(spA.id, u5.id) && board.matches[0]?.meeting === null,
    `order=${keysOf(board).map(k => k.replaceAll(PREFIX, '')).join(' ')}`)

  console.log('\nIdempotence')
  const again = await E.scheduleAutoMatches(prisma, { conferenceId: confId })
  check('second run schedules nothing: matchedPairs=0, scheduled=0',
    again.matchedPairs === 0 && again.scheduled.length === 0 && again.totalEligible === 0, JSON.stringify({ matchedPairs: again.matchedPairs, scheduled: again.scheduled.length }))
  const finalCount = await prisma.sponsorMeeting.count({ where: { userId: { startsWith: PREFIX } } })
  check('no extra meetings created (1 pre-booked + 2 scheduled = 3)', finalCount === 3, `count=${finalCount}`)

  // The sweep the admin GET runs on every board read. State walking in:
  //   (A,u1) + (B,u2) have meetings created by scheduleAutoMatches → NO events
  //   yet (backfill targets); (A,u5) is ready but unschedulable (both picks
  //   CONFIRMED-status, no live pick); (A,u6) is a fresh ready mutual pair the
  //   sweep must schedule. Within the fixture conference the sync counters are
  //   exact; only board.log is global.
  console.log('\nsyncAutoMatches — sweep, log writes, backfill')
  const u6 = await mkUser('u6', 'am-test Ulf Buyer')
  await mkReq('u6-a', { requesterId: u6.id, targetSponsorId: spA.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-01-05T09:00:00Z') })
  const rRep1U6 = await mkReq('rep1-u6', { requesterId: rep1.id, targetUserId: u6.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-01-05T10:00:00Z') })
  const sync = await E.syncAutoMatches(prisma, confId)
  check('sweep schedules the one ready schedulable pair (A,u6)',
    sync.scheduled.length === 1 && sync.scheduled[0].requestId === rRep1U6.id && sync.scheduled[0].userId === u6.id,
    JSON.stringify(sync.scheduled.map(s => s.requestId)))
  check('sweep counters: matchedLogged=4 (u1,u2,u5,u6), scheduledLogged=3 (u1+u2 backfill, u6 new)',
    sync.matchedLogged === 4 && sync.scheduledLogged === 3, JSON.stringify({ matchedLogged: sync.matchedLogged, scheduledLogged: sync.scheduledLogged }))
  const mtgU6 = await prisma.sponsorMeeting.findFirst({ where: { sponsorId: spA.id, userId: u6.id }, select: { status: true, repId: true, timeBlockId: true, location: true } })
  check('(A,u6) meeting persisted CONFIRMED in tb1 / Table 2 (Table 1 taken by u1), repId = rep1',
    mtgU6?.status === 'CONFIRMED' && mtgU6.timeBlockId === tb1.id && mtgU6.location === 'Table 2' && mtgU6.repId === rep1.id, JSON.stringify(mtgU6))

  const events = await prisma.autoMatchEvent.findMany({ where: { userId: { startsWith: PREFIX } } })
  const evOf = (sponsorId, userId, event) => events.filter(e => e.sponsorId === sponsorId && e.userId === userId && e.event === event)
  check('exactly 7 fixture events written (4 MATCHED + 3 SCHEDULED)',
    events.length === 7 && events.filter(e => e.event === 'MATCHED').length === 4, `count=${events.length}`)
  const mU6 = evOf(spA.id, u6.id, 'MATCHED')[0]
  check('(A,u6) MATCHED event: names populated, room/startsAt null',
    !!mU6 && mU6.sponsorName === spA.name && mU6.attendeeName === u6.name && mU6.room === null && mU6.startsAt === null)
  const sU6 = evOf(spA.id, u6.id, 'SCHEDULED')[0]
  check('(A,u6) SCHEDULED event carries room + slot startsAt',
    sU6?.room === 'Table 2' && sU6?.startsAt?.getTime() === tb1.startsAt.getTime() && sU6.sponsorName === spA.name && sU6.attendeeName === u6.name)
  check('backfill: (A,u1) meeting from the earlier scheduleAutoMatches run gets a SCHEDULED event',
    evOf(spA.id, u1.id, 'SCHEDULED')[0]?.room === 'Table 1' && evOf(spA.id, u1.id, 'SCHEDULED')[0]?.startsAt?.getTime() === tb1.startsAt.getTime())
  check('backfill: (B,u2) SCHEDULED event carries its tb2 slot',
    evOf(spB.id, u2.id, 'SCHEDULED')[0]?.startsAt?.getTime() === tb2.startsAt.getTime())
  check('unschedulable ready pair (A,u5): MATCHED written, no SCHEDULED',
    evOf(spA.id, u5.id, 'MATCHED').length === 1 && evOf(spA.id, u5.id, 'SCHEDULED').length === 0)

  console.log('\nsyncAutoMatches — idempotence')
  const sync2 = await E.syncAutoMatches(prisma, confId)
  check('second sweep schedules nothing and writes nothing',
    sync2.scheduled.length === 0 && sync2.matchedLogged === 0 && sync2.scheduledLogged === 0, JSON.stringify(sync2))
  const eventCount2 = await prisma.autoMatchEvent.count({ where: { userId: { startsWith: PREFIX } } })
  check('fixture event count unchanged after second sweep', eventCount2 === 7, `count=${eventCount2}`)
  const mtgCount2 = await prisma.sponsorMeeting.count({ where: { userId: { startsWith: PREFIX } } })
  check('meeting count unchanged after second sweep (3 + u6 = 4)', mtgCount2 === 4, `count=${mtgCount2}`)

  console.log('\nBoard log surface')
  board = await E.getAutoMatchBoard(prisma, confId)
  check('totals after sweep: matches=4, ready=1 (u5), scheduled=3',
    board.totals.matches === 4 && board.totals.ready === 1 && board.totals.scheduled === 3, JSON.stringify(board.totals))
  const oursInLog = ourLog(board)
  check('board.log surfaces the fixture events (MATCHED + SCHEDULED for u6 present)',
    oursInLog.some(e => e.userId === u6.id && e.event === 'MATCHED') &&
    oursInLog.some(e => e.userId === u6.id && e.event === 'SCHEDULED' && e.room === 'Table 2' && e.startsAt === tb1.startsAt.toISOString()),
    `ours=${oursInLog.length}`)
  check('log entries are ISO strings, newest first (createdAt non-increasing)',
    board.log.every(e => !Number.isNaN(Date.parse(e.createdAt))) &&
    board.log.every((e, i) => i === 0 || board.log[i - 1].createdAt >= e.createdAt))
  const viaHelper = (await E.getAutoMatchLog(prisma, 500)).filter(e => e.userId?.startsWith(PREFIX))
  check('getAutoMatchLog returns the same 7 fixture entries', viaHelper.length === 7, `count=${viaHelper.length}`)

  // ── Board meeting actions ────────────────────────────────────────────────
  // (A,u6) was scheduled by the sweep at tb1/Table 2 — move it, then cancel
  // it, then re-form the match with fresh picks. Pair-scoped event counters
  // via evOf() keep every assertion deterministic.
  console.log('\nrescheduleAutoMatchMeeting')
  const mtgU6Row = await prisma.sponsorMeeting.findFirst({
    where: { sponsorId: spA.id, userId: u6.id, status: 'CONFIRMED' }, select: { id: true },
  })
  const moved = await E.rescheduleAutoMatchMeeting(prisma, { sponsorMeetingId: mtgU6Row.id, timeBlockId: tb2.id, room: 'Table 1' })
  check('returns the updated meeting (tb2 / Table 1)',
    moved?.timeBlockId === tb2.id && moved?.location === 'Table 1', JSON.stringify({ tb: moved?.timeBlockId, room: moved?.location }))
  const movedRow = await prisma.sponsorMeeting.findUnique({ where: { id: mtgU6Row.id }, select: { timeBlockId: true, location: true, status: true } })
  check('meeting row persisted with the new slot, still CONFIRMED',
    movedRow?.timeBlockId === tb2.id && movedRow?.location === 'Table 1' && movedRow?.status === 'CONFIRMED', JSON.stringify(movedRow))
  const eventsOf = (sponsorId, userId, event) =>
    prisma.autoMatchEvent.findMany({ where: { sponsorId, userId, event } })
  const rescheduledEvents = await eventsOf(spA.id, u6.id, 'RESCHEDULED')
  check('RESCHEDULED event written with the new room + new slot startsAt',
    rescheduledEvents.length === 1 && rescheduledEvents[0].room === 'Table 1' &&
    rescheduledEvents[0].startsAt?.getTime() === tb2.startsAt.getTime() &&
    rescheduledEvents[0].sponsorName === spA.name && rescheduledEvents[0].attendeeName === u6.name)
  board = await E.getAutoMatchBoard(prisma, confId)
  const movedMatch = board.matches.find(m => m.key === key(spA.id, u6.id))
  check('board shows the match still scheduled, at the NEW slot',
    movedMatch?.meeting?.timeBlockId === tb2.id && movedMatch.meeting.room === 'Table 1' &&
    movedMatch.meeting.startsAt === tb2.startsAt.toISOString(), JSON.stringify(movedMatch?.meeting ?? null))

  console.log('\nreschedule — typed errors')
  await expectThrow('unknown room → UNKNOWN_ROOM', 'UNKNOWN_ROOM',
    () => E.rescheduleAutoMatchMeeting(prisma, { sponsorMeetingId: mtgU6Row.id, timeBlockId: tb1.id, room: 'Table 99' }))
  const mtgBRow = await prisma.sponsorMeeting.findFirst({
    where: { sponsorId: spB.id, userId: u2.id, status: 'CONFIRMED' }, select: { id: true },
  })
  await expectThrow('moving (B,u2) onto tb1 where u2 is pre-booked → CANDIDATE_BUSY', 'CANDIDATE_BUSY',
    () => E.rescheduleAutoMatchMeeting(prisma, { sponsorMeetingId: mtgBRow.id, timeBlockId: tb1.id, room: 'Table 2' }))
  await expectThrow('bogus meeting id → MEETING_NOT_FOUND', 'MEETING_NOT_FOUND',
    () => E.rescheduleAutoMatchMeeting(prisma, { sponsorMeetingId: `${PREFIX}bogus-${stamp}`, timeBlockId: tb1.id, room: 'Table 1' }))
  const rescheduledCount = await prisma.autoMatchEvent.count({ where: { userId: { startsWith: PREFIX }, event: 'RESCHEDULED' } })
  check('failed reschedules wrote no extra RESCHEDULED events', rescheduledCount === 1, `count=${rescheduledCount}`)

  console.log('\ncancelAutoMatchMeeting — dissolves the match')
  const cancelled = await E.cancelAutoMatchMeeting(prisma, { sponsorMeetingId: mtgU6Row.id, reason: 'am-test cancel' })
  check('returns cancelMeeting result (meeting CANCELLED, request not preserved)',
    cancelled?.meeting?.status === 'CANCELLED' && cancelled.preserved === false, JSON.stringify({ status: cancelled?.meeting?.status, preserved: cancelled?.preserved }))
  const cancelledRow = await prisma.sponsorMeeting.findUnique({ where: { id: mtgU6Row.id }, select: { status: true, reason: true } })
  check('meeting persisted CANCELLED with the reason', cancelledRow?.status === 'CANCELLED' && cancelledRow.reason === 'am-test cancel', JSON.stringify(cancelledRow))
  const u6Reqs = await prisma.meetingRequest.findMany({
    where: { OR: [{ requesterId: u6.id, targetSponsorId: spA.id }, { requesterId: rep1.id, targetUserId: u6.id }] },
    select: { status: true },
  })
  check('BOTH direction BEST_FIT picks flipped to CANCELLED',
    u6Reqs.length === 2 && u6Reqs.every(r => r.status === 'CANCELLED'), JSON.stringify(u6Reqs.map(r => r.status)))
  const cancelEvents = await eventsOf(spA.id, u6.id, 'CANCELLED')
  check('CANCELLED event written (room/startsAt null)',
    cancelEvents.length === 1 && cancelEvents[0].room === null && cancelEvents[0].startsAt === null &&
    cancelEvents[0].sponsorName === spA.name && cancelEvents[0].attendeeName === u6.name)
  board = await E.getAutoMatchBoard(prisma, confId)
  check('match GONE from the board (neither ready nor scheduled): matches=3, ready=1, scheduled=2',
    !board.matches.some(m => m.key === key(spA.id, u6.id)) &&
    board.totals.matches === 3 && board.totals.ready === 1 && board.totals.scheduled === 2, JSON.stringify(board.totals))

  console.log('\nSweep does not resurrect a cancelled match')
  const syncAfterCancel = await E.syncAutoMatches(prisma, confId)
  check('sweep after cancel schedules nothing and writes nothing',
    syncAfterCancel.scheduled.length === 0 && syncAfterCancel.matchedLogged === 0 && syncAfterCancel.scheduledLogged === 0, JSON.stringify(syncAfterCancel))
  const u6Meetings = await prisma.sponsorMeeting.count({ where: { sponsorId: spA.id, userId: u6.id } })
  check('no new meeting for the cancelled pair (only the CANCELLED row remains)', u6Meetings === 1, `count=${u6Meetings}`)
  const u6EventTotal = await prisma.autoMatchEvent.count({ where: { sponsorId: spA.id, userId: u6.id } })
  check('pair event history unchanged (MATCHED + SCHEDULED + RESCHEDULED + CANCELLED = 4)', u6EventTotal === 4, `count=${u6EventTotal}`)
  await expectThrow('cancel on the already-cancelled meeting → BAD_STATUS', 'BAD_STATUS',
    () => E.cancelAutoMatchMeeting(prisma, { sponsorMeetingId: mtgU6Row.id, reason: 'am-test again' }))

  console.log('\nRe-match after cancel (cancellation-aware log dedup)')
  await mkReq('u6-a2', { requesterId: u6.id, targetSponsorId: spA.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-01-06T09:00:00Z') })
  const rRep1U6b = await mkReq('rep1-u6b', { requesterId: rep1.id, targetUserId: u6.id, priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date('2026-01-06T10:00:00Z') })
  const syncRematch = await E.syncAutoMatches(prisma, confId)
  check('sweep re-schedules the re-formed pair via the fresh sponsor-side pick',
    syncRematch.scheduled.length === 1 && syncRematch.scheduled[0].requestId === rRep1U6b.id, JSON.stringify(syncRematch.scheduled.map(s => s.requestId)))
  check('re-scheduled back into tb1 / Table 2 (Table 1 still held by u1)',
    syncRematch.scheduled[0]?.timeBlockId === tb1.id && syncRematch.scheduled[0]?.room === 'Table 2')
  check('fresh MATCHED + SCHEDULED logged despite the pair\'s older events',
    syncRematch.matchedLogged === 1 && syncRematch.scheduledLogged === 1, JSON.stringify({ matchedLogged: syncRematch.matchedLogged, scheduledLogged: syncRematch.scheduledLogged }))
  const [m2, s2, r2c, c2] = await Promise.all([
    eventsOf(spA.id, u6.id, 'MATCHED'), eventsOf(spA.id, u6.id, 'SCHEDULED'),
    eventsOf(spA.id, u6.id, 'RESCHEDULED'), eventsOf(spA.id, u6.id, 'CANCELLED'),
  ])
  check('pair log history: 2 MATCHED, 2 SCHEDULED, 1 RESCHEDULED, 1 CANCELLED',
    m2.length === 2 && s2.length === 2 && r2c.length === 1 && c2.length === 1,
    `M=${m2.length} S=${s2.length} R=${r2c.length} C=${c2.length}`)
  const liveU6 = await prisma.sponsorMeeting.count({ where: { sponsorId: spA.id, userId: u6.id, status: 'CONFIRMED' } })
  check('exactly one live meeting again for the pair', liveU6 === 1, `count=${liveU6}`)
  board = await E.getAutoMatchBoard(prisma, confId)
  check('board shows the re-formed match scheduled again: matches=4, ready=1, scheduled=3',
    board.matches.find(m => m.key === key(spA.id, u6.id))?.meeting?.timeBlockId === tb1.id &&
    board.totals.matches === 4 && board.totals.ready === 1 && board.totals.scheduled === 3, JSON.stringify(board.totals))
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
