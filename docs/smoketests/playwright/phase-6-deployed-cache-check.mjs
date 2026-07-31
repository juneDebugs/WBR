#!/usr/bin/env node
/**
 * Phase 6, AC-8 — the buyer-directory refusal on a DEPLOYED preview, with two
 * distinct signed-in sessions.
 *
 * WHY THIS CANNOT BE ANSWERED LOCALLY. `GET /api/attendees` answers with
 * `Cache-Control: public, max-age=60, stale-while-revalidate=600`. That header
 * invites any shared cache between the app and the caller to store the response
 * and hand it to somebody else for the next sixty seconds. If a shared cache in a
 * deployed environment does that, then a representative whose company is
 * incomplete could receive a copy of the buyer directory that was produced for a
 * different representative, and the guard would never run because the request
 * would never reach application code. There is no shared cache in front of a
 * local server, so a local run cannot tell you either way. Changing that header is
 * deliberately NOT part of Phase 6 — see the requirements document's Out of Scope.
 *
 * WHAT THIS SCRIPT ESTABLISHES, in one of two directions, and it records whichever
 * it finds rather than expecting one:
 *   REFUSED      — the incomplete representative gets 403 on the deployed preview.
 *                  The guard is reached; the cache directive is not causing harm.
 *   SERVED       — the incomplete representative gets the directory anyway. That is
 *                  a real finding: the refusal is defeated by a shared cache, and
 *                  the header becomes urgent rather than out of scope.
 *
 * TWO DISTINCT SESSIONS, AND WHY IT IS DONE THIS WAY. The concern is a response
 * produced for one person being handed to another, so the two requests must come
 * from two different accounts, not one account twice. There is no seeded
 * deliberately-incomplete sponsor login to use as the second account — whether to
 * add one is an open decision in the plan. So this script builds the pair out of
 * what the app itself provides:
 *
 *   1. Account A is the sponsor demonstration login, whose company satisfies all
 *      six required items.
 *   2. A creates a colleague account, B, on the same company, through the app's own
 *      teammate-registration address.
 *   3. A requests the buyer directory and gets it. Any shared cache now holds a
 *      copy produced for A.
 *   4. A clears one required item on the company through the profile-save address,
 *      which is exempt from the guard precisely so this is possible.
 *   5. B — a different account, a different session token — requests the buyer
 *      directory inside the sixty-second window.
 *
 * Step 5 is the measurement. Everything before it is setup.
 *
 * NO DIRECT DATABASE ACCESS. Every step above goes through the app's own
 * addresses, because a deployed preview's database is not the local file the other
 * scripts in this directory open. That also means this script leaves the
 * demonstration company temporarily incomplete between steps 4 and 6 — it restores
 * it in a finally block AND verifies the restore by reading the company back.
 * If it is killed between those points, sign in as the demonstration login and
 * refill the tagline on the profile screen; the value is printed on start.
 *
 * Prerequisites:
 *   PREVIEW_URL                 the deployed preview's address, e.g.
 *                               https://sponsor-<hash>-<org>.vercel.app
 *   VERCEL_PROTECTION_BYPASS    a Protection Bypass for Automation token, from
 *                               Vercel Project Settings → Deployment Protection.
 *                               Without it every request answers 302 to
 *                               vercel.com/sso-api and the app is never reached.
 *                               Same variable two existing scripts in this
 *                               directory already use.
 *
 * A CAVEAT THAT MUST BE RECORDED WITH THE RESULT. The bypass token is itself a
 * signal to the platform, and it may change how the response is cached. If it
 * does, a REFUSED result proves the guard runs but proves nothing about the cache.
 * This script therefore prints the cache-related response headers for every
 * request and the smoketest document records them, so the strength of the
 * conclusion can be judged rather than assumed.
 *
 * Usage:
 *   PREVIEW_URL=https://... VERCEL_PROTECTION_BYPASS=... \
 *     node docs/smoketests/playwright/phase-6-deployed-cache-check.mjs
 *
 * Exits 0 if the refusal held, 1 if it did not or if setup failed.
 */

const BASE = process.env.PREVIEW_URL
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS
const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'password123'
const SPONSOR_DEMO = 'sponsor@test.com'

const COLLEAGUE = {
  email: 'phase6-preview-colleague@wbr.invalid',
  name: 'Phase 6 Preview Colleague',
  password: 'phase6-preview-password',
}

if (!BASE) {
  console.error('PREVIEW_URL is not set. See the prerequisites at the top of this file.')
  process.exit(1)
}
if (!BYPASS) {
  console.error(
    'VERCEL_PROTECTION_BYPASS is not set.\n' +
    'Every request to a protected preview answers 302 to vercel.com/sso-api, so the app is\n' +
    'never reached and a "refused" result would be meaningless. Generate a token at\n' +
    'Vercel Project Settings → Deployment Protection → Protection Bypass for Automation.',
  )
  process.exit(1)
}

const COOKIE_NAME = BASE.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

const BYPASS_HEADERS = { 'x-vercel-protection-bypass': BYPASS }

let passCount = 0
let failCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }
function section(t) { console.log(`\n${t}`) }

/** The headers that decide whether a shared cache is involved. Printed for every request. */
const CACHE_HEADERS = ['cache-control', 'age', 'x-vercel-cache', 'x-vercel-id', 'etag', 'vary']

function cacheReport(res) {
  return CACHE_HEADERS
    .map(h => [h, res.headers.get(h)])
    .filter(([, v]) => v !== null)
    .map(([h, v]) => `${h}: ${v}`)
    .join(' | ') || '(no cache headers)'
}

async function signIn(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: BYPASS_HEADERS })
  if (!csrfRes.ok) {
    throw new Error(
      `GET ${BASE}/api/auth/csrf -> ${csrfRes.status}. If this is a 302 to vercel.com/sso-api the ` +
      `bypass token is wrong or not enabled on this project.`,
    )
  }
  const { csrfToken } = await csrfRes.json()
  const jar = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { ...BYPASS_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
    redirect: 'manual',
  })
  const raw = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) throw new Error(`sign-in for ${email} set no session cookie (HTTP ${res.status})`)
  return raw.split(';')[0].split('=').slice(1).join('=')
}

async function getDirectory(cookie, who) {
  const res = await fetch(`${BASE}/api/attendees`, {
    headers: { ...BYPASS_HEADERS, Cookie: `${COOKIE_NAME}=${cookie}` },
    redirect: 'manual',
  })
  let body = null
  try { body = await res.json() } catch { /* leave null */ }
  console.log(`    ${who}: GET /api/attendees -> ${res.status}   ${cacheReport(res)}`)
  return { status: res.status, body }
}

async function patchProfile(cookie, body) {
  const res = await fetch(`${BASE}/api/profile`, {
    method: 'PATCH',
    headers: { ...BYPASS_HEADERS, 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookie}` },
    body: JSON.stringify(body),
  })
  let parsed = null
  try { parsed = await res.json() } catch { /* leave null */ }
  return { status: res.status, body: parsed }
}

async function main() {
  console.log('Phase 6 AC-8 — deployed-preview cache check on the buyer directory')
  console.log(`Preview: ${BASE}`)

  let cookieA
  let originalTagline = null
  let colleagueId = null

  try {
    section('Setup — account A, the sponsor demonstration login')
    cookieA = await signIn(SPONSOR_DEMO, PASSWORD)
    ok(`signed in as ${SPONSOR_DEMO}`)

    // Read the company's current state through the app, so the value can be put
    // back exactly. This address is guarded, which is itself worth knowing: if it
    // refuses here the demonstration company is ALREADY incomplete on this
    // preview, and the whole premise of the check is different.
    const dataRes = await fetch(`${BASE}/api/profile/sponsor-data`, {
      headers: { ...BYPASS_HEADERS, Cookie: `${COOKIE_NAME}=${cookieA}` },
    })
    if (dataRes.status !== 200) {
      throw new Error(
        `GET /api/profile/sponsor-data -> ${dataRes.status}. If this is 403 with ` +
        `onboardingRequired, the demonstration company on this preview is already incomplete, ` +
        `so account A cannot play the "complete representative" part. Fix the company on the ` +
        `preview first.`,
      )
    }
    const { sponsor } = await dataRes.json()
    originalTagline = sponsor?.tagline ?? null
    console.log(`    company: ${sponsor?.name}`)
    console.log(`    tagline snapshot (put this back by hand if the run is killed): ` +
                `${JSON.stringify(originalTagline)}`)
    if (!originalTagline) throw new Error('the demonstration company has no tagline to clear and restore')

    section('Setup — account B, a colleague on the same company')
    {
      const res = await fetch(`${BASE}/api/profile/teammates/register`, {
        method: 'POST',
        headers: { ...BYPASS_HEADERS, 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookieA}` },
        body: JSON.stringify({
          name: COLLEAGUE.name, email: COLLEAGUE.email, password: COLLEAGUE.password,
        }),
      })
      const created = await res.json().catch(() => null)
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`creating the colleague answered ${res.status}: ${JSON.stringify(created)}`)
      }
      colleagueId = created?.id ?? null
      ok(`account B exists: ${COLLEAGUE.email}`)
    }
    const cookieB = await signIn(COLLEAGUE.email, COLLEAGUE.password)
    ok('signed in as account B — a second, distinct session token')

    section('Step 1 — A requests the directory while the company is COMPLETE')
    const aBefore = await getDirectory(cookieA, 'A (complete)')
    if (aBefore.status === 200 && Array.isArray(aBefore.body)) {
      ok(`A was served ${aBefore.body.length} people — any shared cache now holds a copy made for A`)
    } else {
      fail(`A was answered ${aBefore.status}, so there is no cached success to try to leak`)
    }

    section('Step 2 — A empties one required item through the exempt save address')
    {
      const res = await patchProfile(cookieA, { tagline: '' })
      if (res.status === 200) ok('PATCH /api/profile -> 200; the company is now incomplete')
      else fail(`PATCH /api/profile -> ${res.status} — cannot make the company incomplete`)
    }

    section('Step 3 — THE MEASUREMENT: B requests the directory inside the 60s window')
    const bAfter = await getDirectory(cookieB, 'B (incomplete)')

    if (bAfter.status === 403 && bAfter.body?.onboardingRequired === true) {
      ok('REFUSED on the deployed preview — the request reached the guard, ' +
         'and the cache directive did not hand B a copy made for A')
    } else if (bAfter.status === 200 && Array.isArray(bAfter.body)) {
      fail(`SERVED — B received ${bAfter.body.length} people despite an incomplete company. ` +
           `A shared cache answered without reaching application code. The Cache-Control header ` +
           `on this address defeats the refusal, and changing it stops being out of scope.`)
    } else {
      fail(`B was answered ${bAfter.status} with ${JSON.stringify(bAfter.body).slice(0, 120)} — ` +
           `neither the refusal nor a cache hit. Record this and work out which it is before ` +
           `drawing any conclusion.`)
    }

    section('Step 4 — and A, the account the cached copy was made for, is refused too')
    {
      const aAfter = await getDirectory(cookieA, 'A (now incomplete)')
      if (aAfter.status === 403) {
        ok('A is refused as well — the refusal follows the company, not the session')
      } else {
        fail(`A was answered ${aAfter.status}. If this is a 200, A is being served its OWN cached ` +
             `copy, which is the same defect from the other direction.`)
      }
    }
  } catch (err) {
    fail(`run aborted: ${err.message}`)
  } finally {
    section('Cleanup — restore the company, then remove account B')
    if (cookieA && originalTagline) {
      // Restore FIRST. The teammate-removal address is guarded, so it cannot be
      // called until the company is complete again.
      const res = await patchProfile(cookieA, { tagline: originalTagline })
      if (res.status === 200) {
        const check = await fetch(`${BASE}/api/profile/sponsor-data`, {
          headers: { ...BYPASS_HEADERS, Cookie: `${COOKIE_NAME}=${cookieA}` },
        })
        const back = check.status === 200 ? (await check.json()).sponsor?.tagline : null
        if (back === originalTagline) ok('tagline restored and verified by reading it back')
        else fail(`RESTORE UNVERIFIED: the company now reads ${JSON.stringify(back)}. ` +
                  `Put back ${JSON.stringify(originalTagline)} by hand.`)
      } else {
        fail(`RESTORE FAILED (${res.status}). The demonstration company is still incomplete on ` +
             `this preview. Sign in as ${SPONSOR_DEMO} and refill the tagline with ` +
             `${JSON.stringify(originalTagline)}.`)
      }
    }
    if (cookieA && colleagueId) {
      const res = await fetch(`${BASE}/api/profile/teammates`, {
        method: 'DELETE',
        headers: { ...BYPASS_HEADERS, 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookieA}` },
        body: JSON.stringify({ userId: colleagueId }),
      })
      if (res.status === 200) ok('account B detached from the company')
      else fail(`could not detach account B (${res.status}) — remove ${COLLEAGUE.email} by hand`)
    }
  }

  section('Result')
  console.log(`  ${passCount} passed, ${failCount} failed`)
  console.log('\n  Record the cache headers printed above in the smoketest document alongside the')
  console.log('  verdict. A refusal measured through a bypass token is weaker evidence about the')
  console.log('  cache than a refusal measured without one, and the document should say so.')
  process.exit(failCount === 0 ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
