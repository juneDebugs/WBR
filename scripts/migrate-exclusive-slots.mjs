#!/usr/bin/env node
// One-time repair for the EXCLUSIVE time-slot model: one confirmed meeting per
// sponsor per time block, one per attendee per block. Legacy write paths (staff
// queue confirm, sponsor-portal approve, admin sponsor-detail form) created
// SponsorMeeting rows without availability checks, leaving stacked sponsor
// slots and genuinely double-booked attendees in the DB.
//
// For each conflicting meeting (keeping the earliest-created row in place) the
// script re-slots it into the FIRST time block that is open for both the
// sponsor and the attendee (honoring blackouts and peer meetings) and moves the
// linked CONFIRMED MeetingRequest with it. If no open block exists, the meeting
// is cancelled and its request returned to the APPROVED bank so admins can
// rebook it deliberately.
//
// Targets Turso when TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are present (env or
// apps/*/.env.local), else the local packages/db/prisma/dev.db fallback.
//
//   node scripts/migrate-exclusive-slots.mjs            # DRY RUN (default)
//   node scripts/migrate-exclusive-slots.mjs --apply    # write the repair
//   node scripts/migrate-exclusive-slots.mjs --local    # force local dev.db
//
// Idempotent: a second run finds zero conflicts. PII discipline: ids/counts only.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const APPLY = process.argv.includes('--apply')
const FORCE_LOCAL = process.argv.includes('--local')

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
  if (!FORCE_LOCAL && url && token && url.startsWith('libsql://')) {
    const { PrismaLibSQL } = require('@prisma/adapter-libsql')
    const { createClient } = require('@libsql/client')
    console.log('→ DB: Turso')
    return new PrismaClient({ adapter: new PrismaLibSQL(createClient({ url, authToken: token })) })
  }
  console.log('→ DB: local dev.db')
  process.env.DATABASE_URL = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
  return new PrismaClient()
}

const prisma = makePrisma()
const overlaps = (aS, aE, bS, bE) => aS < bE && bS < aE

async function findLinkedRequest(sponsorId, userId) {
  return prisma.meetingRequest.findFirst({
    where: {
      status: 'CONFIRMED',
      OR: [
        { targetSponsorId: sponsorId, requesterId: userId },
        { requester: { sponsorId }, targetUserId: userId },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
}

async function main() {
  console.log(APPLY ? '→ mode: APPLY' : '→ mode: DRY RUN (pass --apply to write)')
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  if (!conf) { console.error('no active conference'); process.exit(1) }
  const blocks = await prisma.timeBlock.findMany({
    where: { conferenceId: conf.id }, orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true, endsAt: true },
  })
  const blockIds = new Set(blocks.map(b => b.id))
  console.log(`→ conference ${conf.id}: ${blocks.length} time blocks`)

  const [meetings, peerMeetings, peerRequestHolds, blackouts] = await Promise.all([
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, sponsorId: true, userId: true, timeBlockId: true, createdAt: true },
    }),
    prisma.meeting.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] } },
      select: { attendeeAId: true, attendeeBId: true, timeBlockId: true },
    }),
    // Confirmed peer-to-peer MeetingRequests carry a block with no Meeting
    // row (the legacy bulk pass wrote them that way) — they still occupy
    // both attendees' calendars.
    prisma.meetingRequest.findMany({
      where: {
        status: 'CONFIRMED', timeBlockId: { not: null },
        targetSponsorId: null, targetUserId: { not: null },
        requester: { sponsorId: null },
      },
      select: { requesterId: true, targetUserId: true, timeBlockId: true },
    }),
    prisma.blackoutTime.findMany({ select: { userId: true, startsAt: true, endsAt: true } }),
  ])
  const inConf = meetings.filter(m => blockIds.has(m.timeBlockId))
  console.log(`→ ${inConf.length} CONFIRMED meetings in this conference`)

  // Occupancy honored while re-slotting. Peer meetings, peer-request holds and
  // blackouts are read-only constraints; sponsor/user occupancy accretes as we
  // accept rows. pairSeen enforces one confirmed meeting per (sponsor, user).
  const sponsorBusy = new Set()  // `${sponsorId}::${block}`
  const userBusy = new Set()     // `${userId}::${block}`
  const pairSeen = new Set()     // `${sponsorId}::${userId}`
  for (const pm of peerMeetings) {
    userBusy.add(`${pm.attendeeAId}::${pm.timeBlockId}`)
    userBusy.add(`${pm.attendeeBId}::${pm.timeBlockId}`)
  }
  for (const pr of peerRequestHolds) {
    userBusy.add(`${pr.requesterId}::${pr.timeBlockId}`)
    userBusy.add(`${pr.targetUserId}::${pr.timeBlockId}`)
  }
  const blackoutByUser = new Map()
  for (const b of blackouts) {
    if (!blackoutByUser.has(b.userId)) blackoutByUser.set(b.userId, [])
    blackoutByUser.get(b.userId).push(b)
  }
  const blockedByBlackout = (userId, block) =>
    (blackoutByUser.get(userId) ?? []).some(b => overlaps(block.startsAt, block.endsAt, b.startsAt, b.endsAt))

  // Pass 1 — greedy accept in createdAt order: the earliest meeting in any
  // contested (sponsor, block), (user, block) or duplicated (sponsor, user)
  // pairing keeps its slot; the rest are conflicts.
  const conflicts = []
  for (const m of inConf) {
    const sk = `${m.sponsorId}::${m.timeBlockId}`
    const uk = `${m.userId}::${m.timeBlockId}`
    const pk = `${m.sponsorId}::${m.userId}`
    if (pairSeen.has(pk) || sponsorBusy.has(sk) || userBusy.has(uk)) { conflicts.push(m); continue }
    sponsorBusy.add(sk)
    userBusy.add(uk)
    pairSeen.add(pk)
  }
  console.log(`→ conflicting meetings to repair: ${conflicts.length}`)

  // Pass 2 — pair duplicates are cancelled outright (the pair keeps its
  // earliest meeting; the linked request stays with that survivor); slot
  // conflicts are re-slotted into the first block open for BOTH sides.
  let moved = 0, cancelled = 0, deduped = 0
  for (const m of conflicts) {
    const pk = `${m.sponsorId}::${m.userId}`
    if (pairSeen.has(pk)) {
      deduped++
      console.log(`  cancel meeting ${m.id}: duplicate meeting for an already-met pair`)
      if (APPLY) {
        await prisma.sponsorMeeting.update({
          where: { id: m.id },
          data: { status: 'CANCELLED', reason: 'Removed by slot-conflict repair — duplicate meeting for this pair' },
        })
      }
      continue
    }
    const target = blocks.find(b =>
      !sponsorBusy.has(`${m.sponsorId}::${b.id}`) &&
      !userBusy.has(`${m.userId}::${b.id}`) &&
      !blockedByBlackout(m.userId, b))
    if (target) {
      moved++
      console.log(`  move meeting ${m.id}: ${m.timeBlockId} → ${target.id}`)
      sponsorBusy.add(`${m.sponsorId}::${target.id}`)
      userBusy.add(`${m.userId}::${target.id}`)
      pairSeen.add(pk)
      if (APPLY) {
        const linked = await findLinkedRequest(m.sponsorId, m.userId)
        const writes = [prisma.sponsorMeeting.update({ where: { id: m.id }, data: { timeBlockId: target.id } })]
        if (linked) writes.push(prisma.meetingRequest.update({ where: { id: linked.id }, data: { timeBlockId: target.id } }))
        await prisma.$transaction(writes)
      }
    } else {
      cancelled++
      console.log(`  cancel meeting ${m.id}: no open slot for both parties`)
      if (APPLY) {
        // This was the pair's only live meeting (a duplicate would have been
        // caught above), so its request goes back to the APPROVED bank.
        const linked = await findLinkedRequest(m.sponsorId, m.userId)
        const writes = [prisma.sponsorMeeting.update({
          where: { id: m.id },
          data: { status: 'CANCELLED', reason: 'Removed by slot-conflict repair — no open slot for both parties' },
        })]
        if (linked) writes.push(prisma.meetingRequest.update({ where: { id: linked.id }, data: { status: 'APPROVED', timeBlockId: null } }))
        await prisma.$transaction(writes)
      }
    }
  }

  console.log(`\n${APPLY ? '✅ applied' : '□ dry run'}: ${moved} moved, ${deduped} pair duplicates cancelled, ${cancelled} cancelled (no slot), ${inConf.length - conflicts.length} untouched`)
}

try {
  await main()
} finally {
  await prisma.$disconnect?.()
}
