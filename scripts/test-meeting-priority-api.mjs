#!/usr/bin/env node
// API integration test for PRIORITY scheduling (apps/meetings).
//
// Covers: the creation route persists `priority`; the staff auto-schedule route
// is auth-gated and fills Best Fit → Med → Low (dry-run preview + real apply),
// against a running dev server on :3002. Uses an isolated throwaway sponsor so
// the batch scheduler only ever touches this test's fixtures. Cleans up fully.
//
//   node scripts/test-meeting-priority-api.mjs           # server already on :3002
//   node scripts/test-meeting-priority-api.mjs --start   # boot next dev, then kill it
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
const created = { userIds: [], sponsorIds: [] }
async function cleanup() {
  if (created.userIds.length) {
    await prisma.sponsorMeeting.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => {})
    await prisma.meetingRequest.deleteMany({ where: { requesterId: { in: created.userIds } } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  }
  for (const id of created.sponsorIds) await prisma.sponsor.delete({ where: { id } }).catch(() => {})
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
  const anon = await fetch(`${BASE}/api/staff/meetings/auto-schedule`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', redirect: 'manual' })
  check('anon POST auto-schedule → 401', anon.status === 401, `got ${anon.status}`)
  const attFetch = await login(ATTENDEE.email, ATTENDEE.password)
  check('attendee login works', !!attFetch)
  if (attFetch) {
    const forbidden = await attFetch(`${BASE}/api/staff/meetings/auto-schedule`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    check('non-staff POST auto-schedule → 403', forbidden.status === 403, `got ${forbidden.status}`)
  }
  const staff = await login(STAFF.email, STAFF.password)
  check('staff login works', !!staff)
  if (!staff) { console.error('  cannot continue without staff auth'); return }

  // Isolated fixtures: a throwaway sponsor + three attendees at each tier.
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  const blocks = await prisma.timeBlock.findMany({ where: { conferenceId: confId }, orderBy: { startsAt: 'asc' }, take: 2, select: { id: true } })
  check('conference has ≥2 time blocks', blocks.length >= 2)
  const stamp = Date.now()
  const skills = ['Analytics & Reporting', 'Subscription Management']
  const sponsor = await prisma.sponsor.create({ data: { conferenceId: confId, name: `Prio API Co ${stamp}`, tier: 'GOLD', solutionsSeeking: JSON.stringify(skills) } })
  created.sponsorIds.push(sponsor.id)
  const offering = JSON.stringify(skills)
  const mk = async (tag) => {
    const u = await prisma.user.create({ data: { email: `test-prioapi-${tag}-${stamp}@example.com`, name: `Prio API ${tag}`, role: 'ATTENDEE', solutionsOffering: offering } })
    created.userIds.push(u.id)
    return u
  }
  const uLow = await mk('low'); const uMed = await mk('med'); const uBest = await mk('best')
  // Created oldest→newest as LOW, MED, BEST so createdAt order is the reverse of priority order.
  await prisma.meetingRequest.create({ data: { requesterId: uLow.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'LOW' } })
  await prisma.meetingRequest.create({ data: { requesterId: uMed.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'MED' } })
  await prisma.meetingRequest.create({ data: { requesterId: uBest.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority: 'BEST_FIT' } })

  console.log('\n[creation route persists priority]')
  if (attFetch) {
    // A logged-in attendee sends a request tagged LOW; the row must store it.
    const createRes = await attFetch(`${BASE}/api/meeting-requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetSponsorId: sponsor.id, priority: 'LOW', message: 'prio-api' }) })
    check('attendee POST /api/meeting-requests → 200', createRes.status === 200, `got ${createRes.status}`)
    const row = await createRes.json().catch(() => ({}))
    check('created request carries priority LOW', row.priority === 'LOW', `got ${row.priority}`)
    if (row.requesterId) created.userIds.push(row.requesterId) // Steph — dedupe-safe cleanup filter
    // Remove just this row so it does not pollute the sponsor's auto-schedule set.
    if (row.id) await prisma.meetingRequest.delete({ where: { id: row.id } }).catch(() => {})
  }

  console.log('\n[auto-schedule: dry run preview]')
  const dryRes = await staff(`${BASE}/api/staff/meetings/auto-schedule`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sponsorId: sponsor.id, dryRun: true }) })
  const dry = await dryRes.json().catch(() => ({}))
  check('POST auto-schedule dryRun → 200', dryRes.status === 200, `got ${dryRes.status}`)
  check('dryRun echoes flag + plans 3', dry.dryRun === true && dry.scheduled?.length === 3, `sched=${dry.scheduled?.length}`)
  const order = (dry.scheduled ?? []).map(s => s.priority)
  check('plan order Best Fit → Med → Low', order[0] === 'BEST_FIT' && order[1] === 'MED' && order[2] === 'LOW', order.join(','))
  const before = await prisma.sponsorMeeting.count({ where: { userId: { in: [uLow.id, uMed.id, uBest.id] } } })
  check('dryRun persisted nothing', before === 0, `got ${before}`)

  console.log('\n[auto-schedule: apply]')
  const applyRes = await staff(`${BASE}/api/staff/meetings/auto-schedule`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sponsorId: sponsor.id }) })
  const apply = await applyRes.json().catch(() => ({}))
  check('POST auto-schedule apply → 200', applyRes.status === 200, `got ${applyRes.status}`)
  check('apply scheduled all 3', apply.scheduled?.length === 3, `got ${apply.scheduled?.length}`)
  const after = await prisma.sponsorMeeting.count({ where: { userId: { in: [uLow.id, uMed.id, uBest.id] }, status: 'CONFIRMED' } })
  check('three CONFIRMED meetings persisted', after === 3, `got ${after}`)
  const bestEntry = (apply.scheduled ?? []).find(s => s.userId === uBest.id)
  check('Best Fit got the first room (Table 1)', bestEntry?.room === 'Table 1', `room=${bestEntry?.room}`)
}

main()
  .catch(err => { console.error('FATAL:', err?.stack ?? err); failures++ })
  .finally(async () => {
    await cleanup()
    if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
    console.log(`\n${failures === 0 ? '✅ all priority API checks passed' : `❌ ${failures} check(s) failed`}`)
    process.exit(failures === 0 ? 0 : 1)
  })
