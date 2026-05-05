#!/usr/bin/env node
/**
 * Sponsor Portal – Login Speed Benchmark
 *
 * Compares:
 *  A) Legacy NextAuth flow  (3 HTTP requests: CSRF + POST + session)
 *  B) Fast /api/login       (1 HTTP request)
 *
 * Usage:  node apps/sponsor/scripts/bench-login.mjs [iterations]
 */

const BASE = 'http://localhost:3003'
const EMAIL = 'june@tailor.tech'
const PASSWORD = 'admin123'
const ITERATIONS = parseInt(process.argv[2] ?? '20', 10)

function stats(arr) {
  arr.sort((a, b) => a - b)
  const sum = arr.reduce((s, v) => s + v, 0)
  const mean = sum / arr.length
  const p50 = arr[Math.floor(arr.length * 0.5)]
  const p95 = arr[Math.floor(arr.length * 0.95)]
  const min = arr[0]
  const max = arr[arr.length - 1]
  return { mean: mean.toFixed(1), p50: p50.toFixed(1), p95: p95.toFixed(1), min: min.toFixed(1), max: max.toFixed(1) }
}

function fmt(label, s) {
  return `  ${label.padEnd(26)} avg ${s.mean.padStart(7)}ms  |  p50 ${s.p50.padStart(7)}ms  |  p95 ${s.p95.padStart(7)}ms  |  min ${s.min.padStart(6)}ms  |  max ${s.max.padStart(7)}ms`
}

// ─── Legacy NextAuth flow ───────────────────────────────────────────────────

async function benchLegacy() {
  const times = []
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now()

    const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
    const { csrfToken } = await csrfRes.json()
    const cookies = csrfRes.headers.getSetCookie?.() ?? []
    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ')

    const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieStr },
      body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${BASE}/dashboard`, json: 'true' }),
      redirect: 'manual',
    })
    const loginCookies = loginRes.headers.getSetCookie?.() ?? []
    const allCookies = [...cookies, ...loginCookies].map(c => c.split(';')[0]).join('; ')

    await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: allCookies } })

    times.push(performance.now() - t0)
  }
  return times
}

// ─── Fast single-request flow ───────────────────────────────────────────────

async function benchFast() {
  const times = []
  const serverTimes = []
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now()
    const res = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    times.push(performance.now() - t0)

    const data = await res.json()
    if (data.ms) serverTimes.push(parseFloat(data.ms))

    if (i === 0 && !data.user?.email) {
      console.error('  ⚠  Fast login may have failed:', JSON.stringify(data))
    }
  }
  return { times, serverTimes }
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔐 Sponsor Portal Login Benchmark`)
  console.log(`   ${ITERATIONS} iterations  •  ${EMAIL}  •  ${BASE}\n`)
  console.log('─'.repeat(90))

  // Warm up
  try {
    await fetch(`${BASE}/api/auth/csrf`)
    await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
  } catch (e) {
    console.error(`\n✖  Cannot reach ${BASE} – is the sponsor app running?\n`)
    process.exit(1)
  }

  console.log('\n  A) Legacy NextAuth flow (3 requests: CSRF → credentials POST → session):')
  const legacyTimes = await benchLegacy()
  console.log(fmt('Total (3 requests)', stats(legacyTimes)))

  console.log('\n  B) Fast /api/login (single request):')
  const { times: fastTimes, serverTimes } = await benchFast()
  console.log(fmt('Total (client)', stats(fastTimes)))
  if (serverTimes.length) {
    console.log(fmt('Server-side only', stats(serverTimes)))
  }

  // Speedup
  const legacyP50 = parseFloat(stats(legacyTimes).p50)
  const fastP50 = parseFloat(stats(fastTimes).p50)
  const speedup = (legacyP50 / fastP50).toFixed(1)
  console.log(`\n  Speedup: ${speedup}x faster (p50: ${legacyP50}ms → ${fastP50}ms)`)

  const target = 20
  if (fastP50 <= target) {
    console.log(`  ✓ Target met: p50 ${fastP50}ms ≤ ${target}ms`)
  } else {
    console.log(`  ✗ Target miss: p50 ${fastP50}ms > ${target}ms (server-side p50: ${serverTimes.length ? stats(serverTimes).p50 : '?'}ms)`)
  }

  console.log('\n' + '─'.repeat(90) + '\n')
}

main()
