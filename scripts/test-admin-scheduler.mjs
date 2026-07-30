#!/usr/bin/env node
// Engine test for the ADMIN Companies scheduler (packages/db/src/meeting-engine.ts).
//
// Runs the real engine functions against the live DB (Turso when creds are in
// apps/*/.env.local, else local dev.db). Creates a fully throwaway world — an
// INACTIVE fixture conference with its own sponsors, users, time blocks and
// requests (ids prefixed 'adm-sched-test-') — and passes conferenceId
// explicitly to every engine call, so the real active conference is never
// touched. Exercises directory → matrix → assign → conflicts → reschedule →
// cancel(preserve) → cancel(remove), including the NEW misc behavior:
// cancel-with-remove lands the request in matrix.misc as 'Removed' and a
// REJECTED request reads as 'Declined'. Deletes every fixture row in finally.
//
//   node scripts/test-admin-scheduler.mjs
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
const PREFIX = 'adm-sched-test-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`

async function cleanup() {
  // Children first; Conference delete cascades TimeBlocks + Sponsors.
  await prisma.sponsorMeeting.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.meetingRequest.deleteMany({ where: { requesterId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.conference.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
}

async function main() {
  console.log('\nFixtures — isolated inactive conference')
  const conf = await prisma.conference.create({ data: {
    id: fid('conf'), name: 'Admin Scheduler Test Conf', active: false,
    startDate: new Date('2031-01-06T00:00:00Z'), endDate: new Date('2031-01-07T23:59:59Z'),
  } })
  const confId = conf.id
  const sponsor = await prisma.sponsor.create({ data: {
    id: fid('sponsor-a'), conferenceId: confId, name: 'Adm Sched Test Co A', tier: 'GOLD',
    solutionsSeeking: JSON.stringify(['CDP']), solutionsOffering: JSON.stringify([]),
  } })
  const sponsor2 = await prisma.sponsor.create({ data: {
    id: fid('sponsor-b'), conferenceId: confId, name: 'Adm Sched Test Co B', tier: 'SILVER',
  } })
  // A does NOT match the sponsor's seeking (score 0) but is BEST_FIT priority;
  // B matches (score > 0) but is only MED — the tier must beat the score.
  const userA = await prisma.user.create({ data: {
    id: fid('user-a'), email: `${PREFIX}a-${stamp}@example.com`, name: 'Adm Sched Test A',
    role: 'ATTENDEE', solutionsOffering: JSON.stringify([]),
  } })
  const userB = await prisma.user.create({ data: {
    id: fid('user-b'), email: `${PREFIX}b-${stamp}@example.com`, name: 'Adm Sched Test B',
    role: 'ATTENDEE', solutionsOffering: JSON.stringify(['CDP']),
  } })
  // 2 blocks on day 1 + 1 block on day 2.
  const tb1 = await prisma.timeBlock.create({ data: { id: fid('tb-1'), conferenceId: confId, startsAt: new Date('2031-01-06T14:00:00Z'), endsAt: new Date('2031-01-06T14:30:00Z') } })
  const tb2 = await prisma.timeBlock.create({ data: { id: fid('tb-2'), conferenceId: confId, startsAt: new Date('2031-01-06T15:00:00Z'), endsAt: new Date('2031-01-06T15:30:00Z') } })
  const tb3 = await prisma.timeBlock.create({ data: { id: fid('tb-3'), conferenceId: confId, startsAt: new Date('2031-01-07T14:00:00Z'), endsAt: new Date('2031-01-07T14:30:00Z') } })
  const reqA = await prisma.meetingRequest.create({ data: { id: fid('req-a'), requesterId: userA.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'BEST_FIT' } })
  const reqB = await prisma.meetingRequest.create({ data: { id: fid('req-b'), requesterId: userB.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'MED' } })
  const reqP = await prisma.meetingRequest.create({ data: { id: fid('req-p'), requesterId: userB.id, targetSponsorId: sponsor.id, status: 'PENDING', priority: 'LOW' } })
  const reqR = await prisma.meetingRequest.create({ data: { id: fid('req-r'), requesterId: userB.id, targetSponsorId: sponsor.id, status: 'REJECTED' } })
  console.log(`  created conference ${confId} (2 sponsors, 2 users, 3 blocks, 4 requests)`)

  console.log('\nDirectory')
  const dir = await E.getCompanyDirectory(prisma, confId)
  const row = dir.find(d => d.id === sponsor.id)
  check('directory includes the fixture sponsor row', !!row)
  if (!row) return
  check('directory requestsReceived = 3 (REJECTED excluded)', row.requestsReceived === 3, `got ${row.requestsReceived}`)
  check('directory pending = 1', row.pending === 1, `got ${row.pending}`)
  check('directory unscheduled = 2', row.unscheduled === 2, `got ${row.unscheduled}`)
  check('directory confirmed = 0 / fillRate = 0', row.confirmed === 0 && row.fillRate === 0, `confirmed=${row.confirmed} fill=${row.fillRate}`)

  console.log('\nMatrix — bank / pending / misc / slots')
  let mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  check('matrix rooms enumerate 9 rooms / slotCapacity 1 (exclusive slots)', mx.rooms.length === 9 && mx.slotCapacity === 1, `rooms=${mx.rooms.length} cap=${mx.slotCapacity}`)
  const bankA = mx.bank.find(b => b.requestId === reqA.id)
  const bankB = mx.bank.find(b => b.requestId === reqB.id)
  check('pending vs bank split (A+B in bank, P in pending)',
    !!bankA && !!bankB && !mx.bank.find(b => b.requestId === reqP.id) && !!mx.pending.find(p => p.requestId === reqP.id))
  check('bank ranking: BEST_FIT ranks ahead of higher-scoring MED',
    bankA?.rank === 1 && bankB?.rank === 2 && bankA?.total === 3, `A#${bankA?.rank} B#${bankB?.rank} total=${bankA?.total}`)
  check('days group by UTC day (2 slots day 1, 1 slot day 2)',
    mx.days.length === 2 && mx.days[0].slots.length === 2 && mx.days[1].slots.length === 1,
    `days=${mx.days.length} slots=${mx.days.map(d => d.slots.length).join(',')}`)
  const slot1Before = mx.days.flatMap(d => d.slots).find(s => s.timeBlockId === tb1.id)
  check('capacityLeft starts at 1 (empty slot, exclusive)', slot1Before?.capacityLeft === 1, `got ${slot1Before?.capacityLeft}`)
  check('REJECTED request appears in misc as Declined',
    mx.misc.some(m => m.requestId === reqR.id && m.status === 'Declined'),
    JSON.stringify(mx.misc.map(m => m.status)))

  console.log('\nAssign round-trip')
  const mA = await E.assignMeeting(prisma, { requestId: reqA.id, timeBlockId: tb1.id, room: 'Table 1' })
  check('assign A → CONFIRMED meeting @ tb1 / Table 1', mA.status === 'CONFIRMED' && mA.timeBlockId === tb1.id && mA.location === 'Table 1')
  const reqAafter = await prisma.meetingRequest.findUnique({ where: { id: reqA.id }, select: { status: true, timeBlockId: true } })
  check('assign confirmed the request (status + timeBlockId)', reqAafter.status === 'CONFIRMED' && reqAafter.timeBlockId === tb1.id)
  mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  check('bank shrank and alreadyScheduled grew',
    !mx.bank.find(b => b.requestId === reqA.id) && mx.alreadyScheduled.some(s => s.sponsorMeetingId === mA.id && s.userId === userA.id))
  const slot1After = mx.days.flatMap(d => d.slots).find(s => s.timeBlockId === tb1.id)
  check('slot tb1 shows A with its room / capacityLeft = 0 (block booked)',
    !!slot1After?.meetings.find(m => m.userId === userA.id && m.room === 'Table 1') && slot1After?.capacityLeft === 0,
    `capacityLeft=${slot1After?.capacityLeft}`)
  const dir2 = await E.getCompanyDirectory(prisma, confId)
  const row2 = dir2.find(d => d.id === sponsor.id)
  check('directory after assign: confirmed = 1 / fillRate = 0.1 / unscheduled = 1',
    row2.confirmed === 1 && Math.abs(row2.fillRate - 0.1) < 1e-9 && row2.unscheduled === 1,
    `confirmed=${row2?.confirmed} fill=${row2?.fillRate} unscheduled=${row2?.unscheduled}`)

  console.log('\nConflicts')
  await expectThrow('assign B @ tb1 even at a different table (block exclusive) → SPONSOR_FULL', 'SPONSOR_FULL',
    () => E.assignMeeting(prisma, { requestId: reqB.id, timeBlockId: tb1.id, room: 'Table 2' }))
  const reqA2 = await prisma.meetingRequest.create({ data: { id: fid('req-a2'), requesterId: userA.id, targetSponsorId: sponsor.id, status: 'APPROVED' } })
  await expectThrow('assign a 2nd request for the booked pair → ALREADY_SCHEDULED', 'ALREADY_SCHEDULED',
    () => E.assignMeeting(prisma, { requestId: reqA2.id, timeBlockId: tb2.id, room: 'Table 2' }))
  const reqA3 = await prisma.meetingRequest.create({ data: { id: fid('req-a3'), requesterId: userA.id, targetSponsorId: sponsor2.id, status: 'APPROVED' } })
  await expectThrow('assign A to a 2nd sponsor in the same block → CANDIDATE_BUSY', 'CANDIDATE_BUSY',
    () => E.assignMeeting(prisma, { requestId: reqA3.id, timeBlockId: tb1.id, room: 'Table 1' }))

  console.log('\nReschedule')
  // Same block, different table label: allowed (excludeMeetingId lets the
  // meeting's own booking not count against the exclusive slot).
  const mAsameBlock = await E.rescheduleMeeting(prisma, { sponsorMeetingId: mA.id, timeBlockId: tb1.id, room: 'Table 2' })
  check('reschedule within the same block to another table ok', mAsameBlock.timeBlockId === tb1.id && mAsameBlock.location === 'Table 2')
  const mAmoved = await E.rescheduleMeeting(prisma, { sponsorMeetingId: mA.id, timeBlockId: tb2.id, room: 'Table 1' })
  check('reschedule moved the meeting to tb2 / Table 1', mAmoved.timeBlockId === tb2.id && mAmoved.location === 'Table 1')
  mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  const slot1Freed = mx.days.flatMap(d => d.slots).find(s => s.timeBlockId === tb1.id)
  check('old slot tb1 freed (capacityLeft back to 1)', slot1Freed?.meetings.length === 0 && slot1Freed?.capacityLeft === 1)
  const reqAmoved = await prisma.meetingRequest.findUnique({ where: { id: reqA.id }, select: { timeBlockId: true } })
  check('reschedule synced request.timeBlockId', reqAmoved.timeBlockId === tb2.id)

  console.log('\nCancel — preserve:true (back to bank)')
  const cancelA = await E.cancelMeeting(prisma, { sponsorMeetingId: mA.id, preserveRequest: true, reason: 'Scheduling conflict', notes: 'adm-sched-test' })
  check('cancel(preserve) marks meeting CANCELLED', cancelA.meeting.status === 'CANCELLED' && cancelA.preserved === true)
  const reqAcancel = await prisma.meetingRequest.findUnique({ where: { id: reqA.id }, select: { status: true, timeBlockId: true } })
  check('cancel(preserve) returns request to APPROVED with no block', reqAcancel.status === 'APPROVED' && reqAcancel.timeBlockId === null)
  mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  check('A reappears in the bank', !!mx.bank.find(b => b.requestId === reqA.id))

  console.log('\nCancel — preserve:false on a re-assigned meeting (NEW misc behavior)')
  const mA2 = await E.assignMeeting(prisma, { requestId: reqA.id, timeBlockId: tb3.id, room: 'Table 1' })
  check('re-assign A → new CONFIRMED meeting @ tb3', mA2.status === 'CONFIRMED' && mA2.timeBlockId === tb3.id)
  const cancelA2 = await E.cancelMeeting(prisma, { sponsorMeetingId: mA2.id, preserveRequest: false, reason: 'Company request' })
  check('cancel(remove) marks meeting CANCELLED', cancelA2.meeting.status === 'CANCELLED' && cancelA2.preserved === false)
  const reqAremoved = await prisma.meetingRequest.findUnique({ where: { id: reqA.id }, select: { status: true } })
  check('cancel(remove) sets request CANCELLED', reqAremoved.status === 'CANCELLED')
  mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  check('removed request appears in matrix.misc as Removed',
    mx.misc.some(m => m.requestId === reqA.id && m.status === 'Removed'),
    JSON.stringify(mx.misc.map(m => ({ r: m.requestId === reqA.id, s: m.status }))))
  check('removed request does NOT reappear in the bank', !mx.bank.find(b => b.requestId === reqA.id))
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
