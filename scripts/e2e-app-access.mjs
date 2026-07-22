#!/usr/bin/env node
// End-to-end proof of the per-app sign-in access matrix, over real HTTP.
//
// For ONE app, boots `next dev` (or uses a server you already have running) and
// POSTs the real login form endpoint (/api/login) for each of the 3 test
// accounts, asserting the HTTP outcome matches the shared access policy:
//   • allowed account  → 200 (session cookie set)
//   • blocked account  → 403 "Unauthorized role"
//   • wrong password   → 401
//
// Usage:
//   node scripts/e2e-app-access.mjs --app web --port 3200 --start
//   node scripts/e2e-app-access.mjs --app sponsor --base http://localhost:3003
//
// --start boots the app (loading its own .env.local like a normal run) and
// tears it down afterwards. Without --start, point --base at a running server.

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const APP = arg('app')
const START = process.argv.includes('--start')
const DEFAULT_PORTS = { web: 3200, meetings: 3202, sponsor: 3203, attendee: 3201 }
if (!APP || !DEFAULT_PORTS[APP]) {
  console.error('Usage: --app <web|meetings|sponsor|attendee> [--port N] [--start] [--base URL]')
  process.exit(2)
}
const PORT = arg('port', String(DEFAULT_PORTS[APP]))
const BASE = arg('base', `http://localhost:${PORT}`)

// Account role → tier. Matches packages/db/src/app-access.ts + the DB seed.
const ACCOUNTS = [
  { label: 'WBR',     email: 'wbr@test.com',     password: 'password123', role: 'ORGANIZER' },
  { label: 'Brand',   email: 'stephcurry@test.com',   password: 'password123', role: 'BRAND' },
  { label: 'Sponsor', email: 'sponsor@test.com', password: 'password123', role: 'SPONSOR' },
]

let failures = 0
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function waitFor(url, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { redirect: 'manual' })
      if (r.status > 0 && r.status < 500) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function postLogin(email, password) {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  })
  return r.status
}

async function run() {
  const policy = await import(join(ROOT, 'packages/db/src/app-access.ts'))
  console.log(`\n▶ App: ${APP}  Base: ${BASE}`)

  const ok = await waitFor(`${BASE}/login`, START ? 150000 : 15000)
  if (!ok) { console.error(`  ✗ server never became ready at ${BASE}/login`); failures++; return }

  for (const a of ACCOUNTS) {
    const allowed = policy.canAccessApp(APP, a.role)
    const status = await postLogin(a.email, a.password)
    if (allowed) {
      check(`${a.label} (${a.role}) can sign in → 200`, status === 200, `got ${status}`)
    } else {
      check(`${a.label} (${a.role}) is blocked → 403`, status === 403, `got ${status}`)
    }
  }

  // A wrong password on an always-allowed account (WBR) must be 401, proving the
  // access gate doesn't mask ordinary credential failures.
  const badStatus = await postLogin('wbr@test.com', 'wrong-password')
  check('WBR with wrong password → 401', badStatus === 401, `got ${badStatus}`)

  // A blocked account with a wrong password should still be blocked (403 before
  // password check on our routes), never 200.
  const blockedAcct = ACCOUNTS.find((a) => !policy.canAccessApp(APP, a.role))
  if (blockedAcct) {
    const s = await postLogin(blockedAcct.email, 'whatever')
    check(`blocked ${blockedAcct.label} never returns 200`, s !== 200, `got ${s}`)
  }
}

async function main() {
  let proc = null
  if (START) {
    console.log(`⏳ Booting ${APP} on :${PORT} …`)
    proc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps', APP),
      env: { ...process.env },
      stdio: ['ignore', 'ignore', 'inherit'],
      detached: true, // own process group so we can kill the whole `next dev` tree
    })
  }
  try {
    await run()
  } finally {
    if (proc) { try { process.kill(-proc.pid) } catch {} try { proc.kill('SIGKILL') } catch {} }
  }
  console.log(`\n${failures === 0 ? `✅ ${APP} PASS` : `❌ ${APP} FAIL (${failures})`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
