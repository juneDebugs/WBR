#!/usr/bin/env node
/**
 * Phase 1 verification: attendee onboarding gate + checklist.
 *
 * Covers the plan's Phase 1 acceptance criteria as contract checks
 * (env-agnostic per docs/smoketests/CONTRACT.md §1.1 — every pass criterion
 * below is a binary observable: a redirect happens or it does not, a label is
 * listed or it is not).
 *
 *   AC-1  An attendee missing a required field is blocked from every gated
 *         section (home, schedule, speakers, people, meetings, chat,
 *         my-schedule, setup) and lands on the checklist.
 *   AC-2  The checklist names exactly the still-missing required fields —
 *         no more, no fewer.
 *   AC-3  Populating the full required set unblocks navigation within one hop.
 *   AC-4  Clearing a required field through the Settings screen re-blocks,
 *         without needing a full page reload.
 *   AC-5  An empty multi-select for "solutions seeking" counts as missing —
 *         it persists as the string "[]", which is truthy and must not be
 *         mistaken for filled.
 *   AC-6  The checklist shows "solutions seeking" and never "solutions
 *         offering" (attendees are buyers).
 *   AC-7  The Settings screen still edits the same fields after the gate passes.
 *   AC-8  Onboarding completes with no OAuth provider configured — this script
 *         only ever authenticates with email + password.
 *   AC-9  The checklist itself is reachable while blocked (no redirect loop).
 *   AC-1r (regression) The full-screen route group — `(fullscreen)/chat/[roomId]`,
 *         which has its own layout and is NOT under the tabbed `(app)` group — is
 *         gated too. The first cut of this feature guarded only `(app)`, so an
 *         attendee with an empty required field was blocked from every section
 *         yet could still open a chat room and post in it. Found by adversarial
 *         review, not by this script's original steps, which only exercised
 *         `/chat` (the list) and never `/chat/[roomId]` (the room).
 *
 * Known limit, measured not assumed (see the Phase 1 smoketest doc): the
 * server-side gate does not fire on in-app navigation to a section already
 * visited within apps/attendee/next.config.js
 * experimental.staleTimes.dynamic = 300, because the browser reuses that page
 * without asking the server. AC-4 covers the path that matters — the Settings
 * save calls router.refresh(), which drops those cached pages.
 *
 * Prerequisites:
 *   - Attendee app reachable at ATTENDEE_BASE_URL (default http://localhost:3001).
 *     Tier B: point ATTENDEE_BASE_URL at the Vercel preview URL.
 *     Tier C: pnpm --filter attendee build && pnpm --filter attendee start
 *   - apps/attendee/.env.local with DATABASE_URL + NEXTAUTH_SECRET (README §2).
 *     DATABASE_URL must be an ABSOLUTE file: path — the README's relative form
 *     does not resolve at runtime and yields "Unable to open the database file".
 *   - The canonical demo attendee (stephcurry@test.com / password123). If the
 *     row is absent it self-heals on first sign-in via NextAuth
 *     (packages/db/src/test-accounts.ts ensureCanonicalTestAccount), which this
 *     script triggers.
 *   - Playwright + chromium installed.
 *
 * This script snapshots the demo account's required-set fields on start and
 * restores them on exit, so a run leaves the demo profile as it found it.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'

const BASE_URL = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const EMAIL = process.env.ATTENDEE_EMAIL ?? 'stephcurry@test.com'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

/**
 * Tab roots — asserted in BOTH directions: blocked while incomplete, and
 * reachable (200) once complete.
 */
const GATED_SECTIONS = [
  '/home', '/schedule', '/speakers', '/people',
  '/meetings', '/chat', '/my-schedule', '/setup',
]

/**
 * Sub-routes and dynamic routes that must also be gated. Asserted in the
 * BLOCKED direction only: the ids are deliberately fake, so once an attendee is
 * complete these correctly return not-found rather than 200, and asserting 200
 * on them would be wrong. Included because an earlier version of this script
 * looped over the tab roots alone while claiming to cover "every section" —
 * true in fact, but not demonstrated. Adversarial review flagged the gap.
 */
const GATED_SUBROUTES = [
  '/schedule/no-such-session',
  '/speakers/no-such-speaker',
  '/people/no-such-person',
  '/meetings/no-such-meeting',
  '/chat/new',
  '/chat/dm/no-such-user',
  '/chat/no-such-room',
]

/**
 * API addresses that CHANGE data. A blocked attendee must be refused (403).
 * PATCH /api/profile is deliberately absent — the checklist saves through it,
 * so guarding it would make onboarding impossible to complete.
 */
const MUTATING_ENDPOINTS = [
  { method: 'POST', path: '/api/friend/test-brand' },
  { method: 'POST', path: '/api/posts/no-such-post/like' },
  { method: 'POST', path: '/api/chat/global', body: { content: 'gate probe' } },
  { method: 'POST', path: '/api/sessions/no-such-session/bookmark' },
]

/** A complete required set, used to drive the unblock assertions. */
const COMPLETE_PROFILE = {
  name: 'Steph Curry',
  jobTitle: 'Point Guard',
  company: 'Golden State Warriors',
  companySize: 'ENTERPRISE',
  annualRevenue: '250M+',
  solutionsSeeking: JSON.stringify(['AI & Automation', 'Personalization']),
}

/** Checklist labels, from lib/profile-completeness.ts FIELD_LABELS. */
const LABEL = {
  name: 'Name',
  jobTitle: 'Job title',
  company: 'Company',
  companySize: 'Company size',
  annualRevenue: 'Annual revenue',
  solutionsSeeking: 'Solutions you’re seeking',
}

let passCount = 0
let failCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }

// ── plumbing ────────────────────────────────────────────────────────────────

/**
 * Sign in with email + password through NextAuth's credentials flow and return
 * the session cookie. Deliberately the credentials route rather than
 * /api/login: it exercises the real sign-in path (AC-8) and triggers the
 * canonical-account self-heal when the demo row is missing.
 */
async function signInWithPassword() {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  if (!csrfRes.ok) throw new Error(`GET /api/auth/csrf -> ${csrfRes.status}`)
  const { csrfToken } = await csrfRes.json()
  const csrfCookies = (csrfRes.headers.getSetCookie?.() ?? [])
    .map(c => c.split(';')[0]).join('; ')

  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrfCookies,
    },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, json: 'true' }),
    redirect: 'manual',
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  const raw = setCookies.find(c => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) {
    throw new Error(
      `credentials sign-in did not set ${COOKIE_NAME} (HTTP ${res.status}). ` +
      `Check NEXTAUTH_SECRET and that ${EMAIL} exists or is a canonical demo account.`,
    )
  }
  return raw.split(';')[0].split('=').slice(1).join('=')
}

async function readProfile(cookie) {
  const res = await fetch(`${BASE_URL}/api/data/setup`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
  })
  if (!res.ok) throw new Error(`GET /api/data/setup -> ${res.status}`)
  const d = await res.json()
  return {
    name: d.userName,
    jobTitle: d.userJobTitle,
    company: d.userCompany,
    companySize: d.userCompanySize,
    annualRevenue: d.userAnnualRevenue,
    solutionsSeeking: d.userSolutionsSeeking,
  }
}

async function writeProfile(cookie, body) {
  const res = await fetch(`${BASE_URL}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookie}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH /api/profile -> ${res.status}`)
}

/** Follow no redirects — we want to observe the redirect itself. */
async function rawGet(cookie, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    redirect: 'manual',
  })
  return { status: res.status, location: res.headers.get('location') }
}

/**
 * Is this account currently past the gate? Asked of the running app rather than
 * recomputed here on purpose — duplicating the completeness rule into this
 * script would create a second source of truth that could drift from
 * lib/profile-completeness.ts, which is the very failure the policy module
 * exists to prevent. The gate's own answer is the only one that matters.
 */
async function isPastGate(cookie) {
  const { status, location } = await rawGet(cookie, '/home')
  if (status === 200) return true
  if (status >= 300 && status < 400 && (location ?? '').includes('/onboarding')) return false
  throw new Error(`unexpected /home response while probing gate state: ${status} ${location ?? ''}`)
}

async function newSignedInPage(browser, cookie) {
  const ctx = await browser.newContext()
  await ctx.addCookies([{
    name: COOKIE_NAME, value: cookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax',
  }])
  return { ctx, page: await ctx.newPage() }
}

// ── steps ───────────────────────────────────────────────────────────────────

async function step1_blockedFromEverySection(cookie) {
  console.log('\n── Step 1: incomplete profile is blocked from every gated section (AC-1) ──')
  // Two required fields absent: companySize and annualRevenue.
  await writeProfile(cookie, { ...COMPLETE_PROFILE, companySize: null, annualRevenue: null })

  for (const path of [...GATED_SECTIONS, ...GATED_SUBROUTES]) {
    const { status, location } = await rawGet(cookie, path)
    const toChecklist = status >= 300 && status < 400 && (location ?? '').includes('/onboarding')
    if (toChecklist) ok(`${path} -> ${status} redirect to /onboarding`)
    else fail(`${path} -> ${status} ${location ?? '(no redirect)'} — expected a redirect to /onboarding`)
  }
}

async function step2_checklistReachableAndListsExactly(browser, cookie) {
  console.log('\n── Step 2: checklist is reachable and names exactly the missing fields (AC-2, AC-9) ──')
  const { status } = await rawGet(cookie, '/onboarding')
  if (status === 200) ok('/onboarding returns 200 while blocked (no redirect loop)')
  else fail(`/onboarding returned ${status} while blocked — expected 200`)

  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle', timeout: 30000 })

    if (await page.locator('[data-testid="onboarding-checklist"]').count() > 0) {
      ok('checklist rendered')
    } else {
      fail('checklist did not render')
      return
    }

    const listed = await page.locator('[data-testid^="onboarding-missing-"]').allInnerTexts()
    const normalised = listed.map(t => t.trim()).filter(Boolean).sort()
    const expected = [LABEL.companySize, LABEL.annualRevenue].sort()
    if (JSON.stringify(normalised) === JSON.stringify(expected)) {
      ok(`lists exactly ${JSON.stringify(expected)}`)
    } else {
      fail(`lists ${JSON.stringify(normalised)} — expected exactly ${JSON.stringify(expected)}`)
    }
  } finally {
    await ctx.close()
  }
}

async function step3_seekingNotOffering(browser, cookie) {
  console.log('\n── Step 3: checklist asks for seeking, never offering (AC-6) ──')
  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle', timeout: 30000 })
    const body = (await page.locator('body').innerText()).toLowerCase()

    if (body.includes('seeking')) ok('the word "seeking" appears on the checklist')
    else fail('the word "seeking" does not appear on the checklist')

    if (!body.includes('offer')) {
      ok('no "offer"/"offering" wording anywhere on the checklist')
    } else {
      fail('the checklist mentions "offer"/"offering" — attendees are buyers')
    }

    const offeringControls = await page.locator('[data-testid^="onboarding-solutionsOffering-"]').count()
    if (offeringControls === 0) ok('no solutionsOffering controls rendered')
    else fail(`${offeringControls} solutionsOffering control(s) rendered`)
  } finally {
    await ctx.close()
  }
}

async function step4_completingUnblocksInOneHop(browser, cookie) {
  console.log('\n── Step 4: completing the required set unblocks within one hop (AC-3) ──')
  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle', timeout: 30000 })

    // Fill the two outstanding fields through the checklist UI.
    await page.click(`[data-testid="onboarding-companySize-${COMPLETE_PROFILE.companySize}"]`)
    await page.click(`[data-testid="onboarding-annualRevenue-${COMPLETE_PROFILE.annualRevenue}"]`)

    const submit = page.locator('[data-testid="onboarding-submit"]')
    if (await submit.isEnabled()) ok('submit becomes enabled once nothing is outstanding')
    else { fail('submit still disabled with the required set filled in'); return }

    await submit.click()
    await page.waitForURL(url => !url.pathname.startsWith('/onboarding'), { timeout: 20000 })
      .catch(() => {})

    const landed = new URL(page.url()).pathname
    if (landed === '/home') ok(`released to ${landed} in one hop`)
    else fail(`landed on ${landed} after completing — expected /home`)

    // NOTE ON WHAT THIS STEP DOES NOT CATCH. It measured green throughout a real
    // defect: on the deployed site, pressing this button re-showed the checklist
    // with the delegate's answers dropped, while the database held the save and a
    // fresh request released the account. Neither this assertion, a five-second
    // variant of it, nor one checking the checklist had stopped rendering went red
    // — in a development server OR a local production build. The behaviour depends
    // on losing a race that a fast machine wins every time. Guarded instead by
    // step4b below, which reads the source.
  } finally {
    await ctx.close()
  }

  // And the gate now allows every section.
  for (const path of GATED_SECTIONS) {
    const { status } = await rawGet(cookie, path)
    if (status === 200) ok(`${path} -> 200 once complete`)
    else fail(`${path} -> ${status} once complete — expected 200`)
  }
}

/**
 * Step 4b: the checklist hands off with a full page load, not a client navigation.
 *
 * ── WHY THIS ASSERTS THE SOURCE, WHICH THIS SUITE OTHERWISE NEVER DOES ────────
 *
 * The plan's own testing rule is to assert what an outside observer sees and never
 * an implementation detail, because a test that breaks on a rename but not on a
 * behaviour change is a bad test. This step breaks that rule deliberately, for the
 * one reason the rule allows: the behaviour is UNOBSERVABLE anywhere it can be
 * measured.
 *
 * The defect, found 2026-08-05 by a person completing the checklist on the deployed
 * site. `router.refresh()` followed by `router.replace('/home')` in
 * components/onboarding/OnboardingChecklist.tsx. `refresh()` returns nothing to
 * wait for, so the navigation started before it finished, and next.config.js sets
 * experimental.staleTimes.dynamic to 300 — the browser keeps a visited dynamic page
 * for five minutes. The delegate was handed that cached copy: the checklist again,
 * with their answers dropped. Pressing the button again repeated it.
 *
 * Three behavioural assertions were written to catch it and all three measured green
 * WITH THE DEFECT REINSTATED — a 20-second wait, a 5-second wait, and a check that
 * the checklist had stopped rendering — in a development server AND in a local
 * production build, at 361ms, 131ms and 65ms. The stale render needs a race that a
 * machine talking to itself wins every time. There is no observable to assert.
 *
 * So this reads the file. Comments are stripped first, so the explanation of the
 * defect inside that file — which names the very calls forbidden here — does not
 * trip it.
 *
 * Precedent in this repository: scripts/test-onboarding-policy.mjs asserts that the
 * policy module carries no imports, for the same reason — getting it wrong is
 * silent and no behaviour reveals it.
 *
 * If this ever needs changing, the requirement is that completing the checklist
 * reaches the app through something that cannot be served from the browser's page
 * cache. A full page load satisfies it. A server action ending in redirect() would
 * too, and this step would need rewriting to accept that.
 */
async function step4b_handoffIsAFullPageLoad() {
  console.log('\n── Step 4b: the checklist hands off with a full page load (regression guard) ──')

  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const here = dirname(fileURLToPath(import.meta.url))
  const target = join(here, '..', '..', '..', 'apps/attendee/components/onboarding/OnboardingChecklist.tsx')

  let src
  try {
    src = readFileSync(target, 'utf8')
  } catch (e) {
    fail(`could not read the checklist component at ${target} — ${e.message}`)
    return
  }
  ok('the checklist component was read from disk')

  // Strip block comments then line comments, so prose describing the defect does
  // not count as committing it.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  // ── THE ROUTER IS NOT IMPORTED AT ALL. Round 2 of review reshaped this. ──────
  //
  // The first version looked for a variable literally named `router` calling
  // `.refresh()` and `.replace()`. Round 2 pointed out that
  // `const nav = useRouter(); nav.refresh(); nav.replace('/home')` reintroduces the
  // race and sails past it, and that an ordinary rename does the same.
  //
  // Checking the IMPORT closes every alias at once: a component that never obtains
  // the router cannot call anything on it, whatever the variable is called. It is
  // also a stronger statement than "these two calls are absent", and a simpler one
  // to read.
  //
  // Round 2 also noted the comment stripping is a regex rather than a parser, so a
  // `//` inside a string could remove real code. That is why the import check runs
  // against the RAW source as well: a stripping accident cannot hide an import from
  // both readings.
  // ── SCOPED TO THE SUBMIT HANDLER. Round 3 narrowed this. ─────────────────────
  //
  // Round 2 made this fail on any `useRouter` anywhere in the file, which closed
  // every alias at once. Round 3 pointed out that is too strong: adding a Cancel
  // button calling `router.back()` would fail this guard while the submit handoff
  // stayed correct. A test should not forbid a decision nobody has taken.
  //
  // So the check moves inside the submit handler, and looks for ANY identifier
  // calling .refresh() or .replace() there rather than one literally named
  // `router` — which is what closes the alias hole without banning the router from
  // the component.
  const handler = code.match(/async function handleSubmit[\s\S]*?\n {2}\}/)
  if (!handler) {
    fail('could not find the submit handler in the checklist component — this guard needs ' +
         'rewriting rather than ignoring. It matched `async function handleSubmit` followed by ' +
         'a closing brace at two spaces of indentation; if the handler was renamed, made an ' +
         'arrow function, or reindented, fix this check rather than deleting it')
    return
  }
  const body = handler[0]

  // window.location.replace is the wanted call, so it is removed before looking for
  // a router-style .replace() — otherwise the fix would trip its own guard.
  const bodyWithoutFullLoad = body
    .replace(/\bwindow\s*\.\s*location\s*\.\s*(assign|replace)\s*\([^)]*\)/g, '')
    .replace(/\blocation\s*\.\s*(href|assign|replace)\b/g, '')

  const callsRefresh = /\b[A-Za-z_$][\w$]*\s*\.\s*refresh\s*\(/.test(bodyWithoutFullLoad)
  const callsReplace = /\b[A-Za-z_$][\w$]*\s*\.\s*replace\s*\(\s*['"]\//.test(bodyWithoutFullLoad)

  if (!(callsRefresh && callsReplace)) {
    ok('the submit handler does not pair a refresh() with a route replace(), under any variable name')
  } else {
    fail('the submit handler pairs a refresh() with a route replace() — this is the racing ' +
         "pairing that showed a delegate the checklist again with their answers dropped, and no " +
         'behavioural assertion in this suite can catch it')
  }

  const hasFullLoad =
    /\bwindow\s*\.\s*location\s*\.\s*(assign|replace)\s*\(\s*['"]\/home['"]\s*\)/.test(body) ||
    /\blocation\s*\.\s*href\s*=\s*['"]\/home['"]/.test(body)

  if (hasFullLoad) {
    ok('the submit handler itself hands off to /home with a full page load')
  } else {
    fail('the submit handler contains no full page load to /home — a client navigation here ' +
         "can be served from the browser's page cache, which is what produced the loop")
  }

  // ── replace() RATHER THAN assign(). Round 1 of review found this. ────────────
  //
  // assign() pushes a history entry, so Back returns the completed delegate to the
  // checklist, possibly from the back-forward cache without re-running the server
  // redirect — and with the button stuck reading "Saving…" because setSaving(false)
  // never runs on the success path.
  const usesAssign = /\bwindow\s*\.\s*location\s*\.\s*assign\s*\(/.test(handler[0])
  if (!usesAssign) {
    ok('it uses replace() rather than assign(), so Back cannot return to the checklist')
  } else {
    fail('the handler uses window.location.assign(), which pushes a history entry — pressing ' +
         'Back returns the completed delegate to the checklist')
  }
}

async function step5_completeUserLeavesChecklist(cookie) {
  console.log('\n── Step 5: a complete attendee is sent off the checklist (AC-3) ──')
  const { status, location } = await rawGet(cookie, '/onboarding')
  if (status >= 300 && status < 400 && (location ?? '').includes('/home')) {
    ok(`/onboarding -> ${status} redirect to /home when already complete`)
  } else {
    fail(`/onboarding -> ${status} ${location ?? '(no redirect)'} — expected a redirect to /home`)
  }
}

async function step6_emptyMultiSelectCountsAsMissing(cookie) {
  console.log('\n── Step 6: an empty multi-select counts as missing (AC-5) ──')
  await writeProfile(cookie, { ...COMPLETE_PROFILE, solutionsSeeking: '[]' })

  const { status, location } = await rawGet(cookie, '/home')
  if (status >= 300 && status < 400 && (location ?? '').includes('/onboarding')) {
    ok('an empty "[]" solutionsSeeking blocks the app — the truthy empty string is treated as missing')
  } else {
    fail(`/home -> ${status} ${location ?? '(no redirect)'} with solutionsSeeking="[]" — expected a block`)
  }
}

async function step7_settingsClearReblocks(browser, cookie) {
  console.log('\n── Step 7: clearing a required field in Settings re-blocks, no reload needed (AC-4, AC-7) ──')
  await writeProfile(cookie, COMPLETE_PROFILE)

  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'networkidle', timeout: 30000 })

    // Visit /people then return, so /people is in the browser's page cache.
    // This is the case a server-only check cannot catch on its own.
    await page.click('a[href="/people"]')
    await page.waitForURL('**/people', { timeout: 20000 }).catch(() => {})
    await page.click('a[href="/home"]')
    await page.waitForURL('**/home', { timeout: 20000 }).catch(() => {})

    await page.click('a[href="/setup"]')
    await page.waitForURL('**/setup', { timeout: 20000 }).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})

    const group = page.locator('label:has-text("Seeking") + div').first()
    await group.waitFor({ state: 'visible', timeout: 20000 })
    const before = await group.locator('button.chip-active').count()
    if (before > 0) ok(`Settings still edits the same fields — ${before} seeking chip(s) selected (AC-7)`)
    else fail('Settings shows no selected seeking chips — cannot exercise the clear path')

    let active = before
    while (active > 0) {
      await group.locator('button.chip-active').first().click()
      const next = await group.locator('button.chip-active').count()
      if (next === active) break
      active = next
    }
    if (active === 0) ok('cleared every seeking chip through the Settings UI')
    else fail(`${active} seeking chip(s) still selected after clearing`)

    const patches = []
    page.on('response', r => {
      if (r.url().includes('/api/profile') && r.request().method() === 'PATCH') patches.push(r.status())
    })
    await page.click('button:has-text("Save Profile")')
    await page.waitForTimeout(3000)

    if (patches.includes(200)) ok('Settings save returned 200')
    else fail(`Settings save did not return 200 (saw ${JSON.stringify(patches)})`)

    // Re-blocking must not require a reload. Either the refresh already moved
    // us to the checklist, or the next in-app navigation does.
    let landed = new URL(page.url()).pathname
    if (!landed.startsWith('/onboarding')) {
      const link = page.locator('a[href="/people"]')
      if (await link.count() > 0) {
        await link.click()
        await page.waitForTimeout(3000)
        landed = new URL(page.url()).pathname
      }
    }
    if (landed.startsWith('/onboarding')) {
      ok(`re-blocked to ${landed} after clearing a required field, with no page reload`)
    } else {
      fail(`still on ${landed} after clearing a required field — expected the checklist`)
    }

    const listed = (await page.locator('[data-testid^="onboarding-missing-"]').allInnerTexts())
      .map(t => t.trim()).filter(Boolean)
    if (listed.length === 1 && listed[0] === LABEL.solutionsSeeking) {
      ok(`checklist lists exactly ${JSON.stringify(listed)}`)
    } else {
      fail(`checklist lists ${JSON.stringify(listed)} — expected only ${JSON.stringify([LABEL.solutionsSeeking])}`)
    }
  } finally {
    await ctx.close()
  }
}

/**
 * Regression guard for the hole adversarial review found: the gate originally
 * guarded only the tabbed `(app)` route group, leaving `(fullscreen)/chat/[roomId]`
 * open. An attendee with an empty required field was blocked from every section
 * yet could still open a chat room and post in it.
 *
 * Deliberately does NOT require the demo account to be a member of any room.
 * The layout runs before the page's membership check, so the gate's redirect
 * happens regardless of membership — which means any room id proves the route
 * group is covered, and the check stays free of seed-data dependencies and keeps
 * working against a preview deployment.
 */
async function step9_fullscreenGroupIsGated(cookie) {
  console.log('\n── Step 9: the full-screen chat route group is gated too (AC-1 regression) ──')
  const ROOM_PATH = '/chat/gate-probe-room'

  await writeProfile(cookie, { ...COMPLETE_PROFILE, solutionsSeeking: '[]' })
  const blocked = await rawGet(cookie, ROOM_PATH)
  if (blocked.status >= 300 && blocked.status < 400 && (blocked.location ?? '').includes('/onboarding')) {
    ok(`${ROOM_PATH} -> ${blocked.status} redirect to /onboarding while incomplete`)
  } else {
    fail(
      `${ROOM_PATH} -> ${blocked.status} ${blocked.location ?? '(no redirect)'} while incomplete — ` +
      `the (fullscreen) route group is NOT gated; an incomplete attendee can use chat`,
    )
  }

  // And the gate must not block a complete attendee from the same route.
  //
  // Assert an explicit set of acceptable statuses rather than merely "not a
  // redirect to /onboarding". The looser form passed on ANY non-redirect, so a
  // 500 from a broken page counted as success — flagged by adversarial review.
  // The room id is deliberately fake, so not-found is the correct outcome here;
  // 200 is also accepted because the app renders its own not-found UI.
  await writeProfile(cookie, COMPLETE_PROFILE)
  const allowed = await rawGet(cookie, ROOM_PATH)
  const ACCEPTABLE = [200, 404]
  if (ACCEPTABLE.includes(allowed.status)) {
    ok(`${ROOM_PATH} -> ${allowed.status} once complete (gate steps aside; over-blocking ruled out)`)
  } else if (allowed.status >= 300 && allowed.status < 400 && (allowed.location ?? '').includes('/onboarding')) {
    fail(`${ROOM_PATH} still redirects to /onboarding once complete — the gate over-blocks`)
  } else {
    fail(`${ROOM_PATH} -> ${allowed.status} once complete — expected one of ${ACCEPTABLE.join('/')}; a failing page must not count as a pass`)
  }
}

/**
 * Regression guard for the second hole adversarial review found: the gate lives
 * in route-group layouts, and API route handlers are not rendered inside any
 * layout, so it never ran for them. Measured before the fix — an attendee
 * blocked from every page could still POST /api/friend/<id> and get 200,
 * creating a pending friend request against someone else.
 */
async function step10_mutatingApiIsGated(cookie) {
  console.log('\n── Step 10: API calls that change data are gated too (AC-1 regression) ──')

  async function callMutating(cookie, { method, path, body }) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookie}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return res.status
  }

  // ── blocked attendee: every changing call must be refused ──
  await writeProfile(cookie, { ...COMPLETE_PROFILE, solutionsSeeking: '[]' })
  for (const ep of MUTATING_ENDPOINTS) {
    const status = await callMutating(cookie, ep)
    if (status === 403) ok(`${ep.method} ${ep.path} -> 403 while incomplete`)
    else fail(`${ep.method} ${ep.path} -> ${status} while incomplete — expected 403; a blocked attendee can still change data`)
  }

  // ── but the profile save MUST stay open, or onboarding is impossible ──
  const profileStatus = await callMutating(cookie, {
    method: 'PATCH', path: '/api/profile', body: { jobTitle: COMPLETE_PROFILE.jobTitle },
  })
  if (profileStatus === 200) {
    ok('PATCH /api/profile -> 200 while incomplete (the checklist can still save; onboarding is completable)')
  } else {
    fail(`PATCH /api/profile -> ${profileStatus} while incomplete — the gate has trapped the attendee permanently`)
  }

  // ── and a complete attendee must NOT be refused ──
  await writeProfile(cookie, COMPLETE_PROFILE)
  const afterStatus = await callMutating(cookie, MUTATING_ENDPOINTS[0])
  if (afterStatus !== 403) {
    ok(`${MUTATING_ENDPOINTS[0].method} ${MUTATING_ENDPOINTS[0].path} -> ${afterStatus} once complete (not 403; over-blocking ruled out)`)
  } else {
    fail(`${MUTATING_ENDPOINTS[0].path} still 403 once complete — the guard over-blocks`)
  }
}

async function step8_noOAuthNeeded() {
  console.log('\n── Step 8: onboarding needs no OAuth provider (AC-8) ──')
  // Every preceding step authenticated with email + password only. Assert that
  // the credentials path is genuinely what the login page offers, rather than
  // inferring it from this script's own choices.
  const res = await fetch(`${BASE_URL}/api/auth/providers`)
  if (!res.ok) { fail(`GET /api/auth/providers -> ${res.status}`); return }
  const providers = await res.json()
  if (providers.credentials) ok('the credentials (email + password) provider is configured')
  else fail('no credentials provider configured — email/password onboarding is impossible')
  if (!providers.linkedin) ok('no LinkedIn provider yet, as expected before Phase 7')
  else console.log('  ℹ a LinkedIn provider is configured (Phase 7 landed early)')
}

/**
 * Regression guard for the crash adversarial review found in round 3.
 *
 * The multi-select columns hold JSON-encoded arrays as text. The Settings screen
 * used a bare JSON.parse on both, which throws during render on a malformed
 * value and leaves the screen blank. `solutionsOffering` is OPTIONAL, so a
 * malformed value there does not trip the onboarding gate — which made it
 * reachable by an otherwise-complete attendee. Measured before the fix: the
 * Settings heading never rendered and body text collapsed from 1283 to 127
 * characters, with `Expected property name or '}' in JSON at position 1` thrown
 * in the browser.
 *
 * Note this is invisible over HTTP — the server returns 200 either way, because
 * SetupClient is a client component and the parse runs in the browser. It has to
 * be asserted with a real page load.
 */
async function step11_malformedOptionalArrayDoesNotBreakSettings(browser, cookie) {
  console.log('\n── Step 11: a malformed optional array does not break Settings (round-3 regression) ──')
  await writeProfile(cookie, COMPLETE_PROFILE)

  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    // Baseline, so the comparison is against this run rather than a hard-coded number.
    await page.goto(`${BASE_URL}/setup`, { waitUntil: 'networkidle', timeout: 30000 })
    const baselineLen = (await page.locator('body').innerText().catch(() => '')).length
    const baselineHeading = await page.locator('h1:has-text("Settings")').count()
    if (baselineHeading > 0 && baselineLen > 400) {
      ok(`Settings renders normally first (body ${baselineLen} chars)`)
    } else {
      fail(`Settings did not render even before the malformed value (heading=${baselineHeading}, body ${baselineLen})`)
      return
    }

    // Values that are not a JSON array: unparseable, and valid-but-wrong-shape.
    for (const bad of ['{', 'not json at all', '"a string"', '42']) {
      await writeProfile(cookie, { solutionsOffering: bad })

      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(`${BASE_URL}/setup`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
      const heading = await page.locator('h1:has-text("Settings")').count()
      const len = (await page.locator('body').innerText().catch(() => '')).length
      page.removeAllListeners('pageerror')

      if (heading > 0 && len >= baselineLen * 0.8 && errors.length === 0) {
        ok(`solutionsOffering=${JSON.stringify(bad)} — Settings still renders, no page error`)
      } else {
        fail(
          `solutionsOffering=${JSON.stringify(bad)} — heading=${heading > 0}, body ${len} vs baseline ${baselineLen}, ` +
          `errors=${errors.length ? JSON.stringify(errors.slice(0, 1)) : 'none'}`,
        )
      }
    }
  } finally {
    // Leave the field valid regardless of outcome.
    await writeProfile(cookie, { solutionsOffering: JSON.stringify(['Email Marketing', 'Loyalty & Rewards']) })
    await ctx.close()
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[Phase 1] Attendee onboarding gate + checklist @ ${BASE_URL}`)
  const cookie = await signInWithPassword()
  console.log('  signed in with email + password')

  const original = await readProfile(cookie)
  const startedPastGate = await isPastGate(cookie)
  console.log(`  snapshot of the demo profile taken (restored on exit)`)
  if (!startedPastGate) {
    console.log(
      `  [warn] ${EMAIL} was ALREADY blocked by the gate before this run.\n` +
      `         Restoring the snapshot on exit will leave it blocked. Populate its\n` +
      `         required fields if the demo account is expected to be usable.`,
    )
  }

  const browser = await chromium.launch()
  try {
    await step1_blockedFromEverySection(cookie)
    await step2_checklistReachableAndListsExactly(browser, cookie)
    await step3_seekingNotOffering(browser, cookie)
    await step4_completingUnblocksInOneHop(browser, cookie)
    await step4b_handoffIsAFullPageLoad()
    await step5_completeUserLeavesChecklist(cookie)
    await step6_emptyMultiSelectCountsAsMissing(cookie)
    await step7_settingsClearReblocks(browser, cookie)
    await step8_noOAuthNeeded()
    await step9_fullscreenGroupIsGated(cookie)
    await step10_mutatingApiIsGated(cookie)
    await step11_malformedOptionalArrayDoesNotBreakSettings(browser, cookie)
  } finally {
    await browser.close()
    try {
      await writeProfile(cookie, original)
      // Do not merely claim the restore worked — ask the gate.
      const endsPastGate = await isPastGate(cookie)
      if (endsPastGate) {
        console.log('\n  demo profile restored; the account is past the gate and usable')
      } else {
        console.log(
          `\n  [warn] demo profile restored to its pre-run state, but that state is\n` +
          `         BLOCKED by the gate — ${EMAIL} cannot use the app as-is.\n` +
          `         This is faithful restoration of what the run found, not a new fault,\n` +
          `         but it needs fixing before anyone demos with this account.`,
        )
      }
    } catch (err) {
      console.log(`\n  [warn] could not restore or re-check the demo profile: ${err?.message ?? err}`)
    }
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  Results: ${passCount} passed, ${failCount} failed\n`)
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(`\n[fatal] ${err?.message ?? err}`)
  process.exit(1)
})
