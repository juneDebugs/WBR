#!/usr/bin/env node
/**
 * Phase 3 verification: the onboarding gate is about the person, not the app.
 *
 * Covers the plan's Phase 3 acceptance criteria as contract checks
 * (env-agnostic per docs/smoketests/CONTRACT.md §1.1 — every pass criterion
 * below is a binary observable: a redirect happens or it does not, a request
 * returns 403 or it does not).
 *
 *   AC-1  An ORGANIZER account with a deliberately incomplete profile reaches
 *         every participant-app screen and is not redirected to the checklist.
 *   AC-2  The same account is refused by no participant-app data address.
 *   AC-3  A STAFF account behaves identically to the organizer account.
 *   AC-4  A delegate account with the SAME incomplete profile is still blocked
 *         from every screen and still refused at the guarded addresses — the
 *         exemption cannot be used to skip onboarding.
 *   AC-5  Only the event-operating roles are exempt. Asserted behaviourally by
 *         showing that a SPONSOR-role account with the same incomplete profile
 *         is still blocked. A second, wider role list would show up here.
 *   AC-6  The deliberately-incomplete delegate demonstration account
 *         (onboarding-demo@test.com) is still blocked, so the gate demo still
 *         works on stage.
 *
 * NOT asserted here, on purpose. Two of the plan's Phase 3 criteria are
 * structural rather than behavioural — that the exemption reuses the existing
 * isWbrStaff() role test rather than introducing a second role list, and that
 * the gate's definition carries a note explaining the exemption. The plan's own
 * testing rule says a test must never assert a function name or a module
 * location, because such a test breaks on a rename while passing through a real
 * behaviour change. Both are recorded as checked items with file references in
 * docs/smoketests/phase-3-person-based-gate-exemption.md instead. AC-5 above is
 * the behavioural half of the "no second role list" criterion, and it is the
 * half that can actually go wrong.
 *
 * Prerequisites:
 *   - Attendee app reachable at ATTENDEE_BASE_URL (default http://localhost:3001).
 *     Tier C: pnpm --filter attendee build && pnpm --filter attendee start
 *   - apps/attendee/.env.local with DATABASE_URL (ABSOLUTE file: path) and
 *     NEXTAUTH_SECRET. The README's relative DATABASE_URL does not resolve at
 *     runtime and every page fails with "Unable to open the database file".
 *   - The canonical demo accounts. Missing rows self-heal on first sign-in via
 *     packages/db/src/test-accounts.ts.
 *   - Playwright + chromium installed.
 *
 * WHY THIS SCRIPT CREATES AN ACCOUNT. There is no canonical STAFF demo login.
 * staff@wbr.com exists in the seeded data but is listed among the five LEGACY
 * accounts to erase in packages/db/scripts/reset-test-accounts.mjs, and it does
 * not accept the standard demo password. Depending on it would make this script
 * fail the next time anyone runs pnpm db:reset-test-accounts. So the run creates
 * a throwaway STAFF account and deletes it again, the same pattern the plan
 * prescribes for the Phase 7 no-company case.
 *
 * This script snapshots every account's required-set fields on start and
 * restores them on exit, so a run leaves the demo data as it found it.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-3-person-based-gate-exemption.mjs
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

const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'

/** Tab roots. An exempt account must reach all of these; a gated one must not. */
const GATED_SECTIONS = [
  '/home', '/schedule', '/speakers', '/people',
  '/meetings', '/chat', '/my-schedule', '/setup',
]

/**
 * A marker written into anything this run creates, so cleanup can find it
 * again without guessing. Fixed rather than random so that a run killed
 * half-way can still be cleaned up by hand with a single query.
 */
const PROBE_MARKER = 'phase-3-exemption-probe'

/**
 * The data addresses that carry the guard as of Phase 3 — all four CHANGE data.
 * Reading addresses are not guarded yet; Phase 4 closes that and will extend
 * this list. PATCH /api/profile is deliberately absent: the checklist saves
 * through it, so guarding it would trap every incomplete participant.
 *
 * MIND THE SIDE EFFECTS. These four probes exist to observe a status code, but
 * two of them SUCCEED for an exempt account — that is the point of the phase.
 * A successful probe writes a real row: a follow relationship, and a message in
 * the global feed. The first version of this script left both behind, including
 * a probe message sitting in the demonstration feed. Everything created here is
 * removed in the cleanup block at the end of the run.
 */
const GUARDED_ENDPOINTS = [
  { method: 'POST', path: '/api/friend/test-brand', creates: 'a Follow row' },
  { method: 'POST', path: '/api/posts/no-such-post/like', creates: 'a PostLike row, if the post existed' },
  { method: 'POST', path: '/api/chat/global', body: { content: PROBE_MARKER }, creates: 'a Message row' },
  { method: 'POST', path: '/api/sessions/no-such-session/bookmark', creates: 'a SessionBookmark row, if the session existed' },
]

/** Two required fields cleared. Same shape of incompleteness for every account. */
const INCOMPLETE = { companySize: null, annualRevenue: null }

const THROWAWAY_STAFF = {
  id: 'phase3-throwaway-staff',
  email: 'phase3-throwaway-staff@wbr.invalid',
  name: 'Phase 3 Throwaway Staff',
  role: 'STAFF',
}

let passCount = 0
let failCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }

// ── plumbing ────────────────────────────────────────────────────────────────

async function signIn(email, password = PASSWORD) {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  if (!csrfRes.ok) throw new Error(`GET /api/auth/csrf -> ${csrfRes.status}`)
  const { csrfToken } = await csrfRes.json()
  const csrfCookies = (csrfRes.headers.getSetCookie?.() ?? [])
    .map(c => c.split(';')[0]).join('; ')

  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookies },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
    redirect: 'manual',
  })
  const raw = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) {
    throw new Error(
      `credentials sign-in for ${email} did not set ${COOKIE_NAME} (HTTP ${res.status}). ` +
      `Check NEXTAUTH_SECRET and that the account exists with this password.`,
    )
  }
  return raw.split(';')[0].split('=').slice(1).join('=')
}

async function writeProfile(cookie, body) {
  const res = await fetch(`${BASE_URL}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookie}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH /api/profile -> ${res.status}`)
}

/** Follow no redirects — the redirect itself is what is being observed. */
async function rawGet(cookie, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    redirect: 'manual',
  })
  return { status: res.status, location: res.headers.get('location') }
}

async function callEndpoint(cookie, { method, path, body }) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookie}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.status
}

async function newSignedInPage(browser, cookie) {
  const ctx = await browser.newContext()
  await ctx.addCookies([{
    name: COOKIE_NAME, value: cookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax',
  }])
  return { ctx, page: await ctx.newPage() }
}

// ── direct database access, for snapshot/restore and the throwaway account ───
//
// Reading the required-set fields straight from the database rather than
// through /api/data/setup, because Phase 4 guards the reading addresses and a
// snapshot taken through one of them would stop working then.

const REQUIRED_COLUMNS = ['name', 'jobTitle', 'company', 'companySize', 'annualRevenue', 'solutionsSeeking']

function openDb() {
  return new DatabaseSync(DB_PATH)
}

function snapshot(db, email) {
  const row = db.prepare(
    `SELECT ${REQUIRED_COLUMNS.join(', ')} FROM User WHERE email = ?`,
  ).get(email)
  if (!row) throw new Error(`no User row for ${email} — cannot snapshot`)
  return row
}

function restore(db, email, snap) {
  db.prepare(
    `UPDATE User SET ${REQUIRED_COLUMNS.map(c => `${c} = ?`).join(', ')} WHERE email = ?`,
  ).run(...REQUIRED_COLUMNS.map(c => snap[c] ?? null), email)
}

async function createThrowawayStaff(db) {
  // Reuse the scrypt hasher the app itself uses, so the password is valid by
  // construction rather than by a copied hash that could go stale.
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  db.prepare('DELETE FROM User WHERE id = ? OR email = ?').run(THROWAWAY_STAFF.id, THROWAWAY_STAFF.email)
  db.prepare(`
    INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(THROWAWAY_STAFF.id, THROWAWAY_STAFF.email, THROWAWAY_STAFF.name, THROWAWAY_STAFF.role, hash)
  // Deliberately created with NO required-set fields at all: incomplete by
  // construction, so nothing has to be cleared to make the point.
}

function deleteThrowawayStaff(db) {
  const info = db.prepare('DELETE FROM User WHERE id = ? OR email = ?')
    .run(THROWAWAY_STAFF.id, THROWAWAY_STAFF.email)
  return info.changes
}

// ── cleanup of rows the probes create ───────────────────────────────────────
//
// Two of the four probes succeed for an exempt account, which is the whole
// point of this phase — so they write real rows. Deleting the throwaway staff
// account happens to remove its rows by cascade, but the organizer's rows
// survive and must be removed explicitly. Do not rely on cascade.

/** The follow relationships that exist for these accounts right now. */
function snapshotFollows(db, userIds) {
  const marks = userIds.map(() => '?').join(', ')
  const rows = db.prepare(
    `SELECT id, followerId, followingId FROM Follow WHERE followerId IN (${marks})`,
  ).all(...userIds)
  return new Set(rows.map(r => r.id))
}

/** Remove every row the probes created: new follows, probe messages, stray likes and bookmarks. */
function cleanupProbeRows(db, userIds, followsBefore) {
  const removed = { follows: 0, messages: 0, likes: 0, bookmarks: 0 }
  const marks = userIds.map(() => '?').join(', ')

  const followsNow = db.prepare(
    `SELECT id FROM Follow WHERE followerId IN (${marks})`,
  ).all(...userIds)
  for (const row of followsNow) {
    if (followsBefore.has(row.id)) continue
    removed.follows += db.prepare('DELETE FROM Follow WHERE id = ?').run(row.id).changes
  }

  removed.messages += db.prepare('DELETE FROM Message WHERE content LIKE ?')
    .run(`%${PROBE_MARKER}%`).changes
  removed.likes += db.prepare(`DELETE FROM PostLike WHERE userId IN (${marks}) AND postId = 'no-such-post'`)
    .run(...userIds).changes
  removed.bookmarks += db.prepare(`DELETE FROM SessionBookmark WHERE userId IN (${marks}) AND sessionId = 'no-such-session'`)
    .run(...userIds).changes

  return removed
}

// ── shared assertion bodies ─────────────────────────────────────────────────

async function assertReachesEverySection(cookie, who) {
  for (const path of GATED_SECTIONS) {
    const { status, location } = await rawGet(cookie, path)
    const toChecklist = status >= 300 && status < 400 && (location ?? '').includes('/onboarding')
    if (toChecklist) fail(`${who}: ${path} -> redirected to /onboarding — the exemption did not apply`)
    else if (status === 200) ok(`${who}: ${path} -> 200, not routed to the checklist`)
    else fail(`${who}: ${path} -> ${status} ${location ?? ''} — expected 200`)
  }
}

async function assertBlockedFromEverySection(cookie, who) {
  for (const path of GATED_SECTIONS) {
    const { status, location } = await rawGet(cookie, path)
    const toChecklist = status >= 300 && status < 400 && (location ?? '').includes('/onboarding')
    if (toChecklist) ok(`${who}: ${path} -> redirect to /onboarding (still gated)`)
    else fail(`${who}: ${path} -> ${status} ${location ?? '(no redirect)'} — expected a redirect to /onboarding`)
  }
}

async function assertRefusedByNoEndpoint(cookie, who) {
  for (const ep of GUARDED_ENDPOINTS) {
    const status = await callEndpoint(cookie, ep)
    // Anything but 403 passes. These are deliberately non-existent ids, so 400
    // and 404 are the normal answers; what matters is that the completeness
    // guard did not fire.
    if (status === 403) fail(`${who}: ${ep.method} ${ep.path} -> 403 — refused despite the exemption`)
    else ok(`${who}: ${ep.method} ${ep.path} -> ${status}, not 403`)
  }
}

async function assertRefusedByEveryEndpoint(cookie, who) {
  for (const ep of GUARDED_ENDPOINTS) {
    const status = await callEndpoint(cookie, ep)
    if (status === 403) ok(`${who}: ${ep.method} ${ep.path} -> 403 (still refused)`)
    else fail(`${who}: ${ep.method} ${ep.path} -> ${status} — expected 403`)
  }
}

// ── steps ───────────────────────────────────────────────────────────────────

async function step1_organizerExempt(cookie) {
  console.log('\n── Step 1: an organizer with an incomplete profile reaches every section (AC-1) ──')
  await writeProfile(cookie, INCOMPLETE)
  await assertReachesEverySection(cookie, 'organizer')
}

async function step2_organizerRefusedNowhere(cookie) {
  console.log('\n── Step 2: the same organizer is refused by no guarded address (AC-2) ──')
  await assertRefusedByNoEndpoint(cookie, 'organizer')
}

async function step3_organizerNotShownChecklist(browser, cookie) {
  console.log('\n── Step 3: the exempt organizer is not shown a checklist for a set they are not held to ──')
  const { status, location } = await rawGet(cookie, '/onboarding')
  if (status >= 300 && status < 400 && (location ?? '').includes('/home')) {
    ok('/onboarding -> redirect to /home for an exempt account')
  } else {
    fail(`/onboarding -> ${status} ${location ?? ''} — expected a redirect to /home`)
  }

  // Through a real page load, because a status code alone cannot tell a
  // rendered checklist from a blank screen behind a normal 200.
  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle', timeout: 30000 })
    const checklists = await page.locator('[data-testid="onboarding-checklist"]').count()
    if (checklists === 0) ok('no checklist form rendered for the exempt organizer')
    else fail('a checklist form rendered for an account the gate had already released')
    const body = (await page.locator('body').innerText()).trim()
    if (body.length > 0) ok(`the landing page rendered content (${body.length} chars), not a blank screen`)
    else fail('the landing page rendered blank')
  } finally {
    await ctx.close()
  }
}

async function step4_staffExempt(db, browser) {
  console.log('\n── Step 4: a staff account behaves identically to the organizer (AC-3) ──')
  await createThrowawayStaff(db)
  ok(`created throwaway STAFF account ${THROWAWAY_STAFF.email} with no required fields at all`)

  const cookie = await signIn(THROWAWAY_STAFF.email)
  ok('the throwaway staff account signed in')

  await assertReachesEverySection(cookie, 'staff')
  await assertRefusedByNoEndpoint(cookie, 'staff')

  const { status, location } = await rawGet(cookie, '/onboarding')
  if (status >= 300 && status < 400 && (location ?? '').includes('/home')) {
    ok('staff: /onboarding -> redirect to /home')
  } else {
    fail(`staff: /onboarding -> ${status} ${location ?? ''} — expected a redirect to /home`)
  }
}

async function step5_delegateStillBlocked(cookie) {
  console.log('\n── Step 5: a delegate with the SAME incomplete profile is still blocked (AC-4) ──')
  await writeProfile(cookie, INCOMPLETE)
  await assertBlockedFromEverySection(cookie, 'delegate')
  await assertRefusedByEveryEndpoint(cookie, 'delegate')
}

async function step6_sponsorRoleStillBlocked(cookie) {
  console.log('\n── Step 6: only event-operating roles are exempt — a sponsor role is still gated (AC-5) ──')
  await writeProfile(cookie, INCOMPLETE)
  await assertBlockedFromEverySection(cookie, 'sponsor-role')
  await assertRefusedByEveryEndpoint(cookie, 'sponsor-role')
}

async function step7_demoAccountStillBlocked(browser) {
  console.log('\n── Step 7: the gate demonstration account is still blocked, untouched (AC-6) ──')
  const cookie = await signIn('onboarding-demo@test.com')
  const { status, location } = await rawGet(cookie, '/home')
  if (status >= 300 && status < 400 && (location ?? '').includes('/onboarding')) {
    ok('onboarding-demo@test.com -> still redirected to /onboarding (the demo still works)')
  } else {
    fail(`onboarding-demo@test.com -> ${status} ${location ?? ''} — the gate demonstration is broken`)
  }

  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle', timeout: 30000 })
    if (await page.locator('[data-testid="onboarding-checklist"]').count() > 0) {
      ok('the checklist renders for the demonstration account')
    } else {
      fail('the checklist did not render for the demonstration account')
    }
  } finally {
    await ctx.close()
  }
}

// ── run ─────────────────────────────────────────────────────────────────────

const db = openDb()
let browser
let probeUserIds = []
let followsBefore = new Set()
const snapshots = {}
const ACCOUNTS = {
  organizer: 'wbr@test.com',
  delegate: 'stephcurry@test.com',
  sponsor: 'sponsor@test.com',
}

try {
  console.log(`\nPhase 3 — person-based gate exemption`)
  console.log(`  target: ${BASE_URL}`)
  console.log(`  database: ${DB_PATH}`)

  for (const [label, email] of Object.entries(ACCOUNTS)) {
    snapshots[email] = snapshot(db, email)
    console.log(`  snapshotted ${label} (${email})`)
  }

  // Ids of every account whose probes could write a row, so the cleanup block
  // knows what to look for. The throwaway staff id is included even though its
  // rows go by cascade — relying on cascade would be relying on a detail this
  // script does not control.
  probeUserIds = Object.values(ACCOUNTS).map(email => {
    const row = db.prepare('SELECT id FROM User WHERE email = ?').get(email)
    return row.id
  }).concat(THROWAWAY_STAFF.id)
  followsBefore = snapshotFollows(db, probeUserIds)

  browser = await chromium.launch()

  const organizerCookie = await signIn(ACCOUNTS.organizer)
  await step1_organizerExempt(organizerCookie)
  await step2_organizerRefusedNowhere(organizerCookie)
  await step3_organizerNotShownChecklist(browser, organizerCookie)

  await step4_staffExempt(db, browser)

  const delegateCookie = await signIn(ACCOUNTS.delegate)
  await step5_delegateStillBlocked(delegateCookie)

  const sponsorCookie = await signIn(ACCOUNTS.sponsor)
  await step6_sponsorRoleStillBlocked(sponsorCookie)

  await step7_demoAccountStillBlocked(browser)
} catch (err) {
  fail(`setup or run error: ${err.message}`)
} finally {
  if (browser) await browser.close()

  // Restore every account and remove the throwaway, whatever happened above.
  for (const [email, snap] of Object.entries(snapshots)) {
    try {
      restore(db, email, snap)
      console.log(`  restored ${email}`)
    } catch (err) {
      fail(`could not restore ${email}: ${err.message}`)
    }
  }
  // Remove the rows the probes wrote BEFORE deleting the throwaway account, so
  // the count reported is real rather than hidden by a cascade.
  try {
    const removed = cleanupProbeRows(db, probeUserIds, followsBefore)
    console.log(
      `  removed probe rows — ${removed.follows} follow, ${removed.messages} message, ` +
      `${removed.likes} like, ${removed.bookmarks} bookmark`,
    )
    const stragglers = db.prepare('SELECT COUNT(*) AS n FROM Message WHERE content LIKE ?')
      .get(`%${PROBE_MARKER}%`).n
    if (stragglers === 0) ok('no probe message left in the feed')
    else fail(`${stragglers} probe message(s) still in the feed — clean up by hand`)
  } catch (err) {
    fail(`could not remove probe rows: ${err.message}`)
  }

  try {
    const removed = deleteThrowawayStaff(db)
    console.log(`  removed throwaway staff account (${removed} row deleted)`)
    if (removed === 0) console.log('  (nothing to remove — it was never created)')
  } catch (err) {
    fail(`could not remove the throwaway staff account: ${err.message}`)
  }
  db.close()
}

console.log('\n' + '─'.repeat(60))
console.log(`  Results: ${passCount} passed, ${failCount} failed`)
console.log('─'.repeat(60))
console.log(
  '\n  A pass here is evidence about the assertions listed above and nothing\n' +
  '  wider. In particular it says nothing about reading addresses, which are\n' +
  '  not guarded until Phase 4.\n',
)

process.exit(failCount === 0 ? 0 : 1)
