#!/usr/bin/env node
// Demo seed for the admin Meetings → Auto tab (mutual Best Fit auto-matching).
//
// Makes the Auto board reflect a live conference: a target share (default 70%)
// of the active conference's confirmed sponsor meetings become mutual Best Fit
// matches — the attendee and a company rep each hold a BEST_FIT request at the
// other, backdated over the past two weeks — with MATCHED + SCHEDULED audit
// events timestamped along that same organic timeline. A handful of fresh
// mutual pairs are left unscheduled and then run through the real
// syncAutoMatches sweep, so the log also carries genuine live
// "auto-scheduled" entries and the engine path is exercised end to end.
//
// Sponsors without a rep user get one seeded rep (reps are what make the
// sponsor-side pick possible). Re-runnable: existing requests are upgraded in
// place, pairs that already carry both picks are skipped, and audit events are
// only written where missing.
//
//   node scripts/seed-auto-matches.mjs                 # 70% ratio, 8 fresh pairs
//   node scripts/seed-auto-matches.mjs --ratio 0.5     # different share
//   node scripts/seed-auto-matches.mjs --fresh 4       # fewer live-scheduled pairs
//
// PII discipline: prints ids/counts only.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback
}
const RATIO = arg('--ratio', 0.7)
const FRESH = arg('--fresh', 8)
const PREFIX = 'seed-am-'
const stamp = Date.now()

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

// Realistic rep names for sponsors that have no rep user yet.
const REP_NAMES = [
  'Jordan Blake', 'Priya Raman', 'Marcus Webb', 'Elena Sorenson', 'Devon Carter',
  'Aisha Malik', 'Tomas Lindqvist', 'Grace Okafor', 'Liam Doherty', 'Renata Silva',
  'Noah Feldman', 'Camille Fournier', 'Victor Huang', 'Sofia Marchetti', 'Owen Gallagher',
  'Nadia Petrov', 'Caleb Nguyen', 'Isla McKenzie', 'Rafael Ortega', 'Hana Kobayashi',
]

const DAY = 86_400_000
const rand = (min, max) => min + Math.random() * (max - min)
// A pick moment sometime in the last two weeks (but at least 1h ago).
const pastPick = () => new Date(Date.now() - rand(1, 14 * 24) * 3_600_000)
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n))

async function main() {
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  console.log(`→ conference: ${confId} · target ratio ${Math.round(RATIO * 100)}% · ${FRESH} fresh pairs`)

  const [sponsors, reps, meetings, liveRequests, events] = await Promise.all([
    prisma.sponsor.findMany({ where: { conferenceId: confId }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { sponsorId: { not: null } }, select: { id: true, sponsorId: true } }),
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED', timeBlock: { conferenceId: confId } },
      orderBy: { createdAt: 'asc' },
      select: {
        sponsorId: true, userId: true, repId: true, timeBlockId: true, location: true,
        timeBlock: { select: { startsAt: true } },
      },
    }),
    prisma.meetingRequest.findMany({
      where: { status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
      select: {
        id: true, requesterId: true, targetUserId: true, targetSponsorId: true, priority: true,
        requester: { select: { sponsorId: true } },
      },
    }),
    prisma.autoMatchEvent.findMany({ select: { sponsorId: true, userId: true, event: true } }),
  ])
  const sponsorById = new Map(sponsors.map(s => [s.id, s]))

  // ── One rep per sponsor (the sponsor-side pick needs a requester with sponsorId)
  const repBySponsor = new Map()
  for (const r of reps) if (!repBySponsor.has(r.sponsorId)) repBySponsor.set(r.sponsorId, r.id)
  const newReps = []
  let repIdx = 0
  for (const s of sponsors) {
    if (repBySponsor.has(s.id)) continue
    const name = REP_NAMES[repIdx % REP_NAMES.length]
    const id = `${PREFIX}rep-${repIdx}-${stamp}`
    newReps.push({
      id,
      email: `${PREFIX}rep-${repIdx}-${stamp}@example.com`,
      name,
      role: 'ATTENDEE',
      sponsorId: s.id,
      company: s.name,
    })
    repBySponsor.set(s.id, id)
    repIdx++
  }
  if (newReps.length) await prisma.user.createMany({ data: newReps })
  console.log(`→ reps: ${reps.length} existing, ${newReps.length} created (every sponsor now has one)`)

  // ── Existing directional picks, so re-runs upgrade instead of duplicating
  const attendeeReqByPair = new Map() // `${sponsorId}::${userId}` → { id, priority }
  const sponsorReqByPair = new Map()
  for (const r of liveRequests) {
    if (r.targetSponsorId) {
      const key = `${r.targetSponsorId}::${r.requesterId}`
      if (!attendeeReqByPair.has(key)) attendeeReqByPair.set(key, r)
    } else if (r.requester?.sponsorId && r.targetUserId) {
      const key = `${r.requester.sponsorId}::${r.targetUserId}`
      if (!sponsorReqByPair.has(key)) sponsorReqByPair.set(key, r)
    }
  }
  const eventSeen = new Set(events.map(e => `${e.event}|${e.sponsorId}::${e.userId}`))

  // ── Pick the backfill set: RATIO of each company's meeting pairs
  const pairsBySponsor = new Map()
  const seenPairs = new Set()
  for (const m of meetings) {
    const key = `${m.sponsorId}::${m.userId}`
    if (seenPairs.has(key)) continue
    seenPairs.add(key)
    const arr = pairsBySponsor.get(m.sponsorId) ?? []
    arr.push(m)
    pairsBySponsor.set(m.sponsorId, arr)
  }
  const backfill = []
  for (const [, arr] of pairsBySponsor) backfill.push(...arr.slice(0, Math.round(arr.length * RATIO)))

  // Attendee display names for the audit rows, one query for the whole set.
  const attendeeNames = new Map(
    (await prisma.user.findMany({
      where: { id: { in: [...new Set(backfill.map(m => m.userId))] } },
      select: { id: true, name: true },
    })).map(u => [u.id, u.name]),
  )

  const newRequests = []
  const upgradeIds = []
  const newEvents = []
  let reqIdx = 0
  for (const m of backfill) {
    const key = `${m.sponsorId}::${m.userId}`
    const sponsor = sponsorById.get(m.sponsorId)
    const repId = m.repId ?? repBySponsor.get(m.sponsorId)
    if (!sponsor || !repId) continue

    // Two backdated picks; the match forms at the later one.
    const a = pastPick()
    const b = new Date(a.getTime() + rand(0.2, 48) * 3_600_000)
    const [attendeeAt, sponsorAt] = Math.random() < 0.5 ? [a, b] : [b, a]
    const matchedAt = new Date(Math.max(attendeeAt.getTime(), sponsorAt.getTime()))

    const existingA = attendeeReqByPair.get(key)
    if (existingA) {
      if (existingA.priority !== 'BEST_FIT') upgradeIds.push(existingA.id)
    } else {
      newRequests.push({
        id: `${PREFIX}reqa-${reqIdx}-${stamp}`,
        requesterId: m.userId, targetSponsorId: m.sponsorId,
        priority: 'BEST_FIT', status: 'CONFIRMED', timeBlockId: m.timeBlockId, createdAt: attendeeAt,
      })
    }
    const existingS = sponsorReqByPair.get(key)
    if (existingS) {
      if (existingS.priority !== 'BEST_FIT') upgradeIds.push(existingS.id)
    } else {
      newRequests.push({
        id: `${PREFIX}reqs-${reqIdx}-${stamp}`,
        requesterId: repId, targetUserId: m.userId,
        priority: 'BEST_FIT', status: 'CONFIRMED', timeBlockId: m.timeBlockId, createdAt: sponsorAt,
      })
    }
    reqIdx++

    // Audit trail along the same timeline: matched, then scheduled moments later.
    const attendeeName = attendeeNames.get(m.userId) ?? 'Attendee'
    if (!eventSeen.has(`MATCHED|${key}`)) {
      newEvents.push({
        sponsorId: m.sponsorId, userId: m.userId, sponsorName: sponsor.name,
        attendeeName, event: 'MATCHED', room: null, startsAt: null, createdAt: matchedAt,
      })
      eventSeen.add(`MATCHED|${key}`)
    }
    if (!eventSeen.has(`SCHEDULED|${key}`)) {
      newEvents.push({
        sponsorId: m.sponsorId, userId: m.userId, sponsorName: sponsor.name,
        attendeeName, event: 'SCHEDULED', room: m.location,
        startsAt: m.timeBlock.startsAt, createdAt: new Date(matchedAt.getTime() + rand(30, 180) * 1000),
      })
      eventSeen.add(`SCHEDULED|${key}`)
    }
  }

  for (const c of chunk(newRequests, 50)) await prisma.meetingRequest.createMany({ data: c })
  for (const c of chunk(upgradeIds, 50)) {
    await prisma.meetingRequest.updateMany({ where: { id: { in: c } }, data: { priority: 'BEST_FIT' } })
  }
  for (const c of chunk(newEvents, 50)) await prisma.autoMatchEvent.createMany({ data: c })
  console.log(`→ backfill: ${backfill.length} pairs across ${pairsBySponsor.size} companies`)
  console.log(`   ${newRequests.length} picks created, ${upgradeIds.length} upgraded to Best Fit, ${newEvents.length} log events written`)

  // ── Fresh mutual pairs, scheduled by the real sweep (live log entries)
  const pairedUsers = new Set(meetings.map(m => m.userId))
  const candidates = await prisma.user.findMany({
    where: { sponsorId: null, role: 'ATTENDEE' },
    orderBy: { createdAt: 'desc' },
    take: FRESH * 5,
    select: { id: true },
  })
  const freshAttendees = candidates.filter(u => !pairedUsers.has(u.id)).slice(0, FRESH)
  const freshSponsors = sponsors.slice(0, Math.max(1, Math.min(sponsors.length, FRESH)))
  let freshCount = 0
  const freshRows = []
  for (let i = 0; i < freshAttendees.length; i++) {
    const u = freshAttendees[i]
    const s = freshSponsors[i % freshSponsors.length]
    const key = `${s.id}::${u.id}`
    if (seenPairs.has(key) || attendeeReqByPair.has(key) || sponsorReqByPair.has(key)) continue
    const pickedAt = new Date(Date.now() - rand(2, 40) * 60_000)
    freshRows.push(
      {
        id: `${PREFIX}fresha-${i}-${stamp}`, requesterId: u.id, targetSponsorId: s.id,
        priority: 'BEST_FIT', status: 'PENDING', createdAt: pickedAt,
      },
      {
        id: `${PREFIX}freshs-${i}-${stamp}`, requesterId: repBySponsor.get(s.id), targetUserId: u.id,
        priority: 'BEST_FIT', status: 'PENDING', createdAt: new Date(pickedAt.getTime() + rand(1, 20) * 60_000),
      },
    )
    freshCount++
  }
  if (freshRows.length) await prisma.meetingRequest.createMany({ data: freshRows })
  console.log(`→ fresh: ${freshCount} unscheduled mutual pairs created`)

  const sync = await E.syncAutoMatches(prisma, confId)
  console.log(`→ sweep: ${sync.scheduled.length} meetings auto-scheduled, ${sync.matchedLogged} MATCHED + ${sync.scheduledLogged} SCHEDULED events logged`)

  const board = await E.getAutoMatchBoard(prisma, confId)
  console.log(`→ board: ${board.totals.matches} matches (${board.totals.scheduled} scheduled, ${board.totals.ready} awaiting) · log ${board.log.length} entries`)
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
