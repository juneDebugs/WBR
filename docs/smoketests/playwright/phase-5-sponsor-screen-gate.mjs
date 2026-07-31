#!/usr/bin/env node
/**
 * Phase 5 — sponsor screen gate + checklist.
 *
 * Acceptance criteria from `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`:
 *
 *   AC-1  A representative whose company is missing any of the six required items
 *         is blocked from dashboard, browse, meetings, profile, schedule and
 *         submissions, and lands on the checklist.
 *   AC-2  Every authenticated route group in the sponsor app is enumerated in the
 *         smoketest document and accounted for.
 *   AC-3  The checklist names exactly the missing items, in the reminder's wording.
 *   AC-4  The checklist offers solutions OFFERED and never solutions sought.
 *   AC-5  Completing the six releases the representative within one navigation.
 *   AC-6  Clearing any one of the six blocks again on the next fresh request —
 *         the gate consults the required set, not a one-time marker.
 *   AC-7  The checklist route is outside the portal group: it does not redirect
 *         to itself and renders no portal navigation.
 *   AC-8  An organizer account and a staff account both reach every portal screen
 *         and are never routed to the checklist.
 *   AC-9  The sponsor demonstration login enters the portal without seeing the
 *         checklist, consistent with its company satisfying the six.
 *   AC-10 The admin app and the meetings portal remain reachable throughout, for
 *         every account used in the run.
 *   AC-11 Blocked and released states are both asserted through real page loads
 *         checking rendered content, not response codes.
 *
 * AC-2 is a document deliverable, not a runtime assertion — it lives in
 * docs/smoketests/phase-5-sponsor-screen-gate.md with the shell commands that
 * reproduce it. Asserting a directory listing here would be a test that breaks on
 * a rename while passing through a real behaviour change, which the plan's own
 * testing rule forbids.
 *
 * WHAT A GREEN RUN IS EVIDENCE OF. The assertions listed below and nothing
 * wider. Phase 1 passed 33 of 33 while a delegate blocked from every screen
 * could still post in a chat room, and 48 of 48 while a client-side crash was
 * reachable. Every defect that cycle came from adversarial review or from
 * somebody checking a claim — none from a test going red.
 *
 * NOT ASSERTED HERE, ON PURPOSE:
 *   - The sponsor app's 21 request handlers. Phase 5 is the SCREEN gate only.
 *     An incomplete representative is still served by every data address in this
 *     app after this phase. Phase 6 closes that, and until it does the gate is a
 *     screen-level control, not a data control. Stated plainly because the
 *     equivalent gap in the attendee app went a whole phase before anyone wrote
 *     it down (FP finding F-4).
 *   - The no-exhibiting-company case for a SPONSOR-role account. Phase 7 owns it.
 *     What Phase 5 asserts is the neighbouring case that DOES have a seeded
 *     account: an ORGANIZER with no company, released by role.
 *
 * WHY THIS SCRIPT CREATES AN ACCOUNT. There is no canonical STAFF demo login.
 * staff@wbr.com exists in the seeded data but is listed among the five LEGACY
 * accounts to erase in packages/db/scripts/reset-test-accounts.mjs, and it does
 * not accept the standard demo password. Settled 2026-07-31: every phase needing
 * a staff account creates a throwaway and deletes it again. Same pattern as the
 * Phase 3 script and Phase 7.
 *
 * THIS RUN MUTATES A SEEDED COMPANY. The demonstration company's required
 * columns are snapshotted on start and restored on exit, including on failure.
 * A run killed with SIGKILL mid-way leaves the company incomplete; re-running
 * restores it, and the values are printed on start so they can be put back by
 * hand.
 *
 * Prerequisites:
 *   - Sponsor app reachable at SPONSOR_BASE_URL (default http://localhost:3003).
 *     Tier C, not a dev server: pnpm --filter sponsor build && pnpm --filter sponsor start
 *     Kill anything already on the port first — a server started before your
 *     change serves stale code.
 *   - apps/sponsor/.env.local with DATABASE_URL (absolute file: path) and
 *     NEXTAUTH_SECRET.
 *   - For AC-10 only: admin app on 3000 and meetings portal on 3002. If either
 *     is not listening the run records a loud SKIP for that criterion rather
 *     than a pass.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-5-sponsor-screen-gate.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')

const BASE_URL = process.env.SPONSOR_BASE_URL ?? 'http://localhost:3003'
const WEB_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3000'
const MEETINGS_URL = process.env.MEETINGS_BASE_URL ?? 'http://localhost:3002'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'password123'

/** The six portal screens. A released account reaches all of these; a blocked one none. */
const PORTAL_SCREENS = [
  '/dashboard', '/browse', '/meetings', '/profile', '/schedule', '/submissions',
]

const SPONSOR_DEMO = 'sponsor@test.com'
const ORGANIZER_DEMO = 'wbr@test.com'

const THROWAWAY_STAFF = {
  id: 'phase5-throwaway-staff',
  email: 'phase5-throwaway-staff@wbr.invalid',
  name: 'Phase 5 Throwaway Staff',
  role: 'STAFF',
}

let passCount = 0
let failCount = 0
let skipCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }
function skip(msg) { skipCount++; console.log(`  – SKIP ${msg}`) }
function section(title) { console.log(`\n${title}`) }

// ── plumbing ────────────────────────────────────────────────────────────────

async function signIn(email, password = PASSWORD, base = BASE_URL) {
  const csrfRes = await fetch(`${base}/api/auth/csrf`)
  if (!csrfRes.ok) throw new Error(`GET ${base}/api/auth/csrf -> ${csrfRes.status}`)
  const { csrfToken } = await csrfRes.json()
  const csrfCookies = (csrfRes.headers.getSetCookie?.() ?? [])
    .map(c => c.split(';')[0]).join('; ')

  const res = await fetch(`${base}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookies },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
    redirect: 'manual',
  })
  const cookieName = base.startsWith('https://')
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'
  const raw = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith(`${cookieName}=`))
  if (!raw) {
    throw new Error(
      `credentials sign-in for ${email} at ${base} did not set ${cookieName} (HTTP ${res.status}). ` +
      `Check NEXTAUTH_SECRET and that the account exists with this password.`,
    )
  }
  return raw.split(';')[0].split('=').slice(1).join('=')
}

/** Follow no redirects — the redirect itself is what is being observed. */
async function rawGet(cookie, path, base = BASE_URL) {
  const res = await fetch(`${base}${path}`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    redirect: 'manual',
  })
  return { status: res.status, location: res.headers.get('location') }
}

async function patchProfile(cookie, body) {
  const res = await fetch(`${BASE_URL}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookie}` },
    body: JSON.stringify(body),
  })
  return res.status
}

async function newSignedInPage(browser, cookie, base = BASE_URL) {
  const ctx = await browser.newContext()
  await ctx.addCookies([{
    name: COOKIE_NAME, value: cookie, url: base, httpOnly: true, sameSite: 'Lax',
  }])
  return { ctx, page: await ctx.newPage() }
}

async function isListening(base) {
  try {
    await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(2500) })
    return true
  } catch {
    return false
  }
}

// ── database access, for snapshot/restore and the throwaway account ──────────
//
// Read straight from the database rather than through a data address, because
// Phase 6 guards those and a snapshot taken through one would stop working then.

const SPONSOR_COLUMNS = [
  'logoUrl', 'tagline', 'description', 'contactName', 'contactEmail', 'solutionsOffering', 'website',
]

function openDb() {
  const db = new DatabaseSync(DB_PATH)
  // THE SERVER IS READING THIS SAME FILE THROUGHOUT THE RUN. This database is in
  // rollback-journal mode, not write-ahead logging (`PRAGMA journal_mode` reports
  // `delete`), so a write fails IMMEDIATELY with "database is locked" whenever a
  // reader holds the lock rather than waiting its turn.
  //
  // Not hypothetical: the first version of this script died exactly there. The
  // clear/restore loop below threw on its first write, and — much worse — the
  // restore in the cleanup block threw the same way, so a run could have left the
  // demonstration company incomplete and the demonstration login blocked. It
  // survived by luck, because the failure landed before the first column was
  // cleared rather than after.
  //
  // Wait instead of failing. Ten seconds is far longer than any request this app
  // makes and still short enough to surface a genuinely stuck lock.
  db.exec('PRAGMA busy_timeout = 10000')
  return db
}

/**
 * Retry a database write a few times. `busy_timeout` above covers the ordinary
 * case; this covers the case where it expires anyway, which matters most for the
 * restore in the cleanup block — the one write in this script that must not be
 * allowed to fail quietly.
 */
function withRetry(label, fn, attempts = 5) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      return fn()
    } catch (err) {
      lastErr = err
      if (!String(err.message).includes('locked')) throw err
      // Synchronous back-off: this file is deliberately synchronous around the
      // database so a half-finished write cannot interleave with a page request.
      const until = Date.now() + i * 250
      while (Date.now() < until) { /* spin */ }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastErr.message}`)
}

function sponsorIdFor(db, email) {
  const row = db.prepare('SELECT sponsorId FROM User WHERE email = ?').get(email)
  if (!row) throw new Error(`no User row for ${email}`)
  if (!row.sponsorId) throw new Error(`${email} has no sponsorId — cannot run the gated-participant assertions`)
  return row.sponsorId
}

function snapshotSponsor(db, sponsorId) {
  const row = db.prepare(
    `SELECT name, ${SPONSOR_COLUMNS.join(', ')} FROM Sponsor WHERE id = ?`,
  ).get(sponsorId)
  if (!row) throw new Error(`no Sponsor row for ${sponsorId} — cannot snapshot`)
  return row
}

function restoreSponsor(db, sponsorId, snap) {
  withRetry('restore sponsor', () =>
    db.prepare(
      `UPDATE Sponsor SET ${SPONSOR_COLUMNS.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
    ).run(...SPONSOR_COLUMNS.map(c => snap[c] ?? null), sponsorId),
  )
}

function clearSponsorColumn(db, sponsorId, column) {
  if (!SPONSOR_COLUMNS.includes(column)) throw new Error(`refusing to clear unknown column ${column}`)
  withRetry(`clear ${column}`, () =>
    db.prepare(`UPDATE Sponsor SET ${column} = NULL WHERE id = ?`).run(sponsorId),
  )
}

async function createThrowawayStaff(db) {
  // Reuse the scrypt hasher the app itself uses, so the password is valid by
  // construction rather than by a copied hash that could go stale.
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  withRetry('create throwaway staff', () => {
    db.prepare('DELETE FROM User WHERE id = ? OR email = ?').run(THROWAWAY_STAFF.id, THROWAWAY_STAFF.email)
    db.prepare(`
      INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(THROWAWAY_STAFF.id, THROWAWAY_STAFF.email, THROWAWAY_STAFF.name, THROWAWAY_STAFF.role, hash)
  })
  // Deliberately created with NO sponsorId and no profile fields: it is exempt
  // by role, and if the exemption ever stopped working this account would be the
  // loudest possible failure rather than a quiet pass.
}

function deleteThrowawayStaff(db) {
  return withRetry('delete throwaway staff', () =>
    db.prepare('DELETE FROM User WHERE id = ? OR email = ?')
      .run(THROWAWAY_STAFF.id, THROWAWAY_STAFF.email).changes,
  )
}

// ── shared assertion bodies ─────────────────────────────────────────────────

async function assertReachesEveryScreen(cookie, who) {
  for (const path of PORTAL_SCREENS) {
    const { status, location } = await rawGet(cookie, path)
    const toChecklist = status >= 300 && status < 400 && (location ?? '').includes('/onboarding')
    if (toChecklist) fail(`${who}: ${path} -> redirected to /onboarding — should not be gated`)
    else if (status === 200) ok(`${who}: ${path} -> 200, not routed to the checklist`)
    else fail(`${who}: ${path} -> ${status} ${location ?? ''} — expected 200`)
  }
}

/**
 * AC-11 says blocked and released are both asserted through real page loads on
 * the gated screens. The status loop above does not do that, and for a while this
 * script ran the rendered-content check on /dashboard alone while its own wording
 * claimed all six — so /browse, /profile or /submissions could have answered 200
 * while rendering nothing and this run would still have been green. Adversarial
 * review caught the gap between the claim and the coverage. Every screen, both
 * directions, rendered content.
 */
async function assertRendersEveryScreen(browser, cookie, who, expect) {
  for (const path of PORTAL_SCREENS) {
    if (expect === 'portal') await assertRendersPortal(browser, cookie, who, path)
    else await assertRendersChecklist(browser, cookie, who, path)
  }
}

async function assertBlockedFromEveryScreen(cookie, who) {
  for (const path of PORTAL_SCREENS) {
    const { status, location } = await rawGet(cookie, path)
    const toChecklist = status >= 300 && status < 400 && (location ?? '').includes('/onboarding')
    if (toChecklist) ok(`${who}: ${path} -> redirect to /onboarding (gated)`)
    else fail(`${who}: ${path} -> ${status} ${location ?? '(no redirect)'} — expected a redirect to /onboarding`)
  }
}

/**
 * AC-11's half of the work: a real page load, checking what rendered.
 * A status code cannot tell a working screen from a blank one — FP finding F-7
 * recorded a screen that returned 200 while rendering nothing.
 */
async function assertRendersPortal(browser, cookie, who, path) {
  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' })
    const url = page.url()
    const nav = await page.locator('[data-testid="portal-nav"]').count()
    const checklist = await page.locator('[data-testid="sponsor-onboarding-checklist"]').count()
    if (url.includes('/onboarding')) {
      fail(`${who}: page load of ${path} landed on ${url} — expected the portal`)
    } else if (nav === 0) {
      fail(`${who}: page load of ${path} rendered without the portal navigation (url ${url})`)
    } else if (checklist > 0) {
      fail(`${who}: page load of ${path} rendered the checklist inside the portal`)
    } else {
      ok(`${who}: page load of ${path} rendered the portal with its navigation`)
    }
  } finally {
    await ctx.close()
  }
}

async function assertRendersChecklist(browser, cookie, who, path) {
  const { ctx, page } = await newSignedInPage(browser, cookie)
  try {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' })
    const url = page.url()
    const checklist = await page.locator('[data-testid="sponsor-onboarding-checklist"]').count()
    const nav = await page.locator('[data-testid="portal-nav"]').count()
    if (!url.includes('/onboarding')) {
      fail(`${who}: page load of ${path} stayed on ${url} — expected the checklist`)
    } else if (checklist === 0) {
      fail(`${who}: landed on ${url} but the checklist did not render — blank or crashed`)
    } else if (nav > 0) {
      // AC-7. This is the assertion that catches the checklist being put inside
      // the gated group, which would hand a blocked representative the portal's
      // own links.
      fail(`${who}: the checklist rendered PORTAL NAVIGATION — it is inside the gated group`)
    } else {
      ok(`${who}: page load of ${path} rendered the checklist, with no portal navigation`)
    }
  } finally {
    await ctx.close()
  }
}

// ── the run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('Phase 5 — sponsor screen gate + checklist')
  console.log(`  sponsor app : ${BASE_URL}`)
  console.log(`  database    : ${DB_PATH}`)

  const db = openDb()
  const browser = await chromium.launch()

  const sponsorId = sponsorIdFor(db, SPONSOR_DEMO)
  const snap = snapshotSponsor(db, sponsorId)
  console.log(`  company     : ${snap.name} (${sponsorId})`)
  console.log('  snapshot    :', JSON.stringify(
    Object.fromEntries(SPONSOR_COLUMNS.map(c => [c, snap[c] === null ? null : String(snap[c]).slice(0, 40)])),
  ))

  // Which of the six the policy considers required, read from the policy rather
  // than retyped here — a list retyped in a test is a list that drifts.
  const { SPONSOR_REQUIRED_ITEMS, missingSponsorItems } =
    await import(join(ROOT, 'packages/db/src/onboarding-policy.ts'))

  let staffMade = false

  try {
    // ── 1. The demonstration login enters cleanly (AC-9) ────────────────────
    section('1. Sponsor demonstration login, company complete (AC-9)')
    const sponsorCookie = await signIn(SPONSOR_DEMO)
    const missingNow = missingSponsorItems(
      { ...snap, attachedUserCount: 1 }, SPONSOR_REQUIRED_ITEMS,
    )
    if (missingNow.length === 0) {
      ok(`${snap.name} satisfies all ${SPONSOR_REQUIRED_ITEMS.length} required items before any change`)
    } else {
      fail(`${snap.name} is already missing ${missingNow.map(i => i.key).join('+')} — the demo login would hit the checklist on stage`)
    }
    await assertReachesEveryScreen(sponsorCookie, 'sponsor demo (complete)')
    await assertRendersEveryScreen(browser, sponsorCookie, 'sponsor demo (complete)', 'portal')

    // A complete representative typing /onboarding is sent on, not parked on a
    // form with nothing left to fill in. This is what makes AC-5's "within one
    // navigation" true rather than approximately true.
    {
      const { status, location } = await rawGet(sponsorCookie, '/onboarding')
      const away = status >= 300 && status < 400 && (location ?? '').includes('/dashboard')
      if (away) ok('complete representative visiting /onboarding is sent to /dashboard')
      else fail(`complete representative at /onboarding -> ${status} ${location ?? '(no redirect)'} — expected a redirect to /dashboard`)
    }

    // ── 2. Exempt accounts (AC-8) ───────────────────────────────────────────
    section('2. Event-operating accounts are never gated (AC-8)')
    const organizerCookie = await signIn(ORGANIZER_DEMO)
    const orgRow = db.prepare('SELECT role, sponsorId FROM User WHERE email = ?').get(ORGANIZER_DEMO)
    console.log(`  ${ORGANIZER_DEMO}: role=${orgRow.role} sponsorId=${orgRow.sponsorId ?? '(none)'}`)
    if (!orgRow.sponsorId) {
      ok(`${ORGANIZER_DEMO} has no exhibiting company — the exact account the person-based rule exists for`)
    } else {
      skip(`${ORGANIZER_DEMO} has a company attached, so this run does not exercise the no-company exemption`)
    }
    await assertReachesEveryScreen(organizerCookie, 'organizer')
    await assertRendersEveryScreen(browser, organizerCookie, 'organizer', 'portal')
    {
      const { status, location } = await rawGet(organizerCookie, '/onboarding')
      const away = status >= 300 && status < 400 && (location ?? '').includes('/dashboard')
      if (away) ok('organizer visiting /onboarding is sent away, not shown a form it cannot save')
      else fail(`organizer at /onboarding -> ${status} ${location ?? '(no redirect)'} — expected a redirect to /dashboard`)
    }

    await createThrowawayStaff(db)
    staffMade = true
    const staffCookie = await signIn(THROWAWAY_STAFF.email)
    ok(`created throwaway ${THROWAWAY_STAFF.role} account with no company and no profile fields`)
    await assertReachesEveryScreen(staffCookie, 'staff (throwaway)')
    await assertRendersEveryScreen(browser, staffCookie, 'staff (throwaway)', 'portal')

    // ── 3. Blocked direction (AC-1, AC-3, AC-4, AC-7, AC-11) ────────────────
    section('3. Incomplete company is blocked from every portal screen (AC-1)')
    // Tagline is the item the six failing seeded companies already fail on, so
    // clearing it reproduces a state that exists in the real dataset rather than
    // inventing one.
    clearSponsorColumn(db, sponsorId, 'tagline')
    const afterClear = missingSponsorItems(
      { ...snap, tagline: null, attachedUserCount: 1 }, SPONSOR_REQUIRED_ITEMS,
    )
    ok(`cleared tagline; the policy now reports missing: ${afterClear.map(i => i.key).join(', ')}`)

    await assertBlockedFromEveryScreen(sponsorCookie, 'sponsor demo (incomplete)')
    await assertRendersEveryScreen(browser, sponsorCookie, 'sponsor demo (incomplete)', 'checklist')

    section('4. The checklist names exactly the missing items (AC-3, AC-4)')
    {
      const { ctx, page } = await newSignedInPage(browser, sponsorCookie)
      try {
        await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'domcontentloaded' })

        // Exactly the missing items, by the policy's own labels — no more, no fewer.
        const listed = await page.locator('[data-testid^="sponsor-onboarding-missing-"]').allTextContents()
        const expected = afterClear.map(i => i.label)
        const norm = a => a.map(s => s.trim()).sort()
        if (JSON.stringify(norm(listed)) === JSON.stringify(norm(expected))) {
          ok(`checklist lists exactly the missing items: ${expected.join(' | ')}`)
        } else {
          fail(`checklist listed ${JSON.stringify(norm(listed))} but the policy says ${JSON.stringify(norm(expected))}`)
        }

        // The wording is the reminder email's wording, which is the same string
        // in SPONSOR_REQUIRED_ITEMS. Asserting the literal label rather than a
        // paraphrase is the point of AC-3.
        const taglineLabel = SPONSOR_REQUIRED_ITEMS.find(i => i.key === 'tagline').label
        const body = await page.locator('body').innerText()
        if (body.includes(taglineLabel)) ok(`checklist uses the reminder's wording: "${taglineLabel}"`)
        else fail(`checklist does not contain the reminder's wording "${taglineLabel}"`)

        // AC-4: offered, never sought. A "seeking" control here would be the
        // buyer/seller inversion this checklist exists to get right.
        const offered = await page.locator('[data-testid^="sponsor-onboarding-solution-"]').count()
        if (offered > 0) ok(`checklist offers ${offered} "solutions we offer" choices`)
        else fail('checklist rendered no solutions-offered choices')

        const lower = body.toLowerCase()
        if (lower.includes('seeking') || lower.includes('solutions i am seeking') || lower.includes('looking for')) {
          fail('checklist mentions SEEKING — an exhibitor is at the event to sell')
        } else {
          ok('checklist never mentions seeking')
        }

        // The description item is a content rule, not a presence rule, so the
        // screen has to state the length. THE NUMBER IS 21, NOT 20: the policy is
        // `> 20`. Step 4b asserts the boundary itself; this only checks the screen
        // says something. This assertion originally looked for "20" and had to
        // change when the copy was corrected — a standing reminder that a test
        // asserting a number must be re-derived from the rule, not copied from
        // whatever the screen happened to say.
        if (body.includes('21')) ok('checklist states the character floor for the description')
        else fail('checklist does not tell the representative about the character floor')
      } finally {
        await ctx.close()
      }
    }

    // ── 4b. The screen's copy matches the policy, and its controls are named ─
    section('4b. Copy matches the policy exactly, controls are labelled (review findings)')
    {
      // BOTH FROM ADVERSARIAL REVIEW.
      //
      // The description rule is `trim().length > 20`, so the smallest description
      // that satisfies it is 21 characters. The screen said "at least 20" with a
      // /20 counter, which meant somebody typing exactly 20 saw the requirement
      // apparently met while the item stayed outstanding and the button stayed
      // disabled — on the only screen that releases them, with nothing to explain
      // the gap. Asserted at the boundary rather than in the middle, because the
      // middle is where an off-by-one hides.
      const descItem = SPONSOR_REQUIRED_ITEMS.find(i => i.key === 'description')
      const at20 = descItem.check({ description: 'x'.repeat(20) })
      const at21 = descItem.check({ description: 'x'.repeat(21) })
      if (!at20 && at21) ok('policy boundary confirmed: 20 characters fails, 21 passes')
      else fail(`policy boundary moved: 20 chars -> ${at20 ? 'passes' : 'fails'}, 21 chars -> ${at21 ? 'passes' : 'fails'}`)

      // RESTORE FIRST, THEN CLEAR ONE THING. Section 3 left the tagline cleared,
      // and the first version of this step cleared description on top of that — so
      // two items were missing, filling one could never enable the button, and the
      // step reported a policy disagreement that did not exist. The boundary
      // assertions below are only meaningful when description is the SOLE
      // outstanding item.
      restoreSponsor(db, sponsorId, snap)
      clearSponsorColumn(db, sponsorId, 'description')
      {
        const check = db.prepare(`SELECT ${SPONSOR_COLUMNS.join(', ')} FROM Sponsor WHERE id = ?`).get(sponsorId)
        const outstanding = missingSponsorItems({ ...check, attachedUserCount: 1 }, SPONSOR_REQUIRED_ITEMS)
        if (outstanding.length === 1 && outstanding[0].key === 'description') {
          ok('description is the only outstanding item, so the boundary test is meaningful')
        } else {
          fail(`expected description alone to be outstanding, got ${outstanding.map(i => i.key).join('+') || '(none)'}`)
        }
      }
      const { ctx, page } = await newSignedInPage(browser, sponsorCookie)
      try {
        await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'domcontentloaded' })
        const body = await page.locator('body').innerText()
        const claims21 = body.includes('21')
        const claims20Only = /at least 20\b/i.test(body) || /\/20\b/.test(body)
        if (claims21 && !claims20Only) ok('the screen states the real threshold (21), not 20')
        else fail(`the screen's stated threshold disagrees with the policy — mentions 21: ${claims21}, still says 20: ${claims20Only}`)

        const desc = page.locator('[data-testid="sponsor-onboarding-input-description"]')
        const submit = page.locator('[data-testid="sponsor-onboarding-submit"]')

        await desc.fill('x'.repeat(20))
        await page.waitForTimeout(250)
        if (await submit.isDisabled()) ok('20 characters leaves the submit button disabled, matching the policy')
        else fail('20 characters enabled the submit button while the policy still refuses it')

        await desc.fill('x'.repeat(21))
        await page.waitForTimeout(250)
        if (!(await submit.isDisabled())) ok('21 characters enables the submit button, matching the policy')
        else fail('21 characters left the button disabled while the policy accepts it')

        // Every visible label must point at a real control. A label that names
        // nothing is nothing to somebody using a screen reader, and this screen is
        // a blocked representative's only way out.
        const labelReport = await page.evaluate(() => {
          const out = { orphans: [], groups: 0 }
          for (const l of document.querySelectorAll('form label, form legend')) {
            if (l.tagName === 'LEGEND') { out.groups++; continue }
            const id = l.getAttribute('for')
            if (!id) { out.orphans.push(l.textContent.trim().slice(0, 40)); continue }
            if (!document.getElementById(id)) out.orphans.push(`${l.textContent.trim().slice(0, 40)} -> #${id} missing`)
          }
          return out
        })
        if (labelReport.orphans.length === 0) ok('every label on the checklist points at a control that exists')
        else for (const o of labelReport.orphans) fail(`label names no control: "${o}"`)
        if (labelReport.groups > 0) ok(`the solutions chips sit in a named group (${labelReport.groups} legend)`)
        else fail('the solutions chips have no group name — 18 buttons announce with nothing tying them together')
      } finally {
        await ctx.close()
        restoreSponsor(db, sponsorId, snap)
        clearSponsorColumn(db, sponsorId, 'tagline')
      }
    }

    // ── 5a. The checklist can actually be submitted (AC-5, the real path) ───
    section('5a. The checklist form itself releases the representative (AC-5)')
    {
      // WHY THIS EXISTS AS A SEPARATE STEP. The version of this script that only
      // called PATCH /api/profile with fetch reported a clean pass while the
      // checklist was IMPOSSIBLE TO SUBMIT IN A BROWSER. Every seeded company
      // stores a relative logo path, the logo field was type="url", the browser
      // therefore failed form validation, and HTML form validation fails by never
      // firing the submit event at all — no request, no error, no page change,
      // nothing for a status-code assertion to see. A blocked representative was
      // trapped on the one screen meant to release them.
      //
      // Exercising the address is not exercising the screen. Press the button.
      const { ctx, page } = await newSignedInPage(browser, sponsorCookie)
      try {
        await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'domcontentloaded' })

        // Ask the browser directly whether anything on this form would refuse to
        // submit, and name it if so. This is the assertion that catches the whole
        // class, not just the one instance of it that has already been found.
        const validity = await page.evaluate(() => {
          const form = document.querySelector('form')
          if (!form) return { noForm: true, invalid: [] }
          const invalid = []
          for (const el of form.querySelectorAll('input,textarea,select')) {
            if (!el.checkValidity()) {
              invalid.push({ type: el.type, name: el.name || el.id || '(unnamed)', value: String(el.value).slice(0, 60), msg: el.validationMessage })
            }
          }
          return { noForm: false, formValid: form.checkValidity(), invalid }
        })
        if (validity.noForm) {
          fail('the checklist rendered no form at all')
        } else if (validity.formValid) {
          ok('every field on the checklist passes browser form validation as loaded — nothing can silently refuse to submit')
        } else {
          for (const f of validity.invalid) {
            fail(`checklist field ${f.name} (type=${f.type}, value ${JSON.stringify(f.value)}) fails browser validation: "${f.msg}" — pressing submit will do NOTHING and the representative is trapped`)
          }
        }

        // Fill the one outstanding item and press the button a person would press.
        await page.locator('[data-testid="sponsor-onboarding-input-tagline"]').fill(snap.tagline ?? 'Restored by the Phase 5 smoketest')
        const submit = page.locator('[data-testid="sponsor-onboarding-submit"]')
        const disabled = await submit.isDisabled()
        if (disabled) fail('submit button still disabled after filling the last missing item')
        else ok('submit button became enabled once the last missing item was filled')

        await submit.click()
        await page.waitForURL(u => !u.pathname.includes('/onboarding'), { timeout: 15000 }).catch(() => {})
        const landed = page.url()
        const nav = await page.locator('[data-testid="portal-nav"]').count()
        if (landed.includes('/onboarding')) {
          fail(`pressing submit left the representative on ${landed} — the checklist does not release them`)
        } else if (nav === 0) {
          fail(`pressing submit reached ${landed} but the portal navigation did not render`)
        } else {
          ok(`pressing submit released the representative to ${new URL(landed).pathname} with the portal navigation`)
        }

        const stored = db.prepare('SELECT tagline FROM Sponsor WHERE id = ?').get(sponsorId)
        if (stored.tagline && String(stored.tagline).trim().length > 0) {
          ok('the value typed into the checklist reached the database')
        } else {
          fail(`the checklist submitted but the database tagline is ${JSON.stringify(stored.tagline)} — nothing was saved`)
        }
      } finally {
        await ctx.close()
      }
    }

    // ── 5a-ii. The checklist does not write back fields it did not touch ─────
    section('5a-ii. An open checklist cannot undo somebody else\'s change (review finding)')
    {
      // FROM ADVERSARIAL REVIEW. The obvious checklist posts all six required
      // items on every save. That quietly means an open tab holds the values it
      // loaded with, so if an organizer corrects or deliberately clears one of
      // them from the admin app while the tab sits there, submitting writes the
      // tab's older value back over the organizer's — and the gate, seeing a
      // required set that looks satisfied again, releases the representative on
      // the restored stale value. An old tab silently undoing a deliberate
      // re-block is the part that costs something.
      //
      // The fix sends only fields the representative actually edited. This asserts
      // it: clear a DIFFERENT required item after the page has loaded, submit, and
      // the cleared item must still be cleared.
      clearSponsorColumn(db, sponsorId, 'tagline')
      const { ctx, page } = await newSignedInPage(browser, sponsorCookie)
      try {
        await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'domcontentloaded' })
        const loadedWebsite = await page.locator('[data-testid="sponsor-onboarding-input-website"]').inputValue()
        if (loadedWebsite && loadedWebsite.length > 0) ok(`checklist loaded holding website ${JSON.stringify(loadedWebsite)}`)
        else fail('checklist loaded with an empty website field — this probe needs a non-empty one to be meaningful')

        // Somebody else clears the website while this tab is open.
        clearSponsorColumn(db, sponsorId, 'website')
        ok('website cleared in the database while the checklist tab was open')

        await page.locator('[data-testid="sponsor-onboarding-input-tagline"]').fill('Filled by the Phase 5 smoketest')
        await page.locator('[data-testid="sponsor-onboarding-submit"]').click()
        await page.waitForTimeout(3000)

        const after = db.prepare('SELECT tagline, website FROM Sponsor WHERE id = ?').get(sponsorId)
        if (after.website === null || String(after.website).trim() === '') {
          ok('website is STILL cleared after submitting — the tab did not write its stale value back')
        } else {
          fail(`website came back as ${JSON.stringify(after.website)} — the open tab overwrote a change it never saw`)
        }
        if (after.tagline && String(after.tagline).includes('Phase 5 smoketest')) {
          ok('the field the representative actually edited was saved')
        } else {
          fail(`the edited tagline did not save (${JSON.stringify(after.tagline)})`)
        }

        // And the representative must still be blocked, because website is genuinely
        // missing now. Releasing here would mean the gate trusted the stale form.
        const still = await rawGet(sponsorCookie, '/dashboard')
        const blocked = still.status >= 300 && still.status < 400 && (still.location ?? '').includes('/onboarding')
        if (blocked) ok('still blocked on the genuinely-missing website — the gate did not trust the stale form')
        else fail(`/dashboard -> ${still.status} — released while website is empty`)
      } finally {
        await ctx.close()
        restoreSponsor(db, sponsorId, snap)
      }
    }

    // Put it back to incomplete so the address-level checks below start from the
    // same state the section above did.
    clearSponsorColumn(db, sponsorId, 'tagline')

    // ── 5b. Released within one navigation, at the address level (AC-5) ─────
    section('5b. The save address serves a blocked representative (AC-5)')
    {
      // Save through the address the checklist itself uses, so this exercises the
      // real release path rather than a database write the app never sees.
      const status = await patchProfile(sponsorCookie, { tagline: snap.tagline })
      if (status === 200) ok('PATCH /api/profile served an incomplete representative (the save exemption holds)')
      else fail(`PATCH /api/profile -> ${status} while incomplete — the checklist cannot be completed, every representative is trapped`)

      // ONE navigation. Not "eventually", not after a fresh sign-in.
      const { status: dash, location } = await rawGet(sponsorCookie, '/dashboard')
      if (dash === 200) ok('/dashboard served on the very next request after saving — released in one navigation')
      else fail(`/dashboard -> ${dash} ${location ?? ''} immediately after saving — not released in one navigation`)

      await assertReachesEveryScreen(sponsorCookie, 'sponsor demo (re-completed)')
      await assertRendersEveryScreen(browser, sponsorCookie, 'sponsor demo (re-completed)', 'portal')
    }

    // ── 6. Re-blocking (AC-6) ───────────────────────────────────────────────
    section('6. Clearing a required item blocks again (AC-6)')
    // The gate must consult the required set on every request, not a one-time
    // "onboarded" marker. Each of the six is cleared in turn and restored, so a
    // gate that happened to only notice tagline would be caught here.
    for (const item of SPONSOR_REQUIRED_ITEMS) {
      const columns = item.columns
      if (columns.length === 0) {
        skip(`${item.key}: relation-count item, cannot be cleared by a column write`)
        continue
      }
      for (const c of columns) clearSponsorColumn(db, sponsorId, c)
      const { status, location } = await rawGet(sponsorCookie, '/dashboard')
      const gated = status >= 300 && status < 400 && (location ?? '').includes('/onboarding')
      if (gated) ok(`cleared ${item.key} (${columns.join('+')}) -> /dashboard redirects to the checklist`)
      else fail(`cleared ${item.key} (${columns.join('+')}) -> /dashboard answered ${status} ${location ?? ''} — the gate ignored it`)
      restoreSponsor(db, sponsorId, snap)
      const back = await rawGet(sponsorCookie, '/dashboard')
      if (back.status === 200) ok(`restored ${item.key} -> /dashboard served again`)
      else fail(`restored ${item.key} but /dashboard answered ${back.status} — restore did not take`)
    }

    // ── 7. Fail closed on a missing row (FP F-6, carried forward) ───────────
    section('7. A session pointing at a deleted account fails closed (FP F-6)')
    {
      // The throwaway staff account is exempt by role, so deleting its row is the
      // cleanest way to exercise the missing-row branch without touching a seeded
      // account. The redirect must NOT be a bare /login, or middleware bounces it
      // straight back and the two chase each other forever.
      const removed = deleteThrowawayStaff(db)
      staffMade = false
      if (removed > 0) ok(`deleted the throwaway account's row (${removed}) while its session is still valid`)
      else fail('could not delete the throwaway account row — the missing-row branch was not exercised')

      const { status, location } = await rawGet(staffCookie, '/dashboard')
      const toInvalid = status >= 300 && status < 400 && (location ?? '').includes('session=invalid')
      if (toInvalid) ok(`deleted-row session -> ${location} (carries the marker middleware skips)`)
      else fail(`deleted-row session -> ${status} ${location ?? '(no redirect)'} — expected /login?session=invalid`)

      // AND THE CHAIN MUST TERMINATE. The last session's worst bug reported a
      // pass here by stopping at "307 to /login" and never following it. Follow
      // it, with a cap, and assert it settles on the sign-in form.
      let url = `${BASE_URL}/dashboard`
      let hops = 0
      let landed = null
      const seen = []
      while (hops < 8) {
        const res = await fetch(url, {
          headers: { Cookie: `${COOKIE_NAME}=${staffCookie}` },
          redirect: 'manual',
        })
        seen.push(`${res.status} ${new URL(url).pathname}${new URL(url).search}`)
        if (res.status >= 300 && res.status < 400) {
          const next = res.headers.get('location')
          url = next.startsWith('http') ? next : `${BASE_URL}${next}`
          hops++
          continue
        }
        landed = { status: res.status, url }
        break
      }
      if (landed && landed.status === 200 && landed.url.includes('/login')) {
        ok(`redirect chain terminates at the sign-in form in ${hops} hop(s): ${seen.join(' -> ')}`)
      } else if (!landed) {
        fail(`redirect chain did not settle within 8 hops — LOOP: ${seen.join(' -> ')}`)
      } else {
        fail(`redirect chain settled at ${landed.status} ${landed.url} — expected 200 at /login`)
      }
    }

    // ── 7b. A representative moved between companies is not trapped ─────────
    section('7b. A representative moved between companies can still finish (review finding)')
    {
      // FROM ADVERSARIAL REVIEW, REPRODUCED BEFORE IT WAS ACTED ON. The gate and
      // the checklist read the company from the database; PATCH /api/profile used
      // to read it from the SESSION TOKEN. Because POST /api/profile/teammates
      // sets another user's sponsorId to the caller's company and DELETE sets it
      // to null, a person really can be moved while holding a live session.
      //
      // Measured with the old code: the gate read company B and blocked, the
      // checklist listed B's missing items, and the save WROTE TO COMPANY A. Two
      // failures at once — the representative could never finish no matter how
      // often they saved, and the save overwrote a different company's profile.
      const PROBE_ID = 'phase5-moved-rep'
      const PROBE_EMAIL = 'phase5-moved-rep@wbr.invalid'
      // DISPOSABLE COMPANIES, NOT SEEDED ONES.
      //
      // The first version of this probe picked two arbitrary seeded exhibiting
      // companies and emptied their taglines, restoring them in the finally
      // block. Adversarial review was right to object: a SIGKILL or a crash
      // between the two writes would leave two real companies incomplete, and
      // unlike the demonstration company that damage is not documented anywhere a
      // runner would look. Nothing about this probe needs real companies — it
      // needs two rows and one account. So it creates them, and creating them is
      // also what makes them safe to empty.
      const A = { id: 'phase5-probe-company-a', name: 'Phase 5 Probe Company A' }
      const B = { id: 'phase5-probe-company-b', name: 'Phase 5 Probe Company B' }
      const marker = 'phase5-moved-rep-probe'
      try {
        const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
        const hash = await hashPassword(PASSWORD)
        withRetry('create moved-rep probe', () => {
          db.prepare('DELETE FROM User WHERE id = ? OR email = ?').run(PROBE_ID, PROBE_EMAIL)
          db.prepare('DELETE FROM Sponsor WHERE id IN (?, ?)').run(A.id, B.id)
          // Both start incomplete on tagline, which is the whole point: the save
          // has to be observable and the gate has to block on the current company.
          //
          // The column list is deliberately minimal and matches the real table:
          // `Sponsor` requires id, conferenceId and name, has a default for tier,
          // and — checked, not assumed — has createdAt but NO updatedAt. An
          // earlier version of this insert named updatedAt and failed at runtime.
          // conferenceId is borrowed from the demonstration company rather than
          // invented, because it is a foreign key.
          const { conferenceId } = db.prepare('SELECT conferenceId FROM Sponsor WHERE id = ?').get(sponsorId)
          for (const c of [A, B]) {
            // COMPLETE EXCEPT TAGLINE, not empty. The first version created these
            // rows with nothing in them, so company B was missing six items and
            // saving the tagline alone could never release anybody — the probe
            // reported the representative as trapped when the real cause was the
            // fixture. Satisfying the other five makes the tagline the single
            // variable, which is the only way the release assertion means
            // anything. The description clears the policy's 20-character floor
            // deliberately; a shorter one would silently keep the company
            // incomplete.
            db.prepare(`INSERT INTO Sponsor
                          (id, conferenceId, name, tagline, logoUrl, description,
                           contactName, contactEmail, solutionsOffering, website, createdAt)
                        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, datetime('now'))`)
              .run(
                c.id, conferenceId, c.name,
                '/sponsors/phase5-probe.png',
                'A disposable company created by the Phase 5 smoketest, long enough to clear the twenty-character floor.',
                'Phase 5 Probe Contact',
                'phase5-probe@wbr.invalid',
                JSON.stringify(['AI & Automation']),
                'https://example.invalid',
              )
          }
          db.prepare(`INSERT INTO User (id, email, name, role, password, sponsorId, createdAt, updatedAt)
                      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
            .run(PROBE_ID, PROBE_EMAIL, 'Phase 5 Moved Rep', 'SPONSOR', hash, A.id)
        })
        const movedCookie = await signIn(PROBE_EMAIL)
        ok(`created two disposable companies and a SPONSOR account on ${A.name}; its token names ${A.name}`)

        withRetry('move probe rep', () => db.prepare('UPDATE User SET sponsorId = ? WHERE id = ?').run(B.id, PROBE_ID))
        ok(`moved the account to ${B.name} in the database; the token still names ${A.name}`)

        const before = await rawGet(movedCookie, '/dashboard')
        const gated = before.status >= 300 && before.status < 400 && (before.location ?? '').includes('/onboarding')
        if (gated) ok('the gate reads the database and blocks on the CURRENT company')
        else fail(`/dashboard -> ${before.status} ${before.location ?? ''} — expected the gate to block on the current company`)

        const st = await patchProfile(movedCookie, { tagline: marker })
        if (st === 200) ok(`PATCH /api/profile -> 200`)
        else fail(`PATCH /api/profile -> ${st}`)

        const aNow = db.prepare('SELECT tagline FROM Sponsor WHERE id = ?').get(A.id)
        const bNow = db.prepare('SELECT tagline FROM Sponsor WHERE id = ?').get(B.id)
        if (aNow.tagline === marker) {
          fail(`THE SAVE WROTE TO ${A.name}, the company named only by the stale token — another company's profile was overwritten`)
        } else {
          ok(`${A.name} was left untouched — the save did not follow the stale token`)
        }
        if (bNow.tagline === marker) {
          ok(`${B.name} received the save — the handler resolved the company from the database`)
        } else {
          fail(`${B.name} did not receive the save (tagline ${JSON.stringify(bNow.tagline)}) — the representative cannot complete onboarding`)
        }

        const after = await rawGet(movedCookie, '/dashboard')
        if (after.status === 200) ok('the representative is released after saving — not trapped')
        else fail(`/dashboard -> ${after.status} ${after.location ?? ''} after a successful save — the representative is TRAPPED`)
      } finally {
        // Nothing to restore: every row touched here was created here. Delete the
        // account before the companies, so the foreign key has nothing to hold.
        const usersGone = withRetry('delete moved-rep probe account', () =>
          db.prepare('DELETE FROM User WHERE id = ? OR email = ?').run(PROBE_ID, PROBE_EMAIL).changes)
        const companiesGone = withRetry('delete probe companies', () =>
          db.prepare('DELETE FROM Sponsor WHERE id IN (?, ?)').run(A.id, B.id).changes)
        const leftUsers = db.prepare('SELECT COUNT(*) c FROM User WHERE id = ? OR email = ?')
          .get(PROBE_ID, PROBE_EMAIL).c
        const leftCompanies = db.prepare('SELECT COUNT(*) c FROM Sponsor WHERE id IN (?, ?)')
          .get(A.id, B.id).c
        if (leftUsers === 0 && leftCompanies === 0) {
          ok(`removed the probe account (${usersGone}) and both disposable companies (${companiesGone}); no seeded company was touched`)
        } else {
          fail(`probe left ${leftUsers} account row(s) and ${leftCompanies} company row(s) behind — delete ids ${PROBE_ID}, ${A.id}, ${B.id} by hand`)
        }
      }
    }

    // ── 8. The other apps stay reachable (AC-10) ────────────────────────────
    section('8. Admin app and meetings portal remain reachable (AC-10)')
    for (const [name, base, probe] of [['admin app', WEB_URL, '/dashboard'], ['meetings portal', MEETINGS_URL, '/']]) {
      if (!(await isListening(base))) {
        skip(`${name} at ${base} is not listening — AC-10 NOT verified for it in this run`)
        continue
      }
      for (const [who, email] of [['organizer', ORGANIZER_DEMO]]) {
        try {
          const cookie = await signIn(email, PASSWORD, base)
          const res = await fetch(`${base}${probe}`, {
            headers: { Cookie: `${base.startsWith('https://') ? '__Secure-' : ''}next-auth.session-token=${cookie}` },
            redirect: 'manual',
          })
          const gated = res.status >= 300 && res.status < 400 && (res.headers.get('location') ?? '').includes('/onboarding')
          if (gated) fail(`${who} at ${name}${probe} -> redirected to a checklist; neither app carries a gate`)
          else if (res.status < 400) ok(`${who} reaches ${name}${probe} (${res.status})`)
          else fail(`${who} at ${name}${probe} -> ${res.status}`)
        } catch (err) {
          fail(`${who} could not sign in to ${name}: ${err.message}`)
        }
      }
    }

  } finally {
    // ── restore, always ─────────────────────────────────────────────────────
    section('Cleanup')
    try {
      restoreSponsor(db, sponsorId, snap)
      const after = snapshotSponsor(db, sponsorId)
      const drift = SPONSOR_COLUMNS.filter(c => (after[c] ?? null) !== (snap[c] ?? null))
      if (drift.length === 0) ok(`${snap.name} restored to its snapshot on every required column`)
      else fail(`${snap.name} did NOT restore cleanly — drifted on ${drift.join(', ')}`)

      const stillMissing = missingSponsorItems({ ...after, attachedUserCount: 1 }, SPONSOR_REQUIRED_ITEMS)
      if (stillMissing.length === 0) ok('the demonstration login is usable again — it enters the portal cleanly')
      else fail(`THE DEMONSTRATION LOGIN IS LEFT BLOCKED, missing ${stillMissing.map(i => i.key).join('+')} — fix before any demo`)
    } catch (err) {
      fail(`restore failed: ${err.message}`)
    }
    if (staffMade) {
      const n = deleteThrowawayStaff(db)
      if (n > 0) ok(`removed the throwaway ${THROWAWAY_STAFF.role} account`)
      else fail('throwaway account was not removed — delete it by hand')
    } else {
      const left = db.prepare('SELECT COUNT(*) c FROM User WHERE id = ? OR email = ?')
        .get(THROWAWAY_STAFF.id, THROWAWAY_STAFF.email).c
      if (left === 0) ok('no throwaway account left behind')
      else fail(`${left} throwaway row(s) left behind — delete by hand`)
    }
    await browser.close()
    db.close()
  }

  console.log(`\n${passCount} passed, ${failCount} failed, ${skipCount} skipped`)
  if (skipCount > 0) {
    console.log('A SKIP is not a pass. Anything skipped above is unverified by this run.')
  }
  return failCount === 0 ? 0 : 1
}

main().then(
  code => process.exit(code),
  err => { console.error(`\nSETUP ERROR: ${err.stack ?? err.message}`); process.exit(1) },
)
