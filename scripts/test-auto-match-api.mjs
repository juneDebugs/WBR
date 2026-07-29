#!/usr/bin/env node
// API integration test for the mutual Best Fit auto-match route (apps/web,
// GET /api/admin/scheduler/auto — POST no longer exists).
//
// Exercises auth gating + the self-healing GET lifecycle against a running
// admin dev server (repo-standard :3000; override with SMOKE_BASE_URL when the
// port is taken, e.g. SMOKE_BASE_URL=http://localhost:3200). The GET runs the
// syncAutoMatches sweep BEFORE reading the board, so the first authenticated
// GET after the fixtures exist must come back with the fixture pair ALREADY
// scheduled (meeting + room) and MATCHED/SCHEDULED entries in the audit log;
// a second GET must change nothing (no duplicate meeting or events). Then the
// meeting actions: PATCH /auto/meetings/{id} moves the meeting to a slot+room
// picked from the shared availability endpoint (RESCHEDULED event), and
// POST /auto/meetings/{id}/cancel dissolves the match (meeting CANCELLED, both
// picks withdrawn, CANCELLED event, sweep does not resurrect, re-cancel 400s).
// The route always reads the ACTIVE conference, so fixtures (a throwaway
// sponsor + rep + attendee + far-future time block + the mutual BEST_FIT
// request pair, ids prefixed 'am-test-api-') are created in it and removed via
// Prisma against the SAME db the server uses, so the test is hermetic and the
// DB is left as found. The active conference may hold real matches too — the
// sweep can legitimately schedule/log those — so every assertion is pinned to
// OUR pair (never to global counts or log order).
//
//   node scripts/test-auto-match-api.mjs           # server already running
//   node scripts/test-auto-match-api.mjs --start   # boot next dev, then kill it
//
// PII discipline: prints ids/counts only.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const PORT = new URL(BASE).port || '3000'
const STAFF = { email: process.env.SMOKE_STAFF_EMAIL ?? 'wbr@test.com', password: process.env.SMOKE_STAFF_PASSWORD ?? 'password123' }
const API = `${BASE}/api/admin/scheduler/auto`

let serverProc = null, failures = 0
const check = (name, cond, detail = '') => cond ? console.log(`  ✓ ${name}`) : (failures++, console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`))

function readEnvLocal(app) {
  const env = {}
  try { for (const line of readFileSync(join(ROOT, 'apps', app, '.env.local'), 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {}
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
function makeJar() {
  const jar = new Map()
  const jarFetch = async (url, opts = {}) => {
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await fetch(url, { ...opts, redirect: 'manual', headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) } })
    for (const line of res.headers.getSetCookie?.() ?? []) { const [pair] = line.split(';'); const eq = pair.indexOf('='); jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1)) }
    return res
  }
  return { jar, jarFetch }
}
async function login(email, password) {
  const { jar, jarFetch } = makeJar()
  const csrf = await (await jarFetch(`${BASE}/api/auth/csrf`)).json().catch(() => ({}))
  if (!csrf.csrfToken) return null
  const res = await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, json: 'true' }),
  })
  if (res.status !== 200 && res.status !== 302) return null
  return [...jar.keys()].some(k => k.includes('next-auth.session-token')) ? jarFetch : null
}
const serverUp = async () => { try { return (await fetch(`${BASE}/login`, { redirect: 'manual' })).status < 500 } catch { return false } }
async function waitFor(cond, ms, label) { const s = Date.now(); while (Date.now() - s < ms) { if (await cond()) return; await new Promise(r => setTimeout(r, 1500)) } throw new Error(`Timed out waiting for ${label}`) }
const jsonReq = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const prisma = makePrisma()
const PREFIX = 'am-test-api-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`
async function cleanup() {
  await prisma.autoMatchEvent.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.meetingRequest.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.sponsorMeeting.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.timeBlock.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.sponsor.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.$disconnect().catch(() => {})
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) { console.error(`No server at ${BASE}. Start one (cd apps/web && npx next dev -p ${PORT}) or pass --start.`); process.exit(2) }
    console.log(`Starting admin dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], { cwd: join(ROOT, 'apps/web'), env: { ...process.env, NEXTAUTH_URL: BASE }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 180_000, 'admin dev server')
    console.log('Server is up.')
  }

  console.log('\n[auth gating]')
  const anonGet = await fetch(API, { redirect: 'manual' })
  check('anon GET /auto → 401', anonGet.status === 401, `got ${anonGet.status}`)
  const staff = await login(STAFF.email, STAFF.password)
  check('staff login works', !!staff)
  if (!staff) { console.error('  cannot continue without staff auth'); return }
  const staffPost = await staff(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  check('staff POST /auto → 405 (route is GET-only now)', staffPost.status === 405, `got ${staffPost.status}`)

  // Hermetic fixtures against the SAME db the server uses: a fresh sponsor in
  // the ACTIVE conference (the route resolves it implicitly), a rep + an
  // attendee, a far-future time block nothing else books, and the mutual
  // BEST_FIT request pair that forms the match. Created AFTER the checks above
  // so the first authenticated GET below is the pair's first-ever sweep.
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const sponsor = await prisma.sponsor.create({ data: { id: fid('sponsor'), conferenceId: confId, name: 'am-test-api Match Co', tier: 'GOLD' } })
  const rep = await prisma.user.create({ data: { id: fid('rep'), email: `${PREFIX}rep-${stamp}@example.com`, name: 'am-test-api Rep', role: 'ATTENDEE', sponsorId: sponsor.id } })
  const attendee = await prisma.user.create({ data: { id: fid('user'), email: `${PREFIX}u-${stamp}@example.com`, name: 'am-test-api Buyer', role: 'ATTENDEE' } })
  await prisma.timeBlock.create({ data: { id: fid('tb'), conferenceId: confId, startsAt: new Date('2031-05-20T14:00:00Z'), endsAt: new Date('2031-05-20T14:30:00Z') } })
  const attReq = await prisma.meetingRequest.create({ data: { id: fid('req-att'), requesterId: attendee.id, targetSponsorId: sponsor.id, priority: 'BEST_FIT', status: 'PENDING' } })
  const repReq = await prisma.meetingRequest.create({ data: { id: fid('req-rep'), requesterId: rep.id, targetUserId: attendee.id, priority: 'BEST_FIT', status: 'PENDING' } })
  const KEY = `${sponsor.id}::${attendee.id}`
  console.log(`  fixtures ready in active conference ${confId} (pair ${KEY})`)

  console.log('\n[self-healing GET: sweep + board]')
  const boardRes = await staff(API)
  const board = await boardRes.json().catch(() => null)
  check('staff GET /auto → 200 with matches[] + totals + log[]',
    boardRes.status === 200 && Array.isArray(board?.matches) && typeof board?.totals?.matches === 'number' && Array.isArray(board?.log),
    `status ${boardRes.status}`)
  const match0 = board?.matches?.find(m => m.key === KEY)
  check('fixture match is present and carries both picks',
    !!match0 && match0.sponsorPick?.requestId === repReq.id && match0.attendeePick?.requestId === attReq.id)
  check('the sweep already scheduled it: meeting non-null with a room + ISO startsAt',
    typeof match0?.meeting?.sponsorMeetingId === 'string' && typeof match0?.meeting?.room === 'string' && match0.meeting.room.length > 0 &&
    !Number.isNaN(Date.parse(match0?.meeting?.startsAt ?? '')), JSON.stringify(match0?.meeting ?? null))
  const ourLog = b => (b?.log ?? []).filter(e => e.sponsorId === sponsor.id && e.userId === attendee.id)
  check('board.log carries the pair MATCHED entry (room/startsAt null)',
    ourLog(board).some(e => e.event === 'MATCHED' && e.room === null && e.startsAt === null), `ours=${ourLog(board).length}`)
  check('board.log carries the pair SCHEDULED entry (room + ISO startsAt set)',
    ourLog(board).some(e => e.event === 'SCHEDULED' && typeof e.room === 'string' && !Number.isNaN(Date.parse(e.startsAt ?? ''))))
  const mtg = await prisma.sponsorMeeting.findFirst({ where: { sponsorId: sponsor.id, userId: attendee.id }, select: { status: true, repId: true, location: true } })
  check('meeting persisted CONFIRMED with a room and repId = the rep (sponsor-side pick)',
    mtg?.status === 'CONFIRMED' && typeof mtg.location === 'string' && mtg.location.length > 0 && mtg.repId === rep.id, JSON.stringify(mtg))
  const repReqAfter = await prisma.meetingRequest.findUnique({ where: { id: repReq.id }, select: { status: true } })
  check('sponsor-side request flipped to CONFIRMED', repReqAfter?.status === 'CONFIRMED', `status=${repReqAfter?.status}`)

  console.log('\n[second GET is a no-op for the pair]')
  const again = await (await staff(API)).json().catch(() => null)
  const matchAgain = again?.matches?.find(m => m.key === KEY)
  check('pair still shows as scheduled with the same meeting',
    !!matchAgain?.meeting && matchAgain.meeting.sponsorMeetingId === match0?.meeting?.sponsorMeetingId)
  check('totals.scheduled ≥ 1', typeof again?.totals?.scheduled === 'number' && again.totals.scheduled >= 1, JSON.stringify(again?.totals))
  const mtgCount = await prisma.sponsorMeeting.count({ where: { sponsorId: sponsor.id, userId: attendee.id } })
  check('no duplicate meeting (Prisma count stays 1)', mtgCount === 1, `count=${mtgCount}`)
  const [matchedEvents, scheduledEvents] = await Promise.all([
    prisma.autoMatchEvent.count({ where: { sponsorId: sponsor.id, userId: attendee.id, event: 'MATCHED' } }),
    prisma.autoMatchEvent.count({ where: { sponsorId: sponsor.id, userId: attendee.id, event: 'SCHEDULED' } }),
  ])
  check('no duplicate log events (exactly 1 MATCHED + 1 SCHEDULED for the pair)',
    matchedEvents === 1 && scheduledEvents === 1, `MATCHED=${matchedEvents} SCHEDULED=${scheduledEvents}`)

  // Meeting actions on the pair's auto-scheduled meeting.
  const mtgRow = await prisma.sponsorMeeting.findFirst({
    where: { sponsorId: sponsor.id, userId: attendee.id, status: 'CONFIRMED' }, select: { id: true, timeBlockId: true },
  })
  if (!mtgRow) { failures++; console.error('  ✗ cannot continue: no confirmed fixture meeting to act on'); return }
  const MEETING_API = `${BASE}/api/admin/scheduler/auto/meetings/${mtgRow.id}`

  console.log('\n[actions: auth + validation]')
  const anonPatch = await fetch(MEETING_API, { ...jsonReq('PATCH', { timeBlockId: 'x', room: 'Table 1' }), redirect: 'manual' })
  check('anon PATCH /auto/meetings/{id} → 401', anonPatch.status === 401, `got ${anonPatch.status}`)
  const anonCancel = await fetch(`${MEETING_API}/cancel`, { ...jsonReq('POST', {}), redirect: 'manual' })
  check('anon POST /auto/meetings/{id}/cancel → 401', anonCancel.status === 401, `got ${anonCancel.status}`)
  const missingRoom = await staff(MEETING_API, jsonReq('PATCH', { timeBlockId: mtgRow.timeBlockId }))
  check('staff PATCH with missing room → 400', missingRoom.status === 400, `got ${missingRoom.status}`)
  const bogusRes = await staff(`${BASE}/api/admin/scheduler/auto/meetings/${PREFIX}bogus-${stamp}`, jsonReq('PATCH', { timeBlockId: mtgRow.timeBlockId, room: 'Table 1' }))
  const bogus = await bogusRes.json().catch(() => ({}))
  check('staff PATCH bogus id → 404 MEETING_NOT_FOUND', bogusRes.status === 404 && bogus.code === 'MEETING_NOT_FOUND', `status ${bogusRes.status} code ${bogus.code}`)

  console.log('\n[actions: reschedule]')
  // Pick a genuinely free slot+room from the shared availability endpoint —
  // 'Table 1' in a hardcoded block could collide with real data.
  const avail = await (await staff(`${BASE}/api/admin/scheduler/meetings/${mtgRow.id}/availability`)).json().catch(() => null)
  const slot = avail?.days?.flatMap(d => d.slots ?? [])
    .find(s => s.available && s.timeBlockId !== avail?.current?.timeBlockId)
  const freeRoom = slot?.rooms?.find(r => r.available)?.name
  check('availability offers another free slot+room to move to', !!slot && !!freeRoom, `slot=${slot?.timeBlockId} room=${freeRoom}`)
  if (!slot || !freeRoom) { console.error('  cannot continue without a free slot'); return }
  const moveRes = await staff(MEETING_API, jsonReq('PATCH', { timeBlockId: slot.timeBlockId, room: freeRoom }))
  const movedBody = await moveRes.json().catch(() => null)
  check('PATCH {timeBlockId, room} → 200 with the updated meeting',
    moveRes.status === 200 && movedBody?.timeBlockId === slot.timeBlockId && movedBody?.location === freeRoom, `status ${moveRes.status}`)
  const movedRow = await prisma.sponsorMeeting.findUnique({ where: { id: mtgRow.id }, select: { timeBlockId: true, location: true, status: true } })
  check('meeting row persisted with the new slot, still CONFIRMED',
    movedRow?.timeBlockId === slot.timeBlockId && movedRow?.location === freeRoom && movedRow?.status === 'CONFIRMED', JSON.stringify(movedRow))
  const rescheduledEvents = await prisma.autoMatchEvent.count({ where: { sponsorId: sponsor.id, userId: attendee.id, event: 'RESCHEDULED' } })
  check('RESCHEDULED event written for the pair', rescheduledEvents === 1, `count=${rescheduledEvents}`)

  console.log('\n[actions: cancel dissolves the match]')
  const cancelRes = await staff(`${MEETING_API}/cancel`, jsonReq('POST', { reason: 'api-test' }))
  const cancelBody = await cancelRes.json().catch(() => null)
  check('POST cancel {reason} → 200 with CANCELLED meeting', cancelRes.status === 200 && cancelBody?.meeting?.status === 'CANCELLED', `status ${cancelRes.status}`)
  const cancelledRow = await prisma.sponsorMeeting.findUnique({ where: { id: mtgRow.id }, select: { status: true, reason: true } })
  check('meeting persisted CANCELLED with the reason', cancelledRow?.status === 'CANCELLED' && cancelledRow.reason === 'api-test', JSON.stringify(cancelledRow))
  const reqStates = await prisma.meetingRequest.findMany({ where: { id: { in: [attReq.id, repReq.id] } }, select: { status: true } })
  check('both fixture BEST_FIT requests flipped to CANCELLED',
    reqStates.length === 2 && reqStates.every(r => r.status === 'CANCELLED'), JSON.stringify(reqStates.map(r => r.status)))
  const cancelledEvents = await prisma.autoMatchEvent.count({ where: { sponsorId: sponsor.id, userId: attendee.id, event: 'CANCELLED' } })
  check('CANCELLED event written for the pair', cancelledEvents === 1, `count=${cancelledEvents}`)
  const afterCancel = await (await staff(API)).json().catch(() => null)
  check('follow-up GET /auto: pair neither ready nor scheduled (gone from the board)',
    Array.isArray(afterCancel?.matches) && !afterCancel.matches.some(m => m.key === KEY))
  const resurrect = await (await staff(API)).json().catch(() => null)
  const liveAfter = await prisma.sponsorMeeting.count({ where: { sponsorId: sponsor.id, userId: attendee.id, status: 'CONFIRMED' } })
  check('second GET does not resurrect (no new meeting, pair still off the board)',
    !resurrect?.matches?.some(m => m.key === KEY) && liveAfter === 0, `live=${liveAfter}`)
  const reCancelRes = await staff(`${MEETING_API}/cancel`, jsonReq('POST', { reason: 'api-test again' }))
  const reCancel = await reCancelRes.json().catch(() => ({}))
  check('POST cancel again → 400 BAD_STATUS', reCancelRes.status === 400 && reCancel.code === 'BAD_STATUS', `status ${reCancelRes.status} code ${reCancel.code}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
