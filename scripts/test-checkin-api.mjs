#!/usr/bin/env node
// API integration test for the on-site floor check-in routes (apps/web,
// /api/admin/scheduler/checkin[/{id}]).
//
// Exercises auth gating + the full HTTP lifecycle (board → arrival toggles →
// notes round-trip → validation errors) against a running admin dev server
// (repo-standard :3000; override with SMOKE_BASE_URL when the port is taken,
// e.g. SMOKE_BASE_URL=http://localhost:3200). The board route always reads the
// ACTIVE conference, so fixtures (a throwaway sponsor + attendee + far-future
// time block + one CONFIRMED meeting, ids prefixed 'chk-test-api-') are
// created in it and removed via Prisma against the SAME db the server uses,
// so the test is hermetic and the DB is left as found.
//
//   node scripts/test-checkin-api.mjs           # server already running
//   node scripts/test-checkin-api.mjs --start   # boot next dev, then kill it
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
const API = `${BASE}/api/admin/scheduler/checkin`

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
const jsonPatch = body => ({ method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const prisma = makePrisma()
const PREFIX = 'chk-test-api-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`
async function cleanup() {
  await prisma.sponsorMeeting.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.timeBlock.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.sponsor.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.$disconnect().catch(() => {})
}

// Board helper: find our fixture meeting row wherever it lands.
const findMeeting = (board, id) =>
  board?.days?.flatMap(d => d.slots ?? []).flatMap(s => s.meetings ?? []).find(m => m.sponsorMeetingId === id)

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
  check('anon GET /checkin → 401', anonGet.status === 401, `got ${anonGet.status}`)
  const anonPatch = await fetch(`${API}/some-id`, { ...jsonPatch({ sponsorArrived: true }), redirect: 'manual' })
  check('anon PATCH /checkin/{id} → 401', anonPatch.status === 401, `got ${anonPatch.status}`)
  const staff = await login(STAFF.email, STAFF.password)
  check('staff login works', !!staff)
  if (!staff) { console.error('  cannot continue without staff auth'); return }

  // Hermetic fixtures against the SAME db the server uses: a fresh sponsor in
  // the ACTIVE conference (the board route resolves it implicitly) plus one
  // far-future time block nothing else books, holding one CONFIRMED meeting.
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const sponsor = await prisma.sponsor.create({ data: { id: fid('sponsor'), conferenceId: confId, name: 'chk-test-api Booth Co', tier: 'GOLD' } })
  const user = await prisma.user.create({ data: { id: fid('user'), email: `${PREFIX}u-${stamp}@example.com`, name: 'chk-test-api Buyer', role: 'ATTENDEE' } })
  const tb = await prisma.timeBlock.create({ data: { id: fid('tb'), conferenceId: confId, startsAt: new Date('2031-04-14T14:00:00Z'), endsAt: new Date('2031-04-14T14:30:00Z') } })
  const meeting = await prisma.sponsorMeeting.create({ data: { id: fid('meeting'), sponsorId: sponsor.id, userId: user.id, timeBlockId: tb.id, status: 'CONFIRMED', location: 'Table 1' } })
  console.log(`  fixtures ready in active conference ${confId} (meeting ${meeting.id})`)

  console.log('\n[board shape]')
  const boardRes = await staff(API)
  const board = await boardRes.json().catch(() => null)
  check('staff GET /checkin → 200 with days[] + totals', boardRes.status === 200 && Array.isArray(board?.days) && typeof board?.totals?.meetings === 'number', `status ${boardRes.status}`)
  const row0 = findMeeting(board, meeting.id)
  check('board contains the fixture meeting in its slot', !!row0 && row0.sponsorId === sponsor.id)
  check('fixture row starts un-arrived with null notes', row0?.sponsorArrivedAt === null && row0?.buyerArrivedAt === null && row0?.notes === null)
  const slot0 = board?.days?.flatMap(d => d.slots ?? []).find(s => s.timeBlockId === tb.id)
  check('fixture slot carries our meeting and completed=0', slot0?.meetings?.length === 1 && slot0?.completed === 0)

  console.log('\n[arrival toggles]')
  const p1Res = await staff(`${API}/${meeting.id}`, jsonPatch({ sponsorArrived: true }))
  const p1 = await p1Res.json().catch(() => ({}))
  check('PATCH sponsorArrived:true → 200 with ISO timestamp', p1Res.status === 200 && typeof p1.sponsorArrivedAt === 'string' && !Number.isNaN(Date.parse(p1.sponsorArrivedAt)), `status ${p1Res.status} body ${JSON.stringify(p1)}`)
  check('response shape: sponsorMeetingId + null buyerArrivedAt', p1.sponsorMeetingId === meeting.id && p1.buyerArrivedAt === null)
  const p2 = await (await staff(`${API}/${meeting.id}`, jsonPatch({ buyerArrived: true }))).json().catch(() => ({}))
  check('PATCH buyerArrived:true keeps the sponsor timestamp', typeof p2.buyerArrivedAt === 'string' && p2.sponsorArrivedAt === p1.sponsorArrivedAt)
  let after = await (await staff(API)).json().catch(() => null)
  let row = findMeeting(after, meeting.id)
  check('follow-up GET reflects both arrivals', !!row?.sponsorArrivedAt && !!row?.buyerArrivedAt)
  const slotAfter = after?.days?.flatMap(d => d.slots ?? []).find(s => s.timeBlockId === tb.id)
  check('fixture slot completed=1 after both ticks', slotAfter?.completed === 1)
  const p3 = await (await staff(`${API}/${meeting.id}`, jsonPatch({ buyerArrived: false }))).json().catch(() => ({}))
  check('PATCH buyerArrived:false clears the timestamp', p3.buyerArrivedAt === null && typeof p3.sponsorArrivedAt === 'string')
  after = await (await staff(API)).json().catch(() => null)
  row = findMeeting(after, meeting.id)
  check('follow-up GET reflects the cleared buyer arrival', !!row && row.buyerArrivedAt === null && !!row.sponsorArrivedAt)

  console.log('\n[notes round-trip]')
  const n1 = await (await staff(`${API}/${meeting.id}`, jsonPatch({ notes: '  rep running late  ' }))).json().catch(() => ({}))
  check('PATCH notes trims and returns the note', n1.notes === 'rep running late', JSON.stringify(n1.notes))
  check('notes PATCH leaves arrival flags untouched', typeof n1.sponsorArrivedAt === 'string' && n1.buyerArrivedAt === null)
  after = await (await staff(API)).json().catch(() => null)
  row = findMeeting(after, meeting.id)
  check('follow-up GET returns the note', row?.notes === 'rep running late')
  const n2 = await (await staff(`${API}/${meeting.id}`, jsonPatch({ notes: null }))).json().catch(() => ({}))
  check('PATCH notes:null clears the note', n2.notes === null)

  console.log('\n[validation errors]')
  const empty = await staff(`${API}/${meeting.id}`, jsonPatch({}))
  check('PATCH {} → 400', empty.status === 400, `got ${empty.status}`)
  const nonBool = await staff(`${API}/${meeting.id}`, jsonPatch({ sponsorArrived: 'yes' }))
  check('PATCH non-boolean sponsorArrived → 400', nonBool.status === 400, `got ${nonBool.status}`)
  const badNotes = await staff(`${API}/${meeting.id}`, jsonPatch({ notes: 42 }))
  check('PATCH non-string notes → 400', badNotes.status === 400, `got ${badNotes.status}`)
  const bogusRes = await staff(`${API}/${PREFIX}bogus-${stamp}`, jsonPatch({ sponsorArrived: true }))
  const bogus = await bogusRes.json().catch(() => ({}))
  check('PATCH bogus id → 404 MEETING_NOT_FOUND', bogusRes.status === 404 && bogus.code === 'MEETING_NOT_FOUND', `status ${bogusRes.status} code ${bogus.code}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
