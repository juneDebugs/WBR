#!/usr/bin/env node
// Engine test for the on-site floor check-in board
// (packages/db/src/meeting-engine.ts — getCheckInBoard / setMeetingCheckIn).
//
// Runs the real engine functions against the live DB (Turso when creds are in
// apps/*/.env.local, else local dev.db). Creates a fully throwaway world — an
// INACTIVE fixture conference with its own sponsors, users, time blocks and
// confirmed SponsorMeetings (ids prefixed 'chk-test-') — and passes
// conferenceId explicitly to every getCheckInBoard call, so the real active
// conference is never touched. Exercises board structure (day/slot ordering,
// empty-slot omission, alphabetical meeting order), totals math, arrival
// toggles (set + clear), note trimming/independence, and the typed
// MEETING_NOT_FOUND / BAD_STATUS errors. Deletes every fixture row in finally.
//
//   node scripts/test-checkin.mjs
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
const PREFIX = 'chk-test-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`

async function cleanup() {
  // Children first; Conference delete cascades TimeBlocks + Sponsors.
  await prisma.sponsorMeeting.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.conference.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
}

async function main() {
  console.log('\nFixtures — isolated inactive conference')
  const conf = await prisma.conference.create({ data: {
    id: fid('conf'), name: 'Check-In Test Conf', active: false,
    startDate: new Date('2032-04-05T00:00:00Z'), endDate: new Date('2032-04-06T23:59:59Z'),
  } })
  const confId = conf.id
  // Sponsor names deliberately out of creation order to prove alphabetical sorting.
  // Two distinct sponsor rows share the 'Zebra Corp' display name so one slot can
  // exercise the attendee-name tie-break WITHOUT any single sponsor holding two
  // meetings in the same block (slots are exclusive: one meeting per sponsor per block).
  const zebra = await prisma.sponsor.create({ data: {
    id: fid('sponsor-z'), conferenceId: confId, name: 'chk-test Zebra Corp', tier: 'GOLD',
  } })
  const zebra2 = await prisma.sponsor.create({ data: {
    id: fid('sponsor-z2'), conferenceId: confId, name: 'chk-test Zebra Corp', tier: 'GOLD',
  } })
  const alpha = await prisma.sponsor.create({ data: {
    id: fid('sponsor-a'), conferenceId: confId, name: 'chk-test Alpha Inc', tier: 'SILVER',
  } })
  const amy = await prisma.user.create({ data: {
    id: fid('user-amy'), email: `${PREFIX}amy-${stamp}@example.com`, name: 'chk-test Amy Attendee', role: 'ATTENDEE',
  } })
  const bob = await prisma.user.create({ data: {
    id: fid('user-bob'), email: `${PREFIX}bob-${stamp}@example.com`, name: 'chk-test Bob Buyer', role: 'ATTENDEE',
  } })
  const cara = await prisma.user.create({ data: {
    id: fid('user-cara'), email: `${PREFIX}cara-${stamp}@example.com`, name: 'chk-test Cara Client', role: 'ATTENDEE',
  } })
  // Day 1: tb1 (meetings), tbEmpty (only a CANCELLED meeting → must be omitted),
  // tb1b (meeting, later slot → proves chronological slot order). Day 2: tb2.
  const tb1 = await prisma.timeBlock.create({ data: { id: fid('tb-1'), conferenceId: confId, startsAt: new Date('2032-04-05T14:00:00Z'), endsAt: new Date('2032-04-05T14:30:00Z') } })
  const tbEmpty = await prisma.timeBlock.create({ data: { id: fid('tb-empty'), conferenceId: confId, startsAt: new Date('2032-04-05T15:00:00Z'), endsAt: new Date('2032-04-05T15:30:00Z') } })
  const tb1b = await prisma.timeBlock.create({ data: { id: fid('tb-1b'), conferenceId: confId, startsAt: new Date('2032-04-05T16:00:00Z'), endsAt: new Date('2032-04-05T16:30:00Z') } })
  const tb2 = await prisma.timeBlock.create({ data: { id: fid('tb-2'), conferenceId: confId, startsAt: new Date('2032-04-06T14:00:00Z'), endsAt: new Date('2032-04-06T14:30:00Z') } })
  // tb1 holds three CONFIRMED meetings covering both sort keys — three DISTINCT
  // sponsors (two sharing the Zebra name), so the exclusive-slot invariant holds:
  //   Alpha/Bob → Zebra/Amy → Zebra/Cara  (sponsorName, then attendeeName)
  const mAlphaBob = await prisma.sponsorMeeting.create({ data: { id: fid('m-alpha-bob'), sponsorId: alpha.id, userId: bob.id, timeBlockId: tb1.id, status: 'CONFIRMED', location: 'Table 1' } })
  const mZebraCara = await prisma.sponsorMeeting.create({ data: { id: fid('m-zebra-cara'), sponsorId: zebra2.id, userId: cara.id, timeBlockId: tb1.id, status: 'CONFIRMED', location: 'Table 2' } })
  const mZebraAmy = await prisma.sponsorMeeting.create({ data: { id: fid('m-zebra-amy'), sponsorId: zebra.id, userId: amy.id, timeBlockId: tb1.id, status: 'CONFIRMED', location: 'Table 3' } })
  const mDay1Late = await prisma.sponsorMeeting.create({ data: { id: fid('m-late'), sponsorId: alpha.id, userId: cara.id, timeBlockId: tb1b.id, status: 'CONFIRMED', location: 'Table 1' } })
  const mDay2 = await prisma.sponsorMeeting.create({ data: { id: fid('m-day2'), sponsorId: zebra.id, userId: bob.id, timeBlockId: tb2.id, status: 'CONFIRMED', location: 'Table 1' } })
  const mCancelled = await prisma.sponsorMeeting.create({ data: { id: fid('m-cancelled'), sponsorId: alpha.id, userId: amy.id, timeBlockId: tbEmpty.id, status: 'CANCELLED', reason: 'chk-test' } })
  console.log(`  created conference ${confId} (3 sponsors, 3 users, 4 blocks, 5 confirmed + 1 cancelled meetings)`)

  console.log('\nBoard structure')
  let board = await E.getCheckInBoard(prisma, confId)
  check('2 days, chronological (day 1 before day 2)',
    board.days.length === 2 && board.days[0].dayKey === '2032-04-05' && board.days[1].dayKey === '2032-04-06',
    `days=${board.days.map(d => d.dayKey).join(',')}`)
  const day1 = board.days[0], day2 = board.days[1]
  check('day 1 has 2 slots — the meetingless block is omitted',
    day1?.slots.length === 2 && !day1.slots.some(s => s.timeBlockId === tbEmpty.id),
    `slots=${day1?.slots.map(s => s.timeBlockId).join(',')}`)
  check('day 1 slots are chronological (tb1 then tb1b)',
    day1?.slots[0]?.timeBlockId === tb1.id && day1?.slots[1]?.timeBlockId === tb1b.id)
  check('day 2 has 1 slot (tb2)', day2?.slots.length === 1 && day2.slots[0].timeBlockId === tb2.id)
  const slot1 = day1?.slots[0]
  check('slot tb1 meetings alphabetical by sponsor then attendee (Alpha/Bob, Zebra/Amy, Zebra/Cara)',
    slot1?.meetings.length === 3 &&
    slot1.meetings[0].sponsorMeetingId === mAlphaBob.id &&
    slot1.meetings[1].sponsorMeetingId === mZebraAmy.id &&
    slot1.meetings[2].sponsorMeetingId === mZebraCara.id,
    `order=${slot1?.meetings.map(m => m.sponsorMeetingId.replace(PREFIX, '')).join(',')}`)
  const allIds = board.days.flatMap(d => d.slots).flatMap(s => s.meetings).map(m => m.sponsorMeetingId)
  check('cancelled meeting never appears on the board', !allIds.includes(mCancelled.id))
  check('board carries all 5 confirmed meetings', allIds.length === 5 &&
    [mAlphaBob.id, mZebraAmy.id, mZebraCara.id, mDay1Late.id, mDay2.id].every(id => allIds.includes(id)))

  console.log('\nInitial totals')
  const t0 = board.totals
  check('totals: meetings=5, arrivals all zero, awaiting=meetings',
    t0.meetings === 5 && t0.completed === 0 && t0.sponsorArrived === 0 && t0.buyerArrived === 0 && t0.awaiting === 5,
    JSON.stringify(t0))
  check('day totals: day1 meetings=4, day2 meetings=1, both fully awaiting',
    day1?.totals.meetings === 4 && day1.totals.awaiting === 4 && day2?.totals.meetings === 1 && day2.totals.awaiting === 1)
  check('slot completed counters start at 0', board.days.flatMap(d => d.slots).every(s => s.completed === 0))

  console.log('\nArrival toggles')
  const before = Date.now()
  const r1 = await E.setMeetingCheckIn(prisma, { sponsorMeetingId: mAlphaBob.id, sponsorArrived: true })
  const ts1 = Date.parse(r1.sponsorArrivedAt ?? '')
  check('sponsorArrived:true sets an ISO timestamp (recent), buyer untouched',
    typeof r1.sponsorArrivedAt === 'string' && Number.isFinite(ts1) && ts1 >= before - 60_000 && ts1 <= Date.now() + 60_000 && r1.buyerArrivedAt === null,
    JSON.stringify(r1))
  board = await E.getCheckInBoard(prisma, confId)
  check('totals after sponsor tick: sponsorArrived=1, awaiting=4, completed=0',
    board.totals.sponsorArrived === 1 && board.totals.awaiting === 4 && board.totals.completed === 0 && board.totals.buyerArrived === 0,
    JSON.stringify(board.totals))
  const r2 = await E.setMeetingCheckIn(prisma, { sponsorMeetingId: mAlphaBob.id, buyerArrived: true })
  check('buyerArrived:true on same meeting sets buyer timestamp, keeps sponsor timestamp',
    typeof r2.buyerArrivedAt === 'string' && r2.sponsorArrivedAt === r1.sponsorArrivedAt, JSON.stringify(r2))
  board = await E.getCheckInBoard(prisma, confId)
  check('totals after both ticks: completed=1, sponsorArrived=1, buyerArrived=1, awaiting=4',
    board.totals.completed === 1 && board.totals.sponsorArrived === 1 && board.totals.buyerArrived === 1 && board.totals.awaiting === 4,
    JSON.stringify(board.totals))
  const slot1After = board.days[0]?.slots.find(s => s.timeBlockId === tb1.id)
  check('slot tb1 completed=1 and day 1 totals.completed=1',
    slot1After?.completed === 1 && board.days[0]?.totals.completed === 1)

  console.log('\nUn-tick clears the timestamp')
  const r3 = await E.setMeetingCheckIn(prisma, { sponsorMeetingId: mAlphaBob.id, sponsorArrived: false })
  check('sponsorArrived:false clears sponsor timestamp, buyer stays set',
    r3.sponsorArrivedAt === null && r3.buyerArrivedAt === r2.buyerArrivedAt, JSON.stringify(r3))
  board = await E.getCheckInBoard(prisma, confId)
  check('totals after un-tick: completed=0, buyerArrived=1, sponsorArrived=0, awaiting still 4 (half-arrived is not awaiting)',
    board.totals.completed === 0 && board.totals.buyerArrived === 1 && board.totals.sponsorArrived === 0 && board.totals.awaiting === 4,
    JSON.stringify(board.totals))

  console.log('\nNotes')
  const n1 = await E.setMeetingCheckIn(prisma, { sponsorMeetingId: mAlphaBob.id, notes: '  meet at booth 12  ' })
  check('notes are trimmed on save', n1.notes === 'meet at booth 12', JSON.stringify(n1.notes))
  check('notes update leaves arrival flags untouched',
    n1.sponsorArrivedAt === null && n1.buyerArrivedAt === r2.buyerArrivedAt)
  const n2 = await E.setMeetingCheckIn(prisma, { sponsorMeetingId: mAlphaBob.id, sponsorArrived: true })
  check('arrival tick leaves notes untouched', n2.notes === 'meet at booth 12', JSON.stringify(n2.notes))
  const n3 = await E.setMeetingCheckIn(prisma, { sponsorMeetingId: mAlphaBob.id, notes: '   ' })
  check("whitespace-only notes ('   ') store as null", n3.notes === null, JSON.stringify(n3.notes))
  board = await E.getCheckInBoard(prisma, confId)
  const rowAfter = board.days.flatMap(d => d.slots).flatMap(s => s.meetings).find(m => m.sponsorMeetingId === mAlphaBob.id)
  check('board reflects final state (sponsor+buyer arrived, notes null)',
    !!rowAfter?.sponsorArrivedAt && !!rowAfter?.buyerArrivedAt && rowAfter?.notes === null)

  console.log('\nErrors')
  await expectThrow('unknown meeting id → MEETING_NOT_FOUND', 'MEETING_NOT_FOUND',
    () => E.setMeetingCheckIn(prisma, { sponsorMeetingId: `${PREFIX}bogus-${stamp}`, sponsorArrived: true }))
  await expectThrow('check-in on a CANCELLED meeting → BAD_STATUS', 'BAD_STATUS',
    () => E.setMeetingCheckIn(prisma, { sponsorMeetingId: mCancelled.id, sponsorArrived: true }))
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
