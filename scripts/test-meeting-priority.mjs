#!/usr/bin/env node
// Engine test for PRIORITY-based auto-scheduling (packages/db/src/meeting-engine.ts).
//
// Exercises autoScheduleByPriority + the priority helpers against the live DB
// (Turso when creds are in apps/*/.env.local, else local dev.db). Creates its own
// throwaway fixtures (attendees + APPROVED requests tagged Best Fit / Med / Low),
// asserts that the engine fills the highest tier first, honors blackout
// constraints, and enforces EXCLUSIVE slots — each candidate lands in the first
// time block that is OPEN for the sponsor and free for the attendee, one
// meeting per sponsor per block, never a double booking (including under a
// simulated concurrent write race) — then deletes every fixture row.
//
//   node scripts/test-meeting-priority.mjs
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

// ── Pure-function unit tests (no DB) ────────────────────────────────────────
function unitTests() {
  console.log('Unit — priority helpers')
  check('MEETING_PRIORITIES order', JSON.stringify(E.MEETING_PRIORITIES) === JSON.stringify(['BEST_FIT', 'MED', 'LOW']))
  check('normalizePriority passes valid', E.normalizePriority('BEST_FIT') === 'BEST_FIT' && E.normalizePriority('LOW') === 'LOW')
  check('normalizePriority defaults junk → MED', E.normalizePriority(null) === 'MED' && E.normalizePriority('xyz') === 'MED')
  check('priorityRank ordering BEST_FIT<MED<LOW', E.priorityRank('BEST_FIT') < E.priorityRank('MED') && E.priorityRank('MED') < E.priorityRank('LOW'))
  check('priorityLabel maps', E.priorityLabel('BEST_FIT') === 'Best Fit' && E.priorityLabel('MED') === 'Med' && E.priorityLabel('LOW') === 'Low')
}

// ── Integration with fixtures ───────────────────────────────────────────────
const created = { users: [], requests: [], blackouts: [], sponsors: [] }
async function cleanup() {
  for (const id of created.blackouts) await prisma.blackoutTime.delete({ where: { id } }).catch(() => {})
  if (created.users.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {})
  }
  for (const id of created.requests) await prisma.meetingRequest.delete({ where: { id } }).catch(() => {})
  for (const id of created.users) await prisma.user.delete({ where: { id } }).catch(() => {})
  // Deleting the throwaway sponsor cascades any residual SponsorMeeting rows.
  for (const id of created.sponsors) await prisma.sponsor.delete({ where: { id } }).catch(() => {})
}

async function main() {
  unitTests()

  console.log('\nIntegration — priority auto-scheduler')
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const blocks = await prisma.timeBlock.findMany({ where: { conferenceId: confId }, orderBy: { startsAt: 'asc' }, take: 6, select: { id: true, startsAt: true, endsAt: true } })
  if (blocks.length < 4) { console.error('  ✗ insufficient seed data (need ≥4 time blocks)'); return }
  const [slot1, slot2, slot3] = blocks

  const stamp = Date.now()
  // Isolated throwaway sponsor so the batch scheduler only ever touches OUR
  // fixtures — never real seed requests targeting a real company.
  const skills = ['Analytics & Reporting', 'Subscription Management']
  const sponsor = await prisma.sponsor.create({
    data: { conferenceId: confId, name: `Prio Test Co ${stamp}`, tier: 'GOLD', solutionsSeeking: JSON.stringify(skills) },
  })
  created.sponsors.push(sponsor.id)
  const offering = JSON.stringify(skills)
  // Three attendees. Requests are CREATED oldest→newest as LOW, MED, BEST_FIT so
  // that if the engine sorted by createdAt (not priority) LOW would win — proving
  // priority dominates ordering.
  const uLow = await prisma.user.create({ data: { email: `test-prio-low-${stamp}@example.com`, name: 'Prio Low', role: 'ATTENDEE', solutionsOffering: offering } })
  const uMed = await prisma.user.create({ data: { email: `test-prio-med-${stamp}@example.com`, name: 'Prio Med', role: 'ATTENDEE', solutionsOffering: offering } })
  const uBest = await prisma.user.create({ data: { email: `test-prio-best-${stamp}@example.com`, name: 'Prio Best', role: 'ATTENDEE', solutionsOffering: offering } })
  created.users.push(uLow.id, uMed.id, uBest.id)
  const rLow = await prisma.meetingRequest.create({ data: { requesterId: uLow.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'LOW' } })
  const rMed = await prisma.meetingRequest.create({ data: { requesterId: uMed.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'MED' } })
  const rBest = await prisma.meetingRequest.create({ data: { requesterId: uBest.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'BEST_FIT' } })
  created.requests.push(rLow.id, rMed.id, rBest.id)

  // Matrix should surface the priority on bank items and rank Best Fit #1.
  const mx = await E.getSponsorScheduleMatrix(prisma, sponsor.id, confId)
  const mxBest = mx.bank.find(b => b.requestId === rBest.id)
  const mxLow = mx.bank.find(b => b.requestId === rLow.id)
  check('matrix bank carries priority field', mxBest?.priority === 'BEST_FIT' && mxLow?.priority === 'LOW')
  check('Best Fit ranks ahead of Low in the bank', mxBest && mxLow && mxBest.rank < mxLow.rank, `best#${mxBest?.rank} low#${mxLow?.rank}`)

  // ── Dry run: plan without writing ──
  const meetingsBefore = await prisma.sponsorMeeting.count({ where: { userId: { in: created.users } } })
  const dry = await E.autoScheduleByPriority(prisma, { sponsorId: sponsor.id, conferenceId: confId, dryRun: true })
  check('dryRun flag echoed', dry.dryRun === true)
  const dryOurs = dry.scheduled.filter(s => created.users.includes(s.userId))
  check('dryRun plans all three fixtures', dryOurs.length === 3, `got ${dryOurs.length}`)
  // The three fixtures must appear in priority order within the plan.
  const idx = p => dryOurs.findIndex(s => s.priority === p)
  check('plan order Best Fit → Med → Low', idx('BEST_FIT') === 0 && idx('MED') === 1 && idx('LOW') === 2,
    `order=${dryOurs.map(s => s.priority).join(',')}`)
  check('byTier reports one scheduled per tier (≥ our fixtures)',
    dry.byTier.every(t => t.scheduled >= 1),
    JSON.stringify(dry.byTier))
  const meetingsAfterDry = await prisma.sponsorMeeting.count({ where: { userId: { in: created.users } } })
  check('dryRun wrote NOTHING', meetingsAfterDry === meetingsBefore, `before=${meetingsBefore} after=${meetingsAfterDry}`)
  const stillApproved = await prisma.meetingRequest.findMany({ where: { id: { in: created.requests } }, select: { status: true } })
  check('dryRun left requests APPROVED', stillApproved.every(r => r.status === 'APPROVED'))

  // ── Real run: persists ──
  const real = await E.autoScheduleByPriority(prisma, { sponsorId: sponsor.id, conferenceId: confId })
  const realOurs = real.scheduled.filter(s => created.users.includes(s.userId))
  check('real run scheduled all three', realOurs.length === 3, `got ${realOurs.length}`)
  const bestEntry = realOurs.find(s => s.userId === uBest.id)
  const medEntry = realOurs.find(s => s.userId === uMed.id)
  const lowEntry = realOurs.find(s => s.userId === uLow.id)
  // Greedy fill under EXCLUSIVE slots: Best Fit takes the earliest OPEN block,
  // then each next candidate takes the next open block — one meeting per
  // sponsor per block, so the three fixtures spread across slots 1/2/3.
  check('Best Fit placed in earliest time block', bestEntry?.timeBlockId === slot1.id, `tb=${bestEntry?.timeBlockId}`)
  check('Med pushed to the NEXT open block (slot2)', medEntry?.timeBlockId === slot2.id, `tb=${medEntry?.timeBlockId}`)
  check('Low pushed to the next open block after that (slot3)', lowEntry?.timeBlockId === slot3.id, `tb=${lowEntry?.timeBlockId}`)
  check('room label assigned (Table 1)', bestEntry?.room === 'Table 1', `room=${bestEntry?.room}`)
  const mtgRows = await prisma.sponsorMeeting.findMany({ where: { userId: { in: created.users }, status: 'CONFIRMED' }, select: { userId: true, location: true } })
  check('three CONFIRMED SponsorMeetings persisted', mtgRows.length === 3, `got ${mtgRows.length}`)
  const confirmedReqs = await prisma.meetingRequest.findMany({ where: { id: { in: created.requests } }, select: { status: true, timeBlockId: true } })
  check('requests flipped to CONFIRMED with a time block', confirmedReqs.every(r => r.status === 'CONFIRMED' && r.timeBlockId), JSON.stringify(confirmedReqs.map(r => r.status)))

  // ── Dedup: a duplicate APPROVED request for an already-scheduled pair is skipped ──
  const rDup = await prisma.meetingRequest.create({ data: { requesterId: uBest.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'BEST_FIT' } })
  created.requests.push(rDup.id)
  const dedup = await E.autoScheduleByPriority(prisma, { sponsorId: sponsor.id, conferenceId: confId })
  check('duplicate pair is NOT re-scheduled', !dedup.scheduled.find(s => s.requestId === rDup.id))
  check('duplicate pair reported as skipped', !!dedup.skipped.find(s => s.requestId === rDup.id), JSON.stringify(dedup.skipped.map(s => s.reason)))
  const bestMtgCount = await prisma.sponsorMeeting.count({ where: { userId: uBest.id, status: 'CONFIRMED' } })
  check('still exactly one meeting for the Best Fit pair', bestMtgCount === 1, `got ${bestMtgCount}`)

  // ── Constraint: a blackout pushes a candidate to a later block ──
  const uBO = await prisma.user.create({ data: { email: `test-prio-bo-${stamp}@example.com`, name: 'Prio Blackout', role: 'ATTENDEE', solutionsOffering: offering } })
  created.users.push(uBO.id)
  const rBO = await prisma.meetingRequest.create({ data: { requesterId: uBO.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'BEST_FIT' } })
  created.requests.push(rBO.id)
  const bo = await prisma.blackoutTime.create({ data: { userId: uBO.id, startsAt: slot1.startsAt, endsAt: slot1.endsAt, reason: 'prio-test' } })
  created.blackouts.push(bo.id)
  const boRun = await E.autoScheduleByPriority(prisma, { sponsorId: sponsor.id, conferenceId: confId })
  const boEntry = boRun.scheduled.find(s => s.userId === uBO.id)
  check('blackout candidate still scheduled', !!boEntry)
  check('blackout candidate pushed off slot1 to a later block', boEntry && boEntry.timeBlockId !== slot1.id, `tb=${boEntry?.timeBlockId}`)

  // ── No double booking: attendee already meeting ANOTHER sponsor in slot1 ──
  // Mirrors the Companies-tab button exactly: statuses ['APPROVED'],
  // priorities MED+LOW (REQUEST_BOARD_PRIORITIES).
  console.log('\nNo double booking — cross-sponsor conflicts')
  const other = await prisma.sponsor.create({
    data: { conferenceId: confId, name: `Prio Other Co ${stamp}`, tier: 'SILVER' },
  })
  created.sponsors.push(other.id)
  const uX = await prisma.user.create({ data: { email: `test-prio-x-${stamp}@example.com`, name: 'Prio Cross', role: 'ATTENDEE', solutionsOffering: offering } })
  created.users.push(uX.id)
  await prisma.sponsorMeeting.create({
    data: { sponsorId: other.id, userId: uX.id, timeBlockId: slot1.id, location: 'Table 1', status: 'CONFIRMED' },
  })
  const rX = await prisma.meetingRequest.create({ data: { requesterId: uX.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'MED' } })
  created.requests.push(rX.id)
  const xRun = await E.autoScheduleByPriority(prisma, {
    sponsorId: sponsor.id, conferenceId: confId, statuses: ['APPROVED'], priorities: ['MED', 'LOW'],
  })
  const xEntry = xRun.scheduled.find(s => s.userId === uX.id)
  check('busy attendee still scheduled', !!xEntry)
  check('…but NOT in slot1 (already meeting another sponsor there)', xEntry && xEntry.timeBlockId !== slot1.id, `tb=${xEntry?.timeBlockId}`)
  const xSlot1Count = await prisma.sponsorMeeting.count({ where: { userId: uX.id, timeBlockId: slot1.id, status: 'CONFIRMED' } })
  check('attendee has exactly ONE meeting in slot1', xSlot1Count === 1, `got ${xSlot1Count}`)

  // Slot exclusivity: across everything scheduled so far, the fixture sponsor
  // never holds two confirmed meetings in the same time block, and no attendee
  // holds two confirmed meetings in the same block.
  const allMtgs = await prisma.sponsorMeeting.findMany({
    where: { sponsorId: sponsor.id, status: 'CONFIRMED' },
    select: { userId: true, timeBlockId: true },
  })
  const blockSeen = new Set(); let blockClash = false
  for (const m of allMtgs) {
    if (blockSeen.has(m.timeBlockId)) blockClash = true
    blockSeen.add(m.timeBlockId)
  }
  check('sponsor never has two meetings in one block (exclusive slots)', !blockClash)
  const userSeen = new Set(); let userClash = false
  const userMtgs = await prisma.sponsorMeeting.findMany({
    where: { userId: { in: created.users }, status: 'CONFIRMED' },
    select: { userId: true, timeBlockId: true },
  })
  for (const m of userMtgs) {
    const k = `${m.userId}::${m.timeBlockId}`
    if (userSeen.has(k)) userClash = true
    userSeen.add(k)
  }
  check('no attendee double-booked in any block', !userClash)

  // ── No double booking under a WRITE RACE ──
  // Wrap prisma so that right after the engine takes its read snapshot
  // (the first sponsorMeeting.findMany), a competing booking lands in the slot
  // the plan is about to claim. Commit-time revalidation must drop the
  // placement to `skipped` instead of writing a double booking.
  console.log('\nNo double booking — concurrent write race')
  const uY = await prisma.user.create({ data: { email: `test-prio-y-${stamp}@example.com`, name: 'Prio Race', role: 'ATTENDEE', solutionsOffering: offering } })
  created.users.push(uY.id)
  const rY = await prisma.meetingRequest.create({ data: { requesterId: uY.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'MED' } })
  created.requests.push(rY.id)
  let injected = false
  const racy = new Proxy(prisma, {
    get(t, prop) {
      if (prop === 'sponsorMeeting') {
        return new Proxy(t.sponsorMeeting, {
          get(mt, mprop) {
            if (mprop === 'findMany') {
              return async (args) => {
                const rows = await mt.findMany(args)
                if (!injected) {
                  injected = true
                  // Snapshot read completed — book uY behind the plan's back
                  // in every block, so wherever the plan placed them conflicts.
                  const blocks = await t.timeBlock.findMany({ where: { conferenceId: confId }, select: { id: true } })
                  for (const b of blocks) {
                    await t.sponsorMeeting.create({
                      data: { sponsorId: other.id, userId: uY.id, timeBlockId: b.id, location: 'Table 2', status: 'CONFIRMED' },
                    })
                  }
                }
                return rows
              }
            }
            const v = mt[mprop]
            return typeof v === 'function' ? v.bind(mt) : v
          },
        })
      }
      const v = t[prop]
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  const raceRun = await E.autoScheduleByPriority(racy, {
    sponsorId: sponsor.id, conferenceId: confId, statuses: ['APPROVED'], priorities: ['MED', 'LOW'],
  })
  check('race injection fired', injected)
  const raceSkip = raceRun.skipped.find(s => s.requestId === rY.id)
  check('raced placement dropped to skipped (not written)', !!raceSkip, JSON.stringify(raceRun.scheduled.filter(s => s.userId === uY.id)))
  check('skip reason names the concurrent take', raceSkip?.reason?.includes('taken while scheduling') ?? false, raceSkip?.reason)
  const yWithSponsor = await prisma.sponsorMeeting.count({ where: { userId: uY.id, sponsorId: sponsor.id, status: 'CONFIRMED' } })
  check('no meeting written for the raced pair', yWithSponsor === 0, `got ${yWithSponsor}`)
  const rYRow = await prisma.meetingRequest.findUnique({ where: { id: rY.id }, select: { status: true } })
  check('raced request left APPROVED for the next run', rYRow?.status === 'APPROVED', rYRow?.status)

  // ── findFirstOpenSlot — the sponsor-portal auto-assign helper follows the
  // same exclusive-slot rule as the scheduler ──
  console.log('\nfindFirstOpenSlot — first block open for sponsor AND free for attendee')
  const sponsorF = await prisma.sponsor.create({
    data: { conferenceId: confId, name: `Prio Slot Co ${stamp}`, tier: 'GOLD' },
  })
  created.sponsors.push(sponsorF.id)
  const uF = await prisma.user.create({ data: { email: `test-prio-f-${stamp}@example.com`, name: 'Prio Slot', role: 'ATTENDEE' } })
  created.users.push(uF.id)
  const openSlot = await E.findFirstOpenSlot(prisma, sponsorF.id, uF.id, confId)
  check('empty world → earliest block', openSlot?.timeBlockId === slot1.id, `tb=${openSlot?.timeBlockId}`)
  // Sponsor takes slot1 (with another attendee); attendee busy with another
  // sponsor at slot2 → next open block for BOTH is slot3.
  const uG = await prisma.user.create({ data: { email: `test-prio-g-${stamp}@example.com`, name: 'Prio Slot Blocker', role: 'ATTENDEE' } })
  created.users.push(uG.id)
  const sponsorG = await prisma.sponsor.create({
    data: { conferenceId: confId, name: `Prio Slot Other ${stamp}`, tier: 'SILVER' },
  })
  created.sponsors.push(sponsorG.id)
  await prisma.sponsorMeeting.create({ data: { sponsorId: sponsorF.id, userId: uG.id, timeBlockId: slot1.id, status: 'CONFIRMED' } })
  await prisma.sponsorMeeting.create({ data: { sponsorId: sponsorG.id, userId: uF.id, timeBlockId: slot2.id, status: 'CONFIRMED' } })
  const nextSlot = await E.findFirstOpenSlot(prisma, sponsorF.id, uF.id, confId)
  check('skips sponsor-taken slot1 and attendee-busy slot2 → slot3',
    nextSlot?.timeBlockId === slot3.id, `tb=${nextSlot?.timeBlockId}`)
}

try {
  await main()
} catch (e) {
  failures++
  console.error('  ✗ unexpected error:', e)
} finally {
  await cleanup()
  await prisma.$disconnect?.()
}

console.log(failures ? `\n❌ ${failures} FAILED` : '\n✅ ALL PASSED')
process.exit(failures ? 1 : 0)
