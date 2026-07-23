#!/usr/bin/env node
// API integration test for the meeting-engine STAFF console routes (apps/meetings).
//
// Exercises auth gating + the full HTTP lifecycle (companies → schedule →
// availability → assign → conflict → reschedule → cancel) against a running
// dev server on :3002. Fixtures (a throwaway attendee + APPROVED request) are
// created/removed via Prisma so the DB is left as found.
//
//   node scripts/test-meeting-engine-api.mjs           # server already on :3002
//   node scripts/test-meeting-engine-api.mjs --start   # boot next dev, then kill it
//
// PII discipline: prints ids/counts only.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3002'
const PORT = new URL(BASE).port || '3002'
const STAFF = { email: process.env.SMOKE_STAFF_EMAIL ?? 'wbr@test.com', password: process.env.SMOKE_STAFF_PASSWORD ?? 'password123' }
const ATTENDEE = { email: process.env.SMOKE_EMAIL ?? 'stephcurry@test.com', password: process.env.SMOKE_PASSWORD ?? 'password123' }

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

const prisma = makePrisma()
const created = { userIds: [] }
async function cleanup() {
  if (created.userIds.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => {})
    await prisma.meetingRequest.deleteMany({ where: { requesterId: { in: created.userIds } } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  }
  await prisma.$disconnect().catch(() => {})
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) { console.error(`No server at ${BASE}. Start one (cd apps/meetings && npx next dev -p ${PORT}) or pass --start.`); process.exit(2) }
    console.log(`Starting meetings dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], { cwd: join(ROOT, 'apps/meetings'), env: { ...process.env, NEXTAUTH_URL: BASE }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    serverProc.stdout.on('data', () => {}); serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 180_000, 'meetings dev server')
    console.log('Server is up.')
  }

  console.log('\n[auth gating]')
  const anon = await fetch(`${BASE}/api/staff/companies`, { redirect: 'manual' })
  check('anon GET /api/staff/companies → 401', anon.status === 401, `got ${anon.status}`)
  const attFetch = await login(ATTENDEE.email, ATTENDEE.password)
  check('attendee login works', !!attFetch)
  if (attFetch) {
    const forbidden = await attFetch(`${BASE}/api/staff/companies`)
    check('non-staff GET /api/staff/companies → 403', forbidden.status === 403, `got ${forbidden.status}`)
  }
  const staff = await login(STAFF.email, STAFF.password)
  check('staff login works', !!staff)
  if (!staff) { console.error('  cannot continue without staff auth'); return }

  console.log('\n[directory]')
  const dirRes = await staff(`${BASE}/api/staff/companies`)
  const dir = await dirRes.json().catch(() => ({}))
  check('GET companies → 200 with array', dirRes.status === 200 && Array.isArray(dir.companies), `status ${dirRes.status}`)
  const sponsorId = dir.companies?.[0]?.id
  check('at least one company present', !!sponsorId)
  if (!sponsorId) return

  // Fixture: an attendee + APPROVED request targeting that company.
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const blocks = await prisma.timeBlock.findMany({ where: { conferenceId: confId }, orderBy: { startsAt: 'asc' }, take: 3, select: { id: true } })
  const stamp = Date.now()
  const userA = await prisma.user.create({ data: { email: `test-api-a-${stamp}@example.com`, name: 'API Test A', role: 'ATTENDEE' } })
  const userB = await prisma.user.create({ data: { email: `test-api-b-${stamp}@example.com`, name: 'API Test B', role: 'ATTENDEE' } })
  created.userIds.push(userA.id, userB.id)
  const reqA = await prisma.meetingRequest.create({ data: { requesterId: userA.id, targetSponsorId: sponsorId, status: 'APPROVED' } })
  const reqB = await prisma.meetingRequest.create({ data: { requesterId: userB.id, targetSponsorId: sponsorId, status: 'APPROVED' } })

  console.log('\n[schedule + availability]')
  const schedRes = await staff(`${BASE}/api/staff/companies/${sponsorId}/schedule`)
  const sched = await schedRes.json().catch(() => ({}))
  check('GET schedule → 200', schedRes.status === 200)
  check('bank includes the fixture request', !!sched.bank?.find(b => b.requestId === reqA.id))
  const availRes = await staff(`${BASE}/api/staff/companies/${sponsorId}/availability?requestId=${reqA.id}`)
  const avail = await availRes.json().catch(() => ({}))
  const freeSlot = avail.days?.flatMap(d => d.slots).find(s => s.available)
  check('availability returns a bookable slot', !!freeSlot, 'no free slot for fixture attendee')
  check('missing requestId → 400', (await staff(`${BASE}/api/staff/companies/${sponsorId}/availability`)).status === 400)

  console.log('\n[assign / conflict / reschedule / cancel]')
  const assignRes = await staff(`${BASE}/api/staff/meetings/assign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: reqA.id, timeBlockId: freeSlot.timeBlockId, room: 'Table 1' }) })
  const assign = await assignRes.json().catch(() => ({}))
  check('POST assign → 200 with a meeting', assignRes.status === 200 && !!assign.meeting?.id)
  const meetingId = assign.meeting?.id

  // Assign B to the same room+slot → 409 ROOM_CONFLICT.
  const conflictRes = await staff(`${BASE}/api/staff/meetings/assign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: reqB.id, timeBlockId: freeSlot.timeBlockId, room: 'Table 1' }) })
  check('assign B to same room/slot → 409 ROOM_CONFLICT', conflictRes.status === 409, `got ${conflictRes.status}`)

  // Reschedule A to a different block.
  const otherBlock = blocks.map(b => b.id).find(id => id !== freeSlot.timeBlockId)
  if (meetingId && otherBlock) {
    const reschedRes = await staff(`${BASE}/api/staff/meetings/${meetingId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timeBlockId: otherBlock, room: 'Table 2' }) })
    check('PATCH reschedule → 200', reschedRes.status === 200, `got ${reschedRes.status}`)
  }

  // Cancel A with preserve → request returns to the bank.
  if (meetingId) {
    const cancelRes = await staff(`${BASE}/api/staff/meetings/${meetingId}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preserveRequest: true, reason: 'Scheduling conflict' }) })
    const cancel = await cancelRes.json().catch(() => ({}))
    check('POST cancel(preserve) → 200', cancelRes.status === 200 && cancel.preserved === true)
    const sched2 = await (await staff(`${BASE}/api/staff/companies/${sponsorId}/schedule`)).json().catch(() => ({}))
    check('cancelled request is back in the bank', !!sched2.bank?.find(b => b.requestId === reqA.id))
  }
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ all meeting-engine API checks passed' : `❌ ${failures} check(s) failed`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
