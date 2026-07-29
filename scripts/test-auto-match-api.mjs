#!/usr/bin/env node
// API integration test for the mutual Best Fit auto-match routes (apps/web,
// /api/admin/scheduler/auto).
//
// Exercises auth gating + the full HTTP lifecycle (board → dry-run preview →
// real scheduling → idempotence → validation errors) against a running admin
// dev server (repo-standard :3000; override with SMOKE_BASE_URL when the port
// is taken, e.g. SMOKE_BASE_URL=http://localhost:3200). The route always reads
// the ACTIVE conference, so fixtures (a throwaway sponsor + rep + attendee +
// far-future time block + the mutual BEST_FIT request pair, ids prefixed
// 'am-test-api-') are created in it and removed via Prisma against the SAME db
// the server uses, so the test is hermetic and the DB is left as found. The
// active conference may hold real matches too, so every scheduling assertion
// is pinned to OUR pair (never to global counts).
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
const jsonPost = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const prisma = makePrisma()
const PREFIX = 'am-test-api-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`
async function cleanup() {
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
  const anonPost = await fetch(API, { ...jsonPost({ dryRun: true }), redirect: 'manual' })
  check('anon POST /auto → 401', anonPost.status === 401, `got ${anonPost.status}`)
  const staff = await login(STAFF.email, STAFF.password)
  check('staff login works', !!staff)
  if (!staff) { console.error('  cannot continue without staff auth'); return }

  // Hermetic fixtures against the SAME db the server uses: a fresh sponsor in
  // the ACTIVE conference (the route resolves it implicitly), a rep + an
  // attendee, a far-future time block nothing else books, and the mutual
  // BEST_FIT request pair that forms the match.
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

  console.log('\n[board shape]')
  const boardRes = await staff(API)
  const board = await boardRes.json().catch(() => null)
  check('staff GET /auto → 200 with matches[] + totals', boardRes.status === 200 && Array.isArray(board?.matches) && typeof board?.totals?.matches === 'number', `status ${boardRes.status}`)
  const match0 = board?.matches?.find(m => m.key === KEY)
  check('board contains the fixture match, ready (meeting null)', !!match0 && match0.meeting === null && match0.sponsor?.id === sponsor.id)
  check('fixture match carries both picks with request ids',
    match0?.sponsorPick?.requestId === repReq.id && match0?.attendeePick?.requestId === attReq.id)

  console.log('\n[dry run]')
  const dryRes = await staff(API, jsonPost({ dryRun: true }))
  const dry = await dryRes.json().catch(() => null)
  check('POST {dryRun:true} → 200 with dryRun:true', dryRes.status === 200 && dry?.dryRun === true, `status ${dryRes.status}`)
  const dryOurs = dry?.scheduled?.find(s => s.sponsorId === sponsor.id)
  check('dry-run plan includes our pair (sponsor-side request)', !!dryOurs && dryOurs.requestId === repReq.id && dryOurs.userId === attendee.id)
  const afterDry = await prisma.sponsorMeeting.count({ where: { sponsorId: sponsor.id } })
  check('dry run persisted no SponsorMeeting for our sponsor', afterDry === 0, `count=${afterDry}`)

  console.log('\n[real run]')
  const runRes = await staff(API, jsonPost({}))
  const run = await runRes.json().catch(() => null)
  check('POST {} → 200 with dryRun:false', runRes.status === 200 && run?.dryRun === false, `status ${runRes.status}`)
  check('result schedules our pair', !!run?.scheduled?.find(s => s.requestId === repReq.id))
  const mtg = await prisma.sponsorMeeting.findFirst({ where: { sponsorId: sponsor.id, userId: attendee.id }, select: { status: true, repId: true, location: true } })
  check('meeting persisted CONFIRMED with a room and repId = the rep',
    mtg?.status === 'CONFIRMED' && typeof mtg.location === 'string' && mtg.location.length > 0 && mtg.repId === rep.id, JSON.stringify(mtg))
  const after = await (await staff(API)).json().catch(() => null)
  const matchAfter = after?.matches?.find(m => m.key === KEY)
  check('follow-up GET shows the match scheduled (meeting with room + startsAt)',
    !!matchAfter?.meeting?.sponsorMeetingId && typeof matchAfter.meeting.startsAt === 'string' && !Number.isNaN(Date.parse(matchAfter.meeting.startsAt)))
  check('follow-up GET totals.scheduled ≥ 1', typeof after?.totals?.scheduled === 'number' && after.totals.scheduled >= 1, JSON.stringify(after?.totals))

  console.log('\n[idempotence]')
  const againRes = await staff(API, jsonPost({}))
  const again = await againRes.json().catch(() => null)
  check('second POST {} does not reschedule our pair', againRes.status === 200 && !again?.scheduled?.some(s => s.sponsorId === sponsor.id), `status ${againRes.status}`)
  const mtgCount = await prisma.sponsorMeeting.count({ where: { sponsorId: sponsor.id } })
  check('no duplicate meeting for our pair (count stays 1)', mtgCount === 1, `count=${mtgCount}`)

  console.log('\n[validation errors]')
  const nonBool = await staff(API, jsonPost({ dryRun: 'yes' }))
  check("POST {dryRun:'yes'} → 400", nonBool.status === 400, `got ${nonBool.status}`)
  const badJson = await staff(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not-json' })
  check('POST invalid JSON body → 400', badJson.status === 400, `got ${badJson.status}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
