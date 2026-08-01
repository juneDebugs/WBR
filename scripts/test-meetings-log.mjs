#!/usr/bin/env node
// Engine test for the Meetings Log reader (packages/db/src/meeting-engine.ts →
// getMeetingsLog).
//
// Builds a throwaway INACTIVE fixture conference (+ a second one, to prove
// conference scoping) with meetings, sponsor meetings and requests that carry
// notes/comments across all four note-bearing surfaces, then asserts the reader
// aggregates, classifies, scopes and orders them correctly. Every engine call
// passes conferenceId explicitly, so the real active conference is untouched.
// All fixture rows are prefixed 'mlog-test-' and swept in finally.
//
//   node scripts/test-meetings-log.mjs
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

const PREFIX = 'mlog-test-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`

async function cleanup() {
  await prisma.sponsorMeeting.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.meetingRequest.deleteMany({ where: { requesterId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.meeting.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.conference.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
}

async function main() {
  console.log('\nFixtures — isolated inactive conference')
  const conf = await prisma.conference.create({ data: {
    id: fid('conf'), name: 'Meetings Log Test Conf', active: false,
    startDate: new Date('2031-02-03T00:00:00Z'), endDate: new Date('2031-02-04T23:59:59Z'),
  } })
  const confId = conf.id
  // A second conference proves request-message scoping: a message aimed at its
  // sponsor must NOT surface in confId's log.
  const confOther = await prisma.conference.create({ data: {
    id: fid('conf-other'), name: 'Other Conf', active: false,
    startDate: new Date('2031-03-03T00:00:00Z'), endDate: new Date('2031-03-04T23:59:59Z'),
  } })

  const sponsor = await prisma.sponsor.create({ data: {
    id: fid('sponsor'), conferenceId: confId, name: 'Mlog Test Co', tier: 'GOLD',
  } })
  const sponsorOther = await prisma.sponsor.create({ data: {
    id: fid('sponsor-other'), conferenceId: confOther.id, name: 'Mlog Other Co', tier: 'SILVER',
  } })

  const userA = await prisma.user.create({ data: {
    id: fid('user-a'), email: `${PREFIX}a-${stamp}@example.com`, name: 'Mlog Alice', role: 'ATTENDEE',
  } })
  const userB = await prisma.user.create({ data: {
    id: fid('user-b'), email: `${PREFIX}b-${stamp}@example.com`, name: 'Mlog Bob', role: 'ATTENDEE',
  } })

  const tb1 = await prisma.timeBlock.create({ data: { id: fid('tb-1'), conferenceId: confId, startsAt: new Date('2031-02-03T18:00:00Z'), endsAt: new Date('2031-02-03T18:30:00Z') } })
  const tb2 = await prisma.timeBlock.create({ data: { id: fid('tb-2'), conferenceId: confId, startsAt: new Date('2031-02-03T19:00:00Z'), endsAt: new Date('2031-02-03T19:30:00Z') } })

  // 1) MEETING_NOTE — a 1:1 meeting with notes.
  const meetingNoted = await prisma.meeting.create({ data: {
    id: fid('meeting-1'), conferenceId: confId, timeBlockId: tb1.id,
    organizerId: userA.id, attendeeAId: userA.id, attendeeBId: userB.id,
    status: 'CONFIRMED', notes: 'Bring the Q3 deck and intro slides.',
  } })
  // Negative: a 1:1 meeting with NO notes must not appear.
  await prisma.meeting.create({ data: {
    id: fid('meeting-2'), conferenceId: confId, timeBlockId: tb2.id,
    organizerId: userA.id, attendeeAId: userA.id, attendeeBId: userB.id,
    status: 'CONFIRMED', notes: null,
  } })

  // 2) FLOOR_NOTE — a confirmed sponsor meeting with a floor note + a room.
  const floorNoted = await prisma.sponsorMeeting.create({ data: {
    id: fid('sm-floor'), sponsorId: sponsor.id, userId: userA.id, timeBlockId: tb1.id,
    status: 'CONFIRMED', location: 'Table 7', notes: 'Buyer arrived early, seated at booth.',
    createdAt: new Date('2031-02-03T17:00:00Z'),
  } })
  // Negative: confirmed sponsor meeting with whitespace-only notes must not appear.
  await prisma.sponsorMeeting.create({ data: {
    id: fid('sm-blank'), sponsorId: sponsor.id, userId: userB.id, timeBlockId: tb2.id,
    status: 'CONFIRMED', location: 'Table 8', notes: '   ',
    createdAt: new Date('2031-02-03T17:05:00Z'),
  } })

  // 3) CANCELLATION — a cancelled sponsor meeting with reason + context note.
  const cancelled = await prisma.sponsorMeeting.create({ data: {
    id: fid('sm-cancel'), sponsorId: sponsor.id, userId: userB.id, timeBlockId: tb1.id,
    status: 'CANCELLED', reason: 'Attendee no-show', notes: 'Waited 10 minutes, rebooking.',
    createdAt: new Date('2031-02-03T16:00:00Z'),
  } })

  // 4) REQUEST_MESSAGE — an in-conference request carrying a message.
  const reqIn = await prisma.meetingRequest.create({ data: {
    id: fid('req-in'), requesterId: userA.id, targetSponsorId: sponsor.id,
    status: 'PENDING', priority: 'MED', message: 'Keen to discuss your CDP roadmap.',
    createdAt: new Date('2031-02-03T15:00:00Z'),
  } })
  // Negative A: request with no message must not appear.
  await prisma.meetingRequest.create({ data: {
    id: fid('req-nomsg'), requesterId: userA.id, targetSponsorId: sponsor.id,
    status: 'PENDING', priority: 'MED', message: null,
    createdAt: new Date('2031-02-03T15:01:00Z'),
  } })
  // Negative B: message aimed at another conference's sponsor must be scoped out.
  await prisma.meetingRequest.create({ data: {
    id: fid('req-out'), requesterId: userA.id, targetSponsorId: sponsorOther.id,
    status: 'PENDING', priority: 'MED', message: 'Out-of-conference message.',
    createdAt: new Date('2031-02-03T15:02:00Z'),
  } })

  console.log('  created 2 conferences, 2 sponsors, 2 users, 2 blocks, 2 meetings, 2 sponsor meetings, 3 requests')

  console.log('\nAggregate + classify')
  const log = await E.getMeetingsLog(prisma, confId)
  const byId = new Map(log.entries.map(e => [e.id, e]))

  check('counts.all = 4 (one per note-bearing surface)', log.counts.all === 4, `got ${log.counts.all}`)
  check('counts.MEETING_NOTE = 1', log.counts.MEETING_NOTE === 1, `got ${log.counts.MEETING_NOTE}`)
  check('counts.FLOOR_NOTE = 1', log.counts.FLOOR_NOTE === 1, `got ${log.counts.FLOOR_NOTE}`)
  check('counts.CANCELLATION = 1', log.counts.CANCELLATION === 1, `got ${log.counts.CANCELLATION}`)
  check('counts.REQUEST_MESSAGE = 1', log.counts.REQUEST_MESSAGE === 1, `got ${log.counts.REQUEST_MESSAGE}`)
  check('counts.all equals entries.length', log.counts.all === log.entries.length)

  const mNote = byId.get(`MEETING_NOTE:${meetingNoted.id}`)
  check('meeting note present with its text', mNote?.text === 'Bring the Q3 deck and intro slides.', mNote?.text)
  check('meeting note title names both attendees', mNote?.title === 'Mlog Alice & Mlog Bob', mNote?.title)
  check('meeting note carries no sponsor', mNote?.sponsorName === null)

  const fNote = byId.get(`FLOOR_NOTE:${floorNoted.id}`)
  check('floor note present with its text', fNote?.text === 'Buyer arrived early, seated at booth.', fNote?.text)
  check('floor note surfaces the room in subtitle', fNote?.subtitle === 'Room Table 7', fNote?.subtitle)
  check('floor note carries the sponsor + tier', fNote?.sponsorName === 'Mlog Test Co' && fNote?.sponsorTier === 'GOLD')

  const cNote = byId.get(`CANCELLATION:${cancelled.id}`)
  check('cancellation headline = the reason', cNote?.text === 'Attendee no-show', cNote?.text)
  check('cancellation context note rides along as detail', cNote?.detail === 'Waited 10 minutes, rebooking.', cNote?.detail)
  check('cancellation status = CANCELLED', cNote?.status === 'CANCELLED', cNote?.status)

  const rNote = byId.get(`REQUEST_MESSAGE:${reqIn.id}`)
  check('request message present with its text', rNote?.text === 'Keen to discuss your CDP roadmap.', rNote?.text)
  check('request title reads requester → sponsor', rNote?.title === 'Mlog Alice → Mlog Test Co', rNote?.title)

  console.log('\nExclusions')
  check('empty-notes meeting excluded', !byId.has(`MEETING_NOTE:${fid('meeting-2')}`))
  check('whitespace-notes sponsor meeting excluded', !byId.has(`FLOOR_NOTE:${fid('sm-blank')}`))
  check('null-message request excluded', !byId.has(`REQUEST_MESSAGE:${fid('req-nomsg')}`))
  check('out-of-conference request message scoped out', !byId.has(`REQUEST_MESSAGE:${fid('req-out')}`))

  console.log('\nOrdering — newest first, monotonic non-increasing')
  let ordered = true
  for (let i = 1; i < log.entries.length; i++) {
    if (log.entries[i - 1].timestamp < log.entries[i].timestamp) { ordered = false; break }
  }
  check('entries are sorted by timestamp descending', ordered,
    log.entries.map(e => e.timestamp).join(' , '))
  check('every entry timestamp is a valid ISO string', log.entries.every(e => !Number.isNaN(Date.parse(e.timestamp))))
  check('every entry id is unique', new Set(log.entries.map(e => e.id)).size === log.entries.length)

  console.log('\nConference isolation')
  // confOther owns only sponsorOther, whose sole note is the request message
  // aimed at it — so its log is exactly that one entry, and none of confId's.
  const otherLog = await E.getMeetingsLog(prisma, confOther.id)
  const otherIds = new Set(otherLog.entries.map(e => e.id))
  check('other conference log holds only its own request message', otherLog.counts.all === 1, `got ${otherLog.counts.all}`)
  check('other conference log = the req-out message', otherIds.has(`REQUEST_MESSAGE:${fid('req-out')}`))
  check('confId entries never leak into the other conference log',
    !otherIds.has(`MEETING_NOTE:${meetingNoted.id}`) &&
    !otherIds.has(`FLOOR_NOTE:${floorNoted.id}`) &&
    !otherIds.has(`CANCELLATION:${cancelled.id}`) &&
    !otherIds.has(`REQUEST_MESSAGE:${reqIn.id}`))
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
