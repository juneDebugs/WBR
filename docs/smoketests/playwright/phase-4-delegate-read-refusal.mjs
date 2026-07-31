#!/usr/bin/env node
/**
 * Phase 4 verification: an incomplete delegate is refused the data behind the
 * screens, not only the screens.
 *
 * Covers the plan's Phase 4 acceptance criteria as contract checks
 * (env-agnostic per docs/smoketests/CONTRACT.md §1.1 — every pass criterion is
 * a binary observable: a request returns the onboarding refusal or it does not,
 * a screen renders its heading or it does not).
 *
 *   AC-1  Every one of the fifteen reading addresses refuses a signed-in
 *         delegate whose required set is incomplete — asserted by looping over
 *         a list, not a remembered sample.
 *   AC-2  Each of the same fifteen serves a complete delegate. Over-blocking is
 *         ruled out in the same run.
 *   AC-3  Every refusal carries the same status and body shape as the existing
 *         changing-request refusals: 403 with onboardingRequired true.
 *   AC-4  The checklist screen renders and its save succeeds while every other
 *         address refuses — asserted through a real page load.
 *   AC-5  Completing the required set releases every previously refused address
 *         within one navigation.
 *   AC-6  Clearing a required item refuses them again on the next fresh request.
 *   AC-7  The diagnostic endpoint no longer exists.
 *
 * WHY THE REFUSAL IS IDENTIFIED BY ITS BODY, NOT BY THE STATUS ALONE. Several of
 * these addresses answer 403 for their own reasons — reading a chat room you
 * are not a member of, for instance. Asserting bare "403 while incomplete, not
 * 403 when complete" would pass for the wrong reason on those. Every check here
 * looks for the onboarding refusal specifically: status 403 AND a body carrying
 * onboardingRequired. That is also what makes AC-3 a real assertion rather than
 * a restatement.
 *
 * REAL IDENTIFIERS, NOT MADE-UP ONES. The dynamic addresses are exercised with
 * ids read from the database, so the "serves a complete delegate" direction
 * means something. With invented ids every address would answer 404 whether the
 * guard was there or not, and the check would prove nothing.
 *
 * Prerequisites:
 *   - Attendee app reachable at ATTENDEE_BASE_URL (default http://localhost:3001).
 *     Tier C: pnpm --filter attendee build && pnpm --filter attendee start
 *     The plan requires this phase be demonstrated on a production build.
 *   - apps/attendee/.env.local with an ABSOLUTE file: DATABASE_URL and
 *     NEXTAUTH_SECRET.
 *   - Playwright + chromium installed.
 *
 * The delegate's required-set fields are snapshotted on start and restored on
 * exit. Nothing else is written: every probe here READS.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-4-delegate-read-refusal.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')

const BASE_URL = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

const EMAIL = process.env.ATTENDEE_EMAIL ?? 'stephcurry@test.com'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'

/** A complete required set, used to drive the release assertions. */
const COMPLETE_PROFILE = {
  name: 'Steph Curry',
  jobTitle: 'Point Guard',
  company: 'Golden State Warriors',
  companySize: 'ENTERPRISE',
  annualRevenue: '250M+',
  solutionsSeeking: JSON.stringify(['AI & Automation', 'Personalization']),
}

const INCOMPLETE = { companySize: null, annualRevenue: null }

const REQUIRED_COLUMNS = ['name', 'jobTitle', 'company', 'companySize', 'annualRevenue', 'solutionsSeeking']

// Rows this run creates so the released direction can be asserted properly.
// Removed in the cleanup block whatever happens.
const FIXTURE_MEMBER_ID = 'phase4-fixture-member'
const FIXTURE_MEETING_ID = 'phase4-fixture-meeting'
const fixturesCreated = []

let passCount = 0
let failCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }

// ── plumbing ────────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  if (!csrfRes.ok) throw new Error(`GET /api/auth/csrf -> ${csrfRes.status}`)
  const { csrfToken } = await csrfRes.json()
  const csrfCookies = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookies },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
    redirect: 'manual',
  })
  const raw = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) throw new Error(`sign-in for ${email} set no session cookie (HTTP ${res.status})`)
  return raw.split(';')[0].split('=').slice(1).join('=')
}

async function writeProfile(cookie, body) {
  const res = await fetch(`${BASE_URL}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookie}` },
    body: JSON.stringify(body),
  })
  return res.status
}

/**
 * Read an address and say whether the answer was the ONBOARDING refusal
 * specifically — 403 with onboardingRequired in the body — as opposed to any
 * other 403 the address might legitimately return.
 */
async function probe(cookie, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    cache: 'no-store',
  })
  let body = null
  try { body = await res.json() } catch { /* not json — fine */ }
  return {
    status: res.status,
    isOnboardingRefusal: res.status === 403 && body?.onboardingRequired === true,
    error: body?.error,
  }
}

async function newSignedInPage(browser, cookie) {
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: COOKIE_NAME, value: cookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax' }])
  return { ctx, page: await ctx.newPage() }
}

// ── the fifteen reading addresses, with real identifiers ────────────────────

function buildAddressList(db, delegateId) {
  const room = db.prepare(`
    SELECT r.id FROM ChatRoom r
    JOIN ChatMember m ON m.roomId = r.id AND m.userId = ?
    LIMIT 1
  `).get(delegateId)

  const message = db.prepare('SELECT id FROM Message ORDER BY createdAt DESC LIMIT 1').get()
  const otherUser = db.prepare(`SELECT id FROM User WHERE id <> ? AND role IN ('ATTENDEE','SPEAKER') LIMIT 1`).get(delegateId)
  const meeting = db.prepare('SELECT id FROM Meeting LIMIT 1').get()

  // FIXTURES, because a substitute identifier proves less than it looks like.
  //
  // The seeded delegate belongs to no chat room and the database holds no
  // meetings, so an earlier version of this script pointed those two addresses
  // at an identifier the delegate had no claim to. The refused direction was
  // fine — the guard runs before the handler ever reads the identifier — but
  // the RELEASED direction then passed on a membership refusal and a
  // not-found. "Not the onboarding refusal" is not the same as "serves the
  // delegate normally", and the plan's criterion is the latter: over-blocking
  // ruled out. Adversarial review caught the gap.
  //
  // So this run creates what the seed lacks — a room membership and a meeting
  // the delegate is part of — and removes both at the end.
  const anyRoom = room ?? db.prepare('SELECT id FROM ChatRoom LIMIT 1').get()

  const missing = []
  if (!anyRoom) missing.push('any chat room')
  if (!message) missing.push('any feed message')
  if (!otherUser) missing.push('another attendee')
  if (missing.length) {
    throw new Error(
      `cannot build the address list — the database has no ${missing.join(', no ')}. ` +
      `Reseed or pick a different account.`,
    )
  }

  if (!room) {
    db.prepare(`INSERT INTO ChatMember (id, roomId, userId, joinedAt) VALUES (?, ?, ?, datetime('now'))`)
      .run(FIXTURE_MEMBER_ID, anyRoom.id, delegateId)
    fixturesCreated.push(['ChatMember', FIXTURE_MEMBER_ID])
    console.log(`  fixture: joined the delegate to chat room ${anyRoom.id}`)
  }

  let meetingId = meeting ? meeting.id : null
  if (!meetingId) {
    const conference = db.prepare('SELECT id FROM Conference LIMIT 1').get()
    const timeBlock = db.prepare('SELECT id FROM TimeBlock LIMIT 1').get()
    if (conference && timeBlock) {
      db.prepare(`
        INSERT INTO Meeting (id, conferenceId, timeBlockId, organizerId, attendeeAId, attendeeBId,
                             status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', datetime('now'), datetime('now'))
      `).run(FIXTURE_MEETING_ID, conference.id, timeBlock.id, delegateId, delegateId, otherUser.id)
      fixturesCreated.push(['Meeting', FIXTURE_MEETING_ID])
      meetingId = FIXTURE_MEETING_ID
      console.log(`  fixture: created a meeting the delegate is part of`)
    } else {
      meetingId = 'no-such-meeting'
      console.log(`  NOTE: no Conference or TimeBlock row, so /api/meetings uses a placeholder id —`)
      console.log(`        its released direction shows only "not the onboarding refusal"`)
    }
  }

  return [
    '/api/data/people',
    '/api/people',
    '/api/data/schedule',
    '/api/data/speakers',
    '/api/data/home',
    '/api/data/meetings',
    '/api/data/my-schedule',
    '/api/data/setup',
    '/api/data/chat',
    '/api/chat/rooms',
    `/api/chat/rooms/${anyRoom.id}/messages`,
    '/api/chat/global',
    `/api/feed/${message.id}/comments`,
    `/api/friend/${otherUser.id}`,
    `/api/meetings/${meetingId}`,
  ]
}

// ── steps ───────────────────────────────────────────────────────────────────

async function step1_allRefusedWhileIncomplete(cookie, addresses) {
  console.log('\n── Step 1: every reading address refuses an incomplete delegate (AC-1, AC-3) ──')
  await writeProfile(cookie, { ...COMPLETE_PROFILE, ...INCOMPLETE })
  for (const path of addresses) {
    const r = await probe(cookie, path)
    if (r.isOnboardingRefusal) ok(`${path} -> 403 onboardingRequired`)
    else fail(`${path} -> ${r.status}${r.error ? ` "${r.error}"` : ''} — expected the onboarding refusal`)
  }
  if (addresses.length === 15) ok(`the list covered all 15 reading addresses`)
  else fail(`the list covered ${addresses.length} addresses, expected 15`)
}

async function step2_checklistStillWorks(browser, cookie) {
  console.log('\n── Step 2: the checklist renders and saves while everything else refuses (AC-4) ──')
  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle', timeout: 30000 })
    if (await page.locator('[data-testid="onboarding-checklist"]').count() > 0) {
      ok('the checklist rendered through a real page load')
    } else {
      fail('the checklist did not render — the delegate has no way out of the gate')
    }
    const heading = await page.locator('h1').first().innerText().catch(() => '')
    if (heading.trim().length > 0) ok(`the checklist shows its heading ("${heading.trim()}"), not a blank screen`)
    else fail('the checklist rendered no heading — a blank screen behind a normal 200')
  } finally {
    await ctx.close()
  }

  const status = await writeProfile(cookie, { jobTitle: COMPLETE_PROFILE.jobTitle })
  if (status === 200) ok('PATCH /api/profile -> 200 while every reading address refuses')
  else fail(`PATCH /api/profile -> ${status} while incomplete — the checklist cannot save`)
}

async function step3_releasedWhenComplete(cookie, addresses) {
  console.log('\n── Step 3: completing the required set releases every address (AC-2, AC-5) ──')
  await writeProfile(cookie, COMPLETE_PROFILE)
  for (const path of addresses) {
    const r = await probe(cookie, path)
    if (!r.isOnboardingRefusal) ok(`${path} -> ${r.status}, no longer the onboarding refusal`)
    else fail(`${path} -> still refused after completing the required set — over-blocking`)
  }
}

async function step4_reblockedWhenCleared(cookie, addresses) {
  console.log('\n── Step 4: clearing a required item refuses them again (AC-6) ──')
  await writeProfile(cookie, { solutionsSeeking: JSON.stringify([]) })
  let refused = 0
  for (const path of addresses) {
    const r = await probe(cookie, path)
    if (r.isOnboardingRefusal) refused++
    else fail(`${path} -> ${r.status} after clearing solutions — expected the onboarding refusal again`)
  }
  if (refused === addresses.length) {
    ok(`all ${refused} addresses refused again on the next fresh request, from an emptied multi-select`)
  }
}

async function step5_diagnosticEndpointGone(cookie) {
  console.log('\n── Step 5: the diagnostic endpoint no longer exists (AC-7) ──')
  const res = await fetch(`${BASE_URL}/api/debug?email=${encodeURIComponent(EMAIL)}&pw=${encodeURIComponent(PASSWORD)}`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    cache: 'no-store',
  })
  const text = await res.text()
  if (res.status === 404) ok('/api/debug -> 404, the endpoint is gone')
  else fail(`/api/debug -> ${res.status} — expected 404`)

  // Match the strings the deleted endpoint actually emitted, not loose words.
  // An earlier version of this check looked for "authorize" and matched
  // "unauthorized" inside the standard not-found page payload — a false alarm
  // that claimed a leak where there was none.
  const OLD_OUTPUT = [/DB mode: /, /verifyPassword: /, /INLINE authorize/, /ACTUAL authorize/]
  const leaked = OLD_OUTPUT.filter(re => re.test(text)).map(String)
  if (leaked.length === 0) {
    ok('the response carries none of the old diagnostic output')
  } else {
    fail(`the response still contains diagnostic output: ${leaked.join(', ')}`)
  }

  // The app must still sign in without it — proved by this run having a session
  // at all, and re-proved here from scratch.
  try {
    await signIn(EMAIL, PASSWORD)
    ok('sign-in still works with the diagnostic endpoint removed')
  } catch (err) {
    fail(`sign-in broke after removing the endpoint: ${err.message}`)
  }
}

// ── run ─────────────────────────────────────────────────────────────────────

const db = new DatabaseSync(DB_PATH)
let browser
let snap = null

try {
  console.log('\nPhase 4 — delegate read refusal, diagnostic endpoint removed')
  console.log(`  target: ${BASE_URL}`)
  console.log(`  database: ${DB_PATH}`)

  const delegate = db.prepare('SELECT id FROM User WHERE email = ?').get(EMAIL)
  if (!delegate) throw new Error(`no User row for ${EMAIL}`)

  snap = db.prepare(`SELECT ${REQUIRED_COLUMNS.join(', ')} FROM User WHERE email = ?`).get(EMAIL)

  const addresses = buildAddressList(db, delegate.id)
  console.log(`  built a list of ${addresses.length} reading addresses using real identifiers`)

  browser = await chromium.launch()
  const cookie = await signIn(EMAIL, PASSWORD)

  await step1_allRefusedWhileIncomplete(cookie, addresses)
  await step2_checklistStillWorks(browser, cookie)
  await step3_releasedWhenComplete(cookie, addresses)
  await step4_reblockedWhenCleared(cookie, addresses)
  await step5_diagnosticEndpointGone(cookie)
} catch (err) {
  fail(`setup or run error: ${err.message}`)
} finally {
  if (browser) await browser.close()

  // Remove the fixtures before restoring the profile, and report the counts so
  // a reader can see the run left nothing behind.
  for (const [table, id] of fixturesCreated.reverse()) {
    try {
      const n = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes
      console.log(`  removed fixture ${table} ${id} (${n} row)`)
    } catch (err) {
      fail(`could not remove fixture ${table} ${id}: ${err.message}`)
    }
  }

  if (snap) {
    try {
      db.prepare(
        `UPDATE User SET ${REQUIRED_COLUMNS.map(c => `${c} = ?`).join(', ')} WHERE email = ?`,
      ).run(...REQUIRED_COLUMNS.map(c => snap[c] ?? null), EMAIL)
      console.log(`  restored ${EMAIL} to its original required-set values`)
    } catch (err) {
      fail(`could not restore ${EMAIL}: ${err.message}`)
    }
  }
  db.close()
}

console.log('\n' + '─'.repeat(60))
console.log(`  Results: ${passCount} passed, ${failCount} failed`)
console.log('─'.repeat(60))
console.log(
  '\n  A pass here is evidence about the assertions listed above and nothing\n' +
  '  wider. It covers the participant app only — the sponsor portal carries no\n' +
  '  gate until Phase 5.\n',
)

process.exit(failCount === 0 ? 0 : 1)
