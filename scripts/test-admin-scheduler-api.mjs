#!/usr/bin/env node
// API integration test for the ADMIN Companies scheduler routes (apps/web,
// /api/admin/scheduler/*).
//
// Exercises auth gating + the full HTTP lifecycle (companies → matrix →
// availability → assign → conflict → reschedule → cancel) against a running
// admin dev server (repo-standard :3000; override with SMOKE_BASE_URL when
// the port is taken, e.g. SMOKE_BASE_URL=http://localhost:3200). Fixtures (a
// throwaway sponsor + attendee + two far-future time blocks + APPROVED
// requests, ids prefixed 'adm-sched-api-') are created and removed via Prisma
// against the SAME db the server uses, so the test is hermetic and the DB is
// left as found.
//
//   node scripts/test-admin-scheduler-api.mjs           # server already running
//   node scripts/test-admin-scheduler-api.mjs --start   # boot next dev, then kill it
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
const API = `${BASE}/api/admin/scheduler`

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
    return new PrismaClient({ adapter: new PrismaLibSQL(createClient({ url, authToken: token })) })
  }
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
const PREFIX = 'adm-sched-api-'
const stamp = Date.now()
const fid = s => `${PREFIX}${s}-${stamp}`
async function cleanup() {
  await prisma.sponsorMeeting.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {})
  await prisma.meetingRequest.deleteMany({ where: { requesterId: { startsWith: PREFIX } } }).catch(() => {})
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
  const anon = await fetch(`${API}/companies`, { redirect: 'manual' })
  check('anon GET /companies → 401/403', anon.status === 401 || anon.status === 403, `got ${anon.status}`)
  const anonAssign = await fetch(`${API}/meetings/assign`, { ...jsonPost({ requestId: 'x', timeBlockId: 'y', room: 'Table 1' }), redirect: 'manual' })
  check('anon POST /meetings/assign → 401/403', anonAssign.status === 401 || anonAssign.status === 403, `got ${anonAssign.status}`)
  const staff = await login(STAFF.email, STAFF.password)
  check('staff login works', !!staff)
  if (!staff) { console.error('  cannot continue without staff auth'); return }

  console.log('\n[directory + matrix shape]')
  const dirRes = await staff(`${API}/companies`)
  const dir = await dirRes.json().catch(() => null)
  check('GET companies → 200 with array', dirRes.status === 200 && Array.isArray(dir), `status ${dirRes.status}`)
  const first = Array.isArray(dir) ? dir[0] : null
  check('directory rows carry id/name/fillRate', !!first && typeof first.id === 'string' && typeof first.name === 'string' && typeof first.fillRate === 'number')
  if (!first) return
  const mxRes = await staff(`${API}/companies/${first.id}`)
  const mx = await mxRes.json().catch(() => ({}))
  check('GET companies/[id] → 200', mxRes.status === 200, `got ${mxRes.status}`)
  check('matrix shape: sponsor + days/bank/pending arrays',
    mx.sponsor?.id === first.id && Array.isArray(mx.days) && Array.isArray(mx.bank) && Array.isArray(mx.pending))
  check('matrix rooms length 9 / slotCapacity 1 (exclusive slots)', mx.rooms?.length === 9 && mx.slotCapacity === 1,
    `rooms=${mx.rooms?.length} cap=${mx.slotCapacity}`)

  console.log('\n[availability validation]')
  check('availability with bogus requestId → 404', (await staff(`${API}/availability?requestId=${PREFIX}bogus`)).status === 404)
  check('availability with missing requestId → 400', (await staff(`${API}/availability`)).status === 400)

  // Hermetic fixtures against the SAME db the server uses: a fresh sponsor in
  // the ACTIVE conference plus two far-future time blocks nothing else books.
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const sponsor = await prisma.sponsor.create({ data: { id: fid('sponsor'), conferenceId: confId, name: 'Adm Sched API Test Co', tier: 'GOLD' } })
  const user = await prisma.user.create({ data: { id: fid('user'), email: `${PREFIX}u-${stamp}@example.com`, name: 'Adm Sched API Test User', role: 'ATTENDEE' } })
  const tb1 = await prisma.timeBlock.create({ data: { id: fid('tb-1'), conferenceId: confId, startsAt: new Date('2031-03-10T14:00:00Z'), endsAt: new Date('2031-03-10T14:30:00Z') } })
  const tb2 = await prisma.timeBlock.create({ data: { id: fid('tb-2'), conferenceId: confId, startsAt: new Date('2031-03-10T15:00:00Z'), endsAt: new Date('2031-03-10T15:30:00Z') } })
  const userB = await prisma.user.create({ data: { id: fid('user-b'), email: `${PREFIX}ub-${stamp}@example.com`, name: 'Adm Sched API Test User B', role: 'ATTENDEE' } })
  const reqA = await prisma.meetingRequest.create({ data: { id: fid('req-a'), requesterId: user.id, targetSponsorId: sponsor.id, status: 'APPROVED' } })
  const reqA2 = await prisma.meetingRequest.create({ data: { id: fid('req-a2'), requesterId: user.id, targetSponsorId: sponsor.id, status: 'APPROVED' } })
  const reqB = await prisma.meetingRequest.create({ data: { id: fid('req-b'), requesterId: userB.id, targetSponsorId: sponsor.id, status: 'APPROVED' } })

  console.log('\n[availability → assign → conflict]')
  const availRes = await staff(`${API}/availability?requestId=${reqA.id}`)
  const avail = await availRes.json().catch(() => ({}))
  const slot = avail.days?.flatMap(d => d.slots).find(s => s.timeBlockId === tb1.id)
  check('availability includes the fixture slot as available', availRes.status === 200 && slot?.available === true, `status ${availRes.status}`)
  const room = slot?.rooms?.find(r => r.available)?.name
  check('availability offers a free room in the fixture slot', !!room)
  if (!slot || !room) return
  const assignRes = await staff(`${API}/meetings/assign`, jsonPost({ requestId: reqA.id, timeBlockId: tb1.id, room }))
  const assign = await assignRes.json().catch(() => ({}))
  const meetingId = assign?.id ?? assign?.meeting?.id
  check('POST assign → 200 with a meeting id', assignRes.status === 200 && !!meetingId, `status ${assignRes.status}`)
  const dupRes = await staff(`${API}/meetings/assign`, jsonPost({ requestId: reqA2.id, timeBlockId: tb2.id, room }))
  const dup = await dupRes.json().catch(() => ({}))
  check('assign a 2nd request for the same pair → 409 ALREADY_SCHEDULED', dupRes.status === 409 && dup.code === 'ALREADY_SCHEDULED', `status ${dupRes.status} code ${dup.code}`)
  // Slots are exclusive: another attendee into the SAME block (even a
  // different table) → 409 SPONSOR_FULL.
  const fullRes = await staff(`${API}/meetings/assign`, jsonPost({ requestId: reqB.id, timeBlockId: tb1.id, room: 'Table 2' }))
  const full = await fullRes.json().catch(() => ({}))
  check('assign B into the booked block → 409 SPONSOR_FULL', fullRes.status === 409 && full.code === 'SPONSOR_FULL', `status ${fullRes.status} code ${full.code}`)
  if (!meetingId) return

  console.log('\n[reschedule → cancel]')
  const reschedRes = await staff(`${API}/meetings/${meetingId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timeBlockId: tb2.id, room }) })
  check('PATCH reschedule to the other fixture slot → 200', reschedRes.status === 200, `got ${reschedRes.status}`)
  const cancelRes = await staff(`${API}/meetings/${meetingId}/cancel`, jsonPost({ preserveRequest: true, reason: 'Scheduling conflict' }))
  const cancel = await cancelRes.json().catch(() => ({}))
  check('POST cancel(preserve) → 200 with preserved:true', cancelRes.status === 200 && cancel.preserved === true, `status ${cancelRes.status}`)
  const mx2 = await (await staff(`${API}/companies/${sponsor.id}`)).json().catch(() => ({}))
  check('matrix shows the candidate back in the bank', !!mx2.bank?.find(b => b.requestId === reqA.id))
  const recancel = await staff(`${API}/meetings/${meetingId}/cancel`, jsonPost({ preserveRequest: true }))
  check('cancel an already-cancelled meeting → non-2xx', recancel.status >= 400, `got ${recancel.status}`)

  // ── POST /api/auto-schedule — Companies-tab scope (all tiers) ──
  // The Companies button pulls its WHOLE unscheduled bank, including Best Fit;
  // the default (no priorities) still excludes Best Fit for the requests board.
  console.log('\n[auto-schedule scope]')
  const sponsorAS = await prisma.sponsor.create({ data: { id: fid('sponsor-as'), conferenceId: confId, name: 'Adm Sched API AS Co', tier: 'GOLD' } })
  const userAS = await prisma.user.create({ data: { id: fid('user-as'), email: `${PREFIX}uas-${stamp}@example.com`, name: 'Adm Sched API AS User', role: 'ATTENDEE' } })
  await prisma.timeBlock.create({ data: { id: fid('tb-as'), conferenceId: confId, startsAt: new Date('2031-03-11T14:00:00Z'), endsAt: new Date('2031-03-11T14:30:00Z') } })
  const reqAS = await prisma.meetingRequest.create({ data: { id: fid('req-as'), requesterId: userAS.id, targetSponsorId: sponsorAS.id, status: 'APPROVED', priority: 'BEST_FIT' } })
  const asUrl = `${BASE}/api/auto-schedule`
  const planned = (data) => (data.scheduled ?? []).some(s => s.requestId === reqAS.id)

  const defRes = await staff(asUrl, jsonPost({ dryRun: true, sponsorId: sponsorAS.id, statuses: ['APPROVED'] }))
  const def = await defRes.json().catch(() => ({}))
  check('default scope (no priorities) does NOT plan the Best Fit request', defRes.status === 200 && !planned(def), `status ${defRes.status} planned ${planned(def)}`)

  const allRes = await staff(asUrl, jsonPost({ dryRun: true, sponsorId: sponsorAS.id, statuses: ['APPROVED'], priorities: ['BEST_FIT', 'MED', 'LOW'] }))
  const all = await allRes.json().catch(() => ({}))
  check('all-tiers scope plans the Best Fit request (pull ALL unscheduled)', allRes.status === 200 && planned(all), `status ${allRes.status} planned ${planned(all)}`)

  const badRes = await staff(asUrl, jsonPost({ sponsorId: sponsorAS.id, priorities: ['NONSENSE'] }))
  check('invalid priorities → 400', badRes.status === 400, `got ${badRes.status}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ all admin-scheduler API checks passed' : `❌ ${failures} check(s) failed`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
