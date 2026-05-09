/**
 * Benchmark: Speaker save API (PUT /api/speakers/[id])
 *
 * Tests three scenarios:
 *   1. Metadata-only save (no image)
 *   2. Save with small base64 image (~50KB)
 *   3. Save with large base64 image (~500KB)
 *
 * Usage: npx tsx scripts/benchmark-speaker-save.ts
 */

const BASE_URL = 'http://localhost:3000'
const SPEAKER_ID = 'spk-1'
const ITERATIONS = 20

// --- Auth: get a session cookie via NextAuth credentials login ---

async function getSessionCookie(): Promise<string> {
  // 1. Get CSRF token
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  const cookies = csrfRes.headers.getSetCookie()

  // 2. Sign in with credentials
  const signinRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies.join('; '),
    },
    body: new URLSearchParams({
      csrfToken,
      email: 'june@tailor.tech',
      password: 'admin123',
    }),
    redirect: 'manual',
  })

  // Collect all set-cookie headers from the redirect response
  const allCookies = [...cookies, ...signinRes.headers.getSetCookie()]
  const cookieStr = allCookies
    .map((c) => c.split(';')[0])
    .filter((c, i, a) => {
      const name = c.split('=')[0]
      return a.findIndex((x) => x.split('=')[0] === name) === i
    })
    .join('; ')

  // 3. Follow the redirect to finalize session
  const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: cookieStr },
  })
  const session = await sessionRes.json()
  if (!session?.user) {
    throw new Error('Authentication failed — is the admin app running on port 3000?')
  }

  // Merge any new cookies from session response
  const finalCookies = [...allCookies, ...sessionRes.headers.getSetCookie()]
  return finalCookies
    .map((c) => c.split(';')[0])
    .filter((c, i, a) => {
      const name = c.split('=')[0]
      return a.findIndex((x) => x.split('=')[0] === name) === i
    })
    .join('; ')
}

// --- Generate a fake base64 image of approximate target size ---

function generateFakeBase64Image(targetBytes: number): string {
  // Create a minimal valid JPEG header + padding to reach target size
  // For benchmarking, a data URI with random base64 is sufficient
  const raw = Buffer.alloc(targetBytes, 0x41) // fill with 'A'
  return `data:image/jpeg;base64,${raw.toString('base64')}`
}

// --- Benchmark runner ---

interface BenchmarkResult {
  scenario: string
  times: number[]
  min: number
  max: number
  avg: number
  median: number
  p95: number
}

async function runScenario(
  name: string,
  cookie: string,
  payload: Record<string, string>,
  iterations: number
): Promise<BenchmarkResult> {
  const times: number[] = []

  // Warmup
  await fetch(`${BASE_URL}/api/speakers/${SPEAKER_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(payload),
  })

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const res = await fetch(`${BASE_URL}/api/speakers/${SPEAKER_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(payload),
    })
    const elapsed = performance.now() - start

    if (!res.ok) {
      const body = await res.text()
      console.error(`  Response body: ${body.slice(0, 500)}`)
      throw new Error(`${name} failed (${res.status}): ${body.slice(0, 200)}`)
    }
    await res.json() // drain body
    times.push(elapsed)
  }

  times.sort((a, b) => a - b)
  return {
    scenario: name,
    times,
    min: times[0],
    max: times[times.length - 1],
    avg: times.reduce((s, t) => s + t, 0) / times.length,
    median: times[Math.floor(times.length / 2)],
    p95: times[Math.floor(times.length * 0.95)],
  }
}

function formatMs(ms: number): string {
  return `${ms.toFixed(0)}ms`
}

function printResult(r: BenchmarkResult) {
  const payloadSize =
    r.scenario.includes('80KB') ? '~80KB' : r.scenario.includes('50KB') ? '~50KB' : r.scenario.includes('500KB') ? '~500KB' : 'minimal'
  console.log(`\n  ${r.scenario} (payload: ${payloadSize})`)
  console.log(`    min: ${formatMs(r.min)}  avg: ${formatMs(r.avg)}  median: ${formatMs(r.median)}  p95: ${formatMs(r.p95)}  max: ${formatMs(r.max)}`)
  console.log(`    all: [${r.times.map((t) => formatMs(t)).join(', ')}]`)
}

// --- Main ---

async function main() {
  console.log('Speaker Save Benchmark')
  console.log('======================')
  console.log(`Target: PUT ${BASE_URL}/api/speakers/${SPEAKER_ID}`)
  console.log(`Iterations: ${ITERATIONS} per scenario (+ 1 warmup)\n`)

  console.log('Authenticating...')
  const cookie = await getSessionCookie()
  console.log('Authenticated.\n')

  const metadataPayload = {
    name: 'Sarah Chen',
    company: 'TechCorp',
    jobTitle: 'CTO',
    bio: 'A seasoned technology leader.',
    photoPosition: '50% 50%',
    twitterHandle: '@sarachen',
    linkedinUrl: 'https://linkedin.com/in/sarachen',
  }

  const smallImagePayload = {
    ...metadataPayload,
    photoUrl: generateFakeBase64Image(50 * 1024), // ~50KB
  }

  const realisticImagePayload = {
    ...metadataPayload,
    photoUrl: generateFakeBase64Image(80 * 1024), // ~80KB (realistic 800px JPEG after client compression)
  }

  const largeImagePayload = {
    ...metadataPayload,
    photoUrl: generateFakeBase64Image(500 * 1024), // ~500KB (worst case, no compression)
  }

  console.log('Running scenarios...')

  const results: BenchmarkResult[] = []

  results.push(await runScenario('1. Metadata only (no image)', cookie, metadataPayload, ITERATIONS))
  console.log(`  ✓ Scenario 1 done`)

  results.push(await runScenario('2. With ~50KB image', cookie, smallImagePayload, ITERATIONS))
  console.log(`  ✓ Scenario 2 done`)

  results.push(await runScenario('3. With ~80KB image (realistic)', cookie, realisticImagePayload, ITERATIONS))
  console.log(`  ✓ Scenario 3 done`)

  results.push(await runScenario('4. With ~500KB image (worst case)', cookie, largeImagePayload, ITERATIONS))
  console.log(`  ✓ Scenario 4 done`)

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Results')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const r of results) printResult(r)
  console.log()
}

main().catch((err) => {
  console.error('Benchmark failed:', err.message)
  process.exit(1)
})
