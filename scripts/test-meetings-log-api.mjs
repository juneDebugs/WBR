#!/usr/bin/env node
// API integration test for the Meetings Log route (apps/web,
// GET /api/admin/scheduler/log).
//
// Asserts auth gating (anon is refused) and, once authed as staff, that the
// route returns a well-formed MeetingLog payload: a newest-first entries array
// and a counts object whose per-kind tallies sum to `all`. Read-only — it makes
// no DB writes, so it needs no fixtures or cleanup and leaves the DB as found.
//
//   node scripts/test-meetings-log-api.mjs           # server already running
//   node scripts/test-meetings-log-api.mjs --start   # boot next dev, then kill it
//
// Override the base URL when :3000 is taken: SMOKE_BASE_URL=http://localhost:3200
//
// PII discipline: prints ids/counts only.

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const PORT = new URL(BASE).port || '3000'
const STAFF = { email: process.env.SMOKE_STAFF_EMAIL ?? 'wbr@test.com', password: process.env.SMOKE_STAFF_PASSWORD ?? 'password123' }
const API = `${BASE}/api/admin/scheduler`

let serverProc = null, failures = 0
const check = (name, cond, detail = '') => cond ? console.log(`  ✓ ${name}`) : (failures++, console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`))

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
  const anon = await fetch(`${API}/log`, { redirect: 'manual' })
  check('anon GET /log → 401/403', anon.status === 401 || anon.status === 403, `got ${anon.status}`)

  const staff = await login(STAFF.email, STAFF.password)
  check('staff login works', !!staff)
  if (!staff) { console.error('  cannot continue without staff auth'); return }

  console.log('\n[payload shape]')
  const res = await staff(`${API}/log`)
  check('staff GET /log → 200', res.status === 200, `got ${res.status}`)
  const body = await res.json().catch(() => null)
  check('body is an object with entries[] + counts{}', !!body && Array.isArray(body.entries) && !!body.counts,
    body ? `entries=${typeof body.entries} counts=${typeof body.counts}` : 'no body')
  if (!body || !Array.isArray(body.entries) || !body.counts) return

  const kinds = ['MEETING_NOTE', 'FLOOR_NOTE', 'CANCELLATION', 'REQUEST_MESSAGE']
  check('counts has all + every kind key', typeof body.counts.all === 'number' && kinds.every(k => typeof body.counts[k] === 'number'),
    JSON.stringify(body.counts))
  const sum = kinds.reduce((n, k) => n + body.counts[k], 0)
  check('per-kind counts sum to counts.all', sum === body.counts.all, `sum=${sum} all=${body.counts.all}`)
  check('counts.all matches entries length', body.counts.all === body.entries.length, `all=${body.counts.all} len=${body.entries.length}`)

  // Validate entry shape + newest-first ordering when any notes exist.
  if (body.entries.length > 0) {
    const e = body.entries[0]
    const shapeOk = typeof e.id === 'string' && kinds.includes(e.kind) &&
      typeof e.text === 'string' && e.text.length > 0 && typeof e.title === 'string' &&
      typeof e.timestamp === 'string' && !Number.isNaN(Date.parse(e.timestamp))
    check('first entry has the expected shape', shapeOk, JSON.stringify({ id: typeof e.id, kind: e.kind, text: typeof e.text }))
    let ordered = true
    for (let i = 1; i < body.entries.length; i++) if (body.entries[i - 1].timestamp < body.entries[i].timestamp) { ordered = false; break }
    check('entries are newest-first', ordered)
    check('every entry kind is valid', body.entries.every(x => kinds.includes(x.kind)))
    check('every entry text is non-empty', body.entries.every(x => typeof x.text === 'string' && x.text.trim().length > 0))
  } else {
    console.log('  (no notes in the active conference — shape checks on entries skipped)')
  }
}

try {
  await main()
} catch (e) {
  failures++; console.error('  ✗ unexpected error:', e)
} finally {
  if (serverProc) { try { process.kill(-serverProc.pid) } catch {} }
}

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
