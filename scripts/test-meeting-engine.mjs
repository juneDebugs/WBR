#!/usr/bin/env node
// Engine test for the company-centric meeting engine (packages/db/src/meeting-engine.ts).
//
// Runs the real engine functions against the live DB (Turso when creds are in
// apps/*/.env.local, else local dev.db). Creates its own throwaway fixtures
// (two attendees + their APPROVED requests), exercises the full lifecycle
// (rank / availability / assign / conflicts / reschedule / cancel), asserts,
// then deletes every fixture row so the DB is left exactly as found.
//
//   node scripts/test-meeting-engine.mjs
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

// ── Pure-function unit tests (no DB) ────────────────────────────────────────
function unitTests() {
  console.log('\nUnit — pure functions')
  check('interestLevel thresholds', E.interestLevel(80) === 'High' && E.interestLevel(50) === 'Medium' && E.interestLevel(10) === 'Low')
  const m = E.scoreSolutionsMatch(['CDP'], ['Email'], ['CDP'], ['Email'])
  check('scoreSolutionsMatch rewards seeking↔offering', m.score > 0 && m.matched.includes('CDP'))
  check('scoreSolutionsMatch empty → 0', E.scoreSolutionsMatch([], [], [], []).score === 0)
  check('parseSolutions handles junk', E.parseSolutions('not json').length === 0 && E.parseSolutions('["A","B"]').length === 2)
  check('resolveParties attendee→sponsor', E.resolveParties({ requesterId: 'u1', targetUserId: null, targetSponsorId: 's1' })?.sponsorId === 's1')
  check('resolveParties rep→attendee', (() => { const r = E.resolveParties({ requesterId: 'rep', targetUserId: 'u2', targetSponsorId: null, requester: { sponsorId: 's9' } }); return r?.sponsorId === 's9' && r?.userId === 'u2' && r?.repId === 'rep' })())
  check('resolveParties non-sponsor → null', E.resolveParties({ requesterId: 'u1', targetUserId: 'u2', targetSponsorId: null }) === null)
  check('loadBalancePreferred picks fewest', E.loadBalancePreferred([{ userId: 'a', confirmedCount: 5 }, { userId: 'b', confirmedCount: 2 }]) === 'b')
  check('totalRoomCapacity = sum', E.totalRoomCapacity === E.MEETING_ROOMS.reduce((s, r) => s + r.capacity, 0))
}

// ── Integration with fixtures ───────────────────────────────────────────────
const created = { users: [], requests: [], meetings: [], blackouts: [] }
async function cleanup() {
  for (const id of created.blackouts) await prisma.blackoutTime.delete({ where: { id } }).catch(() => {})
  for (const id of created.meetings) await prisma.sponsorMeeting.delete({ where: { id } }).catch(() => {})
  for (const id of created.requests) await prisma.meetingRequest.delete({ where: { id } }).catch(() => {})
  for (const id of created.users) await prisma.user.delete({ where: { id } }).catch(() => {})
}

async function main() {
  unitTests()

  console.log('\nIntegration — engine lifecycle')
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const sponsor = await prisma.sponsor.findFirst({ where: { conferenceId: confId }, select: { id: true, solutionsSeeking: true } })
  const blocks = await prisma.timeBlock.findMany({ where: { conferenceId: confId }, orderBy: { startsAt: 'asc' }, take: 3, select: { id: true, startsAt: true, endsAt: true } })
  if (!sponsor || blocks.length < 2) { console.error('  ✗ insufficient seed data (need a sponsor + 2 time blocks)'); return }
  const [slot1, slot2] = blocks
  const sponsorSeeking = E.parseSolutions(sponsor.solutionsSeeking)

  // Baseline directory unscheduled count (before fixtures) — for the M3 check.
  const baseDir = await E.getCompanyDirectory(prisma, confId)
  const baseUnscheduled = baseDir.find(d => d.id === sponsor.id)?.unscheduled ?? 0

  // Fixture attendees: A matches the sponsor's seeking (high interest), B does not.
  const stamp = Date.now()
  const userA = await prisma.user.create({ data: { email: `test-engine-a-${stamp}@example.com`, name: 'Engine Test A', role: 'ATTENDEE', solutionsOffering: JSON.stringify(sponsorSeeking.length ? sponsorSeeking : ['__none__']) } })
  const userB = await prisma.user.create({ data: { email: `test-engine-b-${stamp}@example.com`, name: 'Engine Test B', role: 'ATTENDEE', solutionsOffering: JSON.stringify([]) } })
  created.users.push(userA.id, userB.id)
  const reqA = await prisma.meetingRequest.create({ data: { requesterId: userA.id, targetSponsorId: sponsor.id, status: 'APPROVED' } })
  const reqB = await prisma.meetingRequest.create({ data: { requesterId: userB.id, targetSponsorId: sponsor.id, status: 'APPROVED' } })
  created.requests.push(reqA.id, reqB.id)

  // Directory + matrix reflect the new bank items.
  const dir = await E.getCompanyDirectory(prisma, confId)
  const dirRow = dir.find(d => d.id === sponsor.id)
  check('directory includes sponsor row', !!dirRow)
  check('directory unscheduled ≥ 2 (A+B in bank)', dirRow.unscheduled >= 2, `got ${dirRow?.unscheduled}`)

  let mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  const bankA = mx.bank.find(b => b.requestId === reqA.id)
  const bankB = mx.bank.find(b => b.requestId === reqB.id)
  check('bank contains both fixtures', !!bankA && !!bankB)
  check('bank items carry rank/total', bankA.total >= 2 && bankA.rank >= 1)
  if (sponsorSeeking.length) check('A (matching) ranks ahead of B', bankA.rank < bankB.rank, `A#${bankA?.rank} vs B#${bankB?.rank}`)
  check('confirmedCount starts at 0', bankA.confirmedCount === 0 && bankB.confirmedCount === 0)

  // Availability for A includes slot1 with a free room.
  const availA = await E.getCandidateAvailability(prisma, reqA.id, confId)
  const slot1Avail = availA.days.flatMap(d => d.slots).find(s => s.timeBlockId === slot1.id)
  check('availability: slot1 free for A', slot1Avail?.available === true)
  check('availability: rooms enumerated', slot1Avail?.rooms.length === E.MEETING_ROOMS.length)

  // Assign A → Table 1 @ slot1.
  const mA = await E.assignMeeting(prisma, { requestId: reqA.id, timeBlockId: slot1.id, room: 'Table 1' })
  created.meetings.push(mA.id)
  check('assign A created a CONFIRMED meeting', mA.status === 'CONFIRMED' && mA.location === 'Table 1')
  const reqAafter = await prisma.meetingRequest.findUnique({ where: { id: reqA.id }, select: { status: true, timeBlockId: true } })
  check('assign A confirmed the request', reqAafter.status === 'CONFIRMED' && reqAafter.timeBlockId === slot1.id)

  mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  check('A left the bank after assign', !mx.bank.find(b => b.requestId === reqA.id))
  const slot1Row = mx.days.flatMap(d => d.slots).find(s => s.timeBlockId === slot1.id)
  check('slot1 now shows A', !!slot1Row.meetings.find(m => m.userId === userA.id && m.room === 'Table 1'))

  // Conflict paths.
  await expectThrow('re-assign the same CONFIRMED request → BAD_STATUS', 'BAD_STATUS', () => E.assignMeeting(prisma, { requestId: reqA.id, timeBlockId: slot2.id, room: 'Table 2' }))
  // A second APPROVED request for the same pair must be blocked once A is booked.
  const reqA2 = await prisma.meetingRequest.create({ data: { requesterId: userA.id, targetSponsorId: sponsor.id, status: 'APPROVED' } })
  created.requests.push(reqA2.id)
  await expectThrow('assign 2nd request for booked pair → ALREADY_SCHEDULED', 'ALREADY_SCHEDULED', () => E.assignMeeting(prisma, { requestId: reqA2.id, timeBlockId: slot2.id, room: 'Table 3' }))

  // M3: A is booked, B still APPROVED, reqA2 APPROVED for A's (booked) pair.
  // Directory unscheduled must count only B — not reqA2's already-booked pair.
  const dirDup = await E.getCompanyDirectory(prisma, confId)
  const rowDup = dirDup.find(d => d.id === sponsor.id)
  check('directory unscheduled excludes an already-booked pair (M3)', rowDup.unscheduled === baseUnscheduled + 1, `expected ${baseUnscheduled + 1}, got ${rowDup?.unscheduled}`)

  await expectThrow('assign B to Table 1 @slot1 → ROOM_CONFLICT', 'ROOM_CONFLICT', () => E.assignMeeting(prisma, { requestId: reqB.id, timeBlockId: slot1.id, room: 'Table 1' }))
  await expectThrow('assign with bogus room → UNKNOWN_ROOM', 'UNKNOWN_ROOM', () => E.assignMeeting(prisma, { requestId: reqB.id, timeBlockId: slot1.id, room: 'Table 999' }))

  // Assign B to a different table in the same slot (allowed — separate table).
  const mB = await E.assignMeeting(prisma, { requestId: reqB.id, timeBlockId: slot1.id, room: 'Table 2' })
  created.meetings.push(mB.id)
  check('assign B to Table 2 @slot1 ok', mB.status === 'CONFIRMED')

  // Blackout for B over slot2 → candidate busy on reschedule.
  const bo = await prisma.blackoutTime.create({ data: { userId: userB.id, startsAt: slot2.startsAt, endsAt: slot2.endsAt, reason: 'engine-test' } })
  created.blackouts.push(bo.id)
  const availBReschedule = await E.getMeetingRescheduleAvailability(prisma, mB.id, confId)
  const b_slot2 = availBReschedule.days.flatMap(d => d.slots).find(s => s.timeBlockId === slot2.id)
  check('blackout makes slot2 unavailable for B', b_slot2?.available === false && b_slot2?.candidateFree === false)
  await expectThrow('reschedule B into blackout → CANDIDATE_BUSY', 'CANDIDATE_BUSY', () => E.rescheduleMeeting(prisma, { sponsorMeetingId: mB.id, timeBlockId: slot2.id, room: 'Table 1' }))

  // Reschedule A to slot2 / Table 1 (A is free there).
  const mAmoved = await E.rescheduleMeeting(prisma, { sponsorMeetingId: mA.id, timeBlockId: slot2.id, room: 'Table 1' })
  check('reschedule A moved the meeting', mAmoved.timeBlockId === slot2.id && mAmoved.location === 'Table 1')
  const reqAmoved = await prisma.meetingRequest.findUnique({ where: { id: reqA.id }, select: { timeBlockId: true } })
  check('reschedule synced the request timeBlock', reqAmoved.timeBlockId === slot2.id)

  // Cancel A with preserve → request back to the bank.
  const cancelA = await E.cancelMeeting(prisma, { sponsorMeetingId: mA.id, preserveRequest: true, reason: 'Scheduling conflict', notes: 'engine-test' })
  check('cancel(preserve) marks meeting CANCELLED', cancelA.meeting.status === 'CANCELLED' && cancelA.meeting.reason === 'Scheduling conflict')
  const reqAcancel = await prisma.meetingRequest.findUnique({ where: { id: reqA.id }, select: { status: true, timeBlockId: true } })
  check('cancel(preserve) returns request to APPROVED (bank)', reqAcancel.status === 'APPROVED' && reqAcancel.timeBlockId === null)
  mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  check('A reappears in the bank', !!mx.bank.find(b => b.requestId === reqA.id))
  // H1: cancelling an already-CANCELLED meeting must be rejected (no desync).
  await expectThrow('double-cancel A → BAD_STATUS', 'BAD_STATUS', () => E.cancelMeeting(prisma, { sponsorMeetingId: mA.id, preserveRequest: true }))

  // Cancel B without preserve → request removed entirely.
  const cancelB = await E.cancelMeeting(prisma, { sponsorMeetingId: mB.id, preserveRequest: false, reason: 'Company request' })
  check('cancel(remove) marks meeting CANCELLED', cancelB.meeting.status === 'CANCELLED')
  const reqBcancel = await prisma.meetingRequest.findUnique({ where: { id: reqB.id }, select: { status: true } })
  check('cancel(remove) sets request CANCELLED', reqBcancel.status === 'CANCELLED')
  mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  check('B does NOT reappear in the bank', !mx.bank.find(b => b.requestId === reqB.id))
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
