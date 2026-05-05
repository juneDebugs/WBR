#!/usr/bin/env node
/**
 * Integration test: /api/login across all 4 apps
 *
 * Tests:
 *  1. Valid credentials → 200 + session cookie + correct user fields
 *  2. Wrong password → 401
 *  3. Non-existent user → 401
 *  4. Missing fields → 400
 *  5. Empty body → 400
 *  6. Role enforcement (web app only)
 *  7. Session cookie works with middleware (protected route returns 200)
 *  8. No cookie → protected route returns 401/redirect
 */

const APPS = [
  { name: 'web',      port: 3000, redirect: '/dashboard', email: 'june@tailor.tech', password: 'admin123', roleCheck: true },
  { name: 'attendee', port: 3001, redirect: '/home',      email: 'june@tailor.tech', password: 'admin123', roleCheck: false },
  { name: 'meetings', port: 3002, redirect: '/',           email: 'june@tailor.tech', password: 'admin123', roleCheck: false },
  { name: 'sponsor',  port: 3003, redirect: '/dashboard',  email: 'june@tailor.tech', password: 'admin123', roleCheck: false },
]

let passed = 0
let failed = 0

function ok(app, test) {
  passed++
  console.log(`  ✓ [${app}] ${test}`)
}

function fail(app, test, detail) {
  failed++
  console.log(`  ✗ [${app}] ${test}: ${detail}`)
}

async function postLogin(port, body) {
  const res = await fetch(`http://localhost:${port}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const cookies = res.headers.getSetCookie?.() ?? []
  const data = await res.json().catch(() => null)
  return { status: res.status, data, cookies }
}

async function testApp(app) {
  const { name, port, email, password } = app
  const base = `http://localhost:${port}`

  // ── Test 1: Valid credentials ──────────────────────────────────────────
  {
    const { status, data, cookies } = await postLogin(port, { email, password })
    if (status === 200) ok(name, 'Valid login → 200')
    else fail(name, 'Valid login → 200', `got ${status}: ${JSON.stringify(data)}`)

    if (data?.user?.email === email) ok(name, 'Response has correct email')
    else fail(name, 'Response has correct email', `got ${JSON.stringify(data?.user)}`)

    if (data?.user?.id) ok(name, 'Response has user id')
    else fail(name, 'Response has user id', `got ${JSON.stringify(data?.user)}`)

    if (data?.user?.role) ok(name, 'Response has role')
    else fail(name, 'Response has role', `got ${JSON.stringify(data?.user)}`)

    const sessionCookie = cookies.find(c => c.includes('session-token'))
    if (sessionCookie) ok(name, 'Session cookie set')
    else fail(name, 'Session cookie set', `cookies: ${cookies.join('; ')}`)

    // ── Test 7: Cookie works with protected API ──────────────────────────
    if (sessionCookie) {
      const cookieStr = sessionCookie.split(';')[0]
      const protectedRes = await fetch(`${base}/api/auth/session`, {
        headers: { Cookie: cookieStr },
      })
      const session = await protectedRes.json().catch(() => null)
      if (session?.user?.email) ok(name, 'Session cookie accepted by /api/auth/session')
      else fail(name, 'Session cookie accepted by /api/auth/session', `got ${JSON.stringify(session)}`)
    }
  }

  // ── Test 2: Wrong password ─────────────────────────────────────────────
  {
    const { status } = await postLogin(port, { email, password: 'wrongpassword' })
    if (status === 401) ok(name, 'Wrong password → 401')
    else fail(name, 'Wrong password → 401', `got ${status}`)
  }

  // ── Test 3: Non-existent user ──────────────────────────────────────────
  {
    const { status } = await postLogin(port, { email: 'nobody@nowhere.com', password: 'test' })
    if (status === 401) ok(name, 'Non-existent user → 401')
    else fail(name, 'Non-existent user → 401', `got ${status}`)
  }

  // ── Test 4: Missing fields ─────────────────────────────────────────────
  {
    const { status: s1 } = await postLogin(port, { email })
    if (s1 === 400) ok(name, 'Missing password → 400')
    else fail(name, 'Missing password → 400', `got ${s1}`)

    const { status: s2 } = await postLogin(port, { password })
    if (s2 === 400) ok(name, 'Missing email → 400')
    else fail(name, 'Missing email → 400', `got ${s2}`)
  }

  // ── Test 5: Empty/invalid body ─────────────────────────────────────────
  {
    const res = await fetch(`http://localhost:${port}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (res.status === 400) ok(name, 'Empty body → 400')
    else fail(name, 'Empty body → 400', `got ${res.status}`)
  }

  // ── Test 6: Role enforcement (web only) ────────────────────────────────
  if (app.roleCheck) {
    // steph@curry.com is an ATTENDEE — should be rejected by web admin
    const { status, data } = await postLogin(port, { email: 'steph@curry.com', password: 'stephcurry' })
    if (status === 403) ok(name, 'Non-admin role → 403')
    else fail(name, 'Non-admin role → 403', `got ${status}: ${JSON.stringify(data)}`)
  }

  // ── Test 8: No cookie → protected route blocked ───────────────────────
  {
    const res = await fetch(`${base}/api/auth/session`)
    // Without auth, NextAuth session endpoint returns {} (empty session) or 401
    // The middleware blocks /api/* with 401 for unauthenticated users
    // But /api/auth is whitelisted, so session returns empty {}
    const data = await res.json().catch(() => null)
    if (!data?.user) ok(name, 'No cookie → empty session')
    else fail(name, 'No cookie → empty session', `got user: ${JSON.stringify(data?.user)}`)
  }

  // ── Test: Second valid account ─────────────────────────────────────────
  {
    const { status, data } = await postLogin(port, { email: 'staff@wbr.com', password: 'staff123' })
    if (status === 200 && data?.user?.email === 'staff@wbr.com') ok(name, 'Second account (staff) login works')
    else fail(name, 'Second account (staff) login works', `got ${status}: ${JSON.stringify(data)}`)
  }
}

async function main() {
  console.log('\n🔐 Login Integration Tests — All Apps\n')

  for (const app of APPS) {
    console.log(`\n── ${app.name} (port ${app.port}) ──`)
    try {
      await testApp(app)
    } catch (e) {
      fail(app.name, 'APP REACHABLE', e.message)
    }
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
