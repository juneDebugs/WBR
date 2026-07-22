#!/usr/bin/env node
// End-to-end smoke test for the sponsor portal browse guarantee, over HTTP.
//
// Logs into the sponsor app with seeded credentials via the NextAuth
// credentials flow, then hits /api/browse with filter combinations —
// including long-form Solutions chips that used to return zero results —
// and asserts every combination returns at least 20 matches.
//
//   node scripts/smoketest-browse-api.mjs           # use a server already running on :3003
//   node scripts/smoketest-browse-api.mjs --start   # boot `next dev` on :3003 against the
//                                                   # local dev.db (Turso vars stripped), then kill it
//
// Env overrides: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD.

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3003'
const EMAIL = process.env.SMOKE_EMAIL ?? 'sponsor@test.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'password123'
const MIN = 20

let serverProc = null
let failures = 0

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Minimal cookie jar ──────────────────────────────────────────────────────

const jar = new Map()
function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';')
    const eq = pair.indexOf('=')
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1))
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}
async function jarFetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: { ...init.headers, cookie: cookieHeader() },
  })
  storeCookies(res)
  return res
}

// ─── Server lifecycle ────────────────────────────────────────────────────────

async function serverUp() {
  try {
    const res = await fetch(`${BASE}/login`, { redirect: 'manual' })
    return res.status < 500
  } catch {
    return false
  }
}

async function waitFor(cond, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) {
      console.error(`No server at ${BASE}. Start one (pnpm dev:sponsor) or pass --start.`)
      process.exit(2)
    }
    console.log('Starting sponsor dev server against local dev.db (Turso vars stripped)...')
    const env = { ...process.env }
    delete env.TURSO_DATABASE_URL
    delete env.TURSO_AUTH_TOKEN
    env.DATABASE_URL = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
    serverProc = spawn('npx', ['next', 'dev', '-p', '3003'], {
      cwd: join(ROOT, 'apps/sponsor'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    serverProc.stdout.on('data', () => {})
    serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'sponsor dev server')
    console.log('Server is up.')
  }

  // ── Login (NextAuth credentials flow) ──
  console.log(`\nLogging in as ${EMAIL}`)
  const csrfRes = await jarFetch(`${BASE}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  check('csrf token issued', Boolean(csrfToken))

  const loginRes = await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, json: 'true' }),
  })
  check('login accepted', loginRes.status === 200 || loginRes.status === 302, `status ${loginRes.status}`)
  const hasSession = [...jar.keys()].some(k => k.includes('next-auth.session-token'))
  check('session cookie set', hasSession, 'wrong credentials? reseed with pnpm db:seed')
  if (!hasSession) return

  // ── Filter combinations over the wire ──
  const combos = [
    { desc: 'long-form solutions chip (previously 0 results)', params: { seeking: 'Site Search Solutions' } },
    { desc: 'CRM long-form chip', params: { seeking: 'Customer Relationship Management (CRM) Solutions' } },
    { desc: 'solutions + size + revenue', params: { seeking: 'POS Solutions', sizes: 'ENTERPRISE', revenues: '250M+' } },
    { desc: 'role + jobFunction', params: { roles: 'SPEAKER', jobFunctions: 'Merchandising' } },
    { desc: 'industry + solutions', params: { industries: 'Luxury', seeking: 'Sustainability Solutions' } },
    { desc: 'everything at once', params: { roles: 'ATTENDEE', jobFunctions: 'Marketing', industries: 'Skincare', sizes: 'STARTUP', revenues: '<1M', seeking: 'Predictive Analytics' } },
  ]

  for (const { desc, params } of combos) {
    const qs = new URLSearchParams({ ...params, limit: '50' })
    const res = await jarFetch(`${BASE}/api/browse?${qs}`)
    console.log(`\n[${desc}]`)
    check('HTTP 200', res.status === 200, `status ${res.status}`)
    if (res.status !== 200) continue
    const body = await res.json()
    check(`total ≥ ${MIN}`, body.total >= MIN, `total ${body.total}`)
    check('page non-empty', Array.isArray(body.people) && body.people.length > 0)
    check('page ≤ total', body.people.length <= body.total)
    check('strict/similar reported', Number.isInteger(body.strictCount) && Number.isInteger(body.similarCount))
    check('strict + similar = total', body.strictCount + body.similarCount === body.total,
      `${body.strictCount} + ${body.similarCount} ≠ ${body.total}`)
  }

  // ── Unfiltered baseline ──
  const res = await jarFetch(`${BASE}/api/browse?limit=5`)
  const body = await res.json()
  console.log('\n[no filters]')
  check('baseline pool large', body.total >= MIN, `total ${body.total}`)
  check('pagination hasMore', body.hasMore === true)
}

try {
  await main()
} finally {
  if (serverProc) {
    console.log('\nStopping dev server...')
    try { process.kill(-serverProc.pid, 'SIGTERM') } catch {}
  }
}

console.log(failures === 0 ? '\nSMOKE TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
