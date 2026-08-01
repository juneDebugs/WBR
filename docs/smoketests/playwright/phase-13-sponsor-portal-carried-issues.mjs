#!/usr/bin/env node
/**
 * Phase 13 — sponsor portal carried issues.
 *
 * Three fixes, each measured as a defect during Phase 6 and carried rather than
 * fixed there. Acceptance criteria from
 * `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md` § Phase 13:
 *
 *   AC-1   After the real Sign out button is pressed, the browser's stored query
 *          cache under `sponsor-query-cache` is gone.
 *   AC-2   The store is still written while signed in — the fix erases the data
 *          without disabling the feature.
 *   AC-3   Signing in again after a sign-out renders the portal normally.
 *   AC-4   POST /api/profile/teammates answers 409 for a target that already
 *          belongs to another company, and that target is unchanged afterwards.
 *   AC-5   The same address still attaches a target with no company (200).
 *   AC-6   The same address answers 404 for an identifier matching nothing.
 *   AC-7   A colleague created through the registration address can SIGN IN to
 *          the sponsor portal.
 *   AC-8   Attaching an account that already exists leaves its role unchanged,
 *          asserted for a delegate who still reaches the meetings portal.
 *   AC-9   The screen that attaches an existing person states that it does not
 *          grant portal access.
 *   AC-10  A newly created colleague of an INCOMPLETE company is gated and
 *          guarded like any other representative.
 *   AC-11  Everything this run creates is removed, verified by counting rows.
 *
 * Added after adversarial review round 1, each confirmed by measurement before
 * the code was changed:
 *
 *   AC-12  The teammate addresses read the caller's company from the DATABASE,
 *          so a representative moved between companies mid-session can neither
 *          create a colleague at, nor read the team of, the company they left.
 *   AC-13  Two simultaneous attaches of the same unattached person produce
 *          exactly one success and one refusal.
 *   AC-14  A session that ends WITHOUT the Sign out button — expiry, an
 *          invalidated session, a deleted cookie — still leaves no stored data.
 *
 * WHAT A GREEN RUN IS EVIDENCE OF. The assertions listed below and nothing
 * wider. This repository has been burned by the opposite reading three times:
 * Phase 1 passed 33 of 33 while a delegate blocked from every screen could still
 * post in a chat room; Phase 5 passed 68 of 68 while the sponsor checklist could
 * not be submitted in a browser at all; Phase 6's first Step 10 reported three
 * failures against a feature that worked. Before citing a total from this file,
 * run the negative controls — phase-13-negative-controls.sh — which break each
 * behaviour in turn and show these assertions going red.
 *
 * NOTHING SEEDED IS TOUCHED. This run creates three companies, four accounts and
 * whatever the app creates on its behalf, and deletes all of it at the end,
 * verifying by counting rows. If it is killed part-way the exact cleanup
 * statements are PRINTED ON STARTUP — one definition, three consumers, so a
 * statement cannot be added in one place and forgotten in another.
 *
 * A NOTE ON THE ONE ASSERTION THAT LOOKS LIKE A RACE AND IS NOT. Step 3 proves
 * that a refusal from the attach address is shown to the exhibitor rather than
 * silently discarded. It gets a genuine 409 without any request interception, by
 * reproducing the real situation that produces one: company B's representative
 * loads the team screen while the delegate is still unattached, company A's
 * representative attaches that delegate, and B then clicks the row their page is
 * still showing. That is exactly how a real 409 happens — the picker's list is
 * a 120-second cached snapshot, not an authorization check.
 *
 * Prerequisites:
 *   - Sponsor app on SPONSOR_BASE_URL (default http://localhost:3003), tier C —
 *     a production build, not a dev server. Kill the port first; a server started
 *     before your change serves stale code (check with `ps -o lstart=`):
 *       lsof -ti:3003 | xargs kill -9
 *       pnpm --filter sponsor build
 *       cd apps/sponsor && pnpm start
 *   - Meetings portal on MEETINGS_BASE_URL (default http://localhost:3002) for
 *     AC-8 only. Without it that criterion reports a loud SKIP rather than a pass,
 *     because the point of AC-8 is that a real person keeps real access.
 *       pnpm --filter meetings build && (cd apps/meetings && pnpm start)
 *   - apps/sponsor/.env.local with DATABASE_URL (absolute file: path) and
 *     NEXTAUTH_SECRET.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-13-sponsor-portal-carried-issues.mjs
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
const MEETINGS_URL = process.env.MEETINGS_BASE_URL ?? 'http://localhost:3002'
const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'password123'

const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

/** The key lib/query-client.tsx writes the whole query cache under. */
const CACHE_KEY = 'sponsor-query-cache'

const CONFERENCE_ID = 'conf-2025'

const D = {
  companyA: { id: 'phase13-company-a', name: 'Phase 13 Exhibitor A' },
  companyB: { id: 'phase13-company-b', name: 'Phase 13 Exhibitor B' },
  // Deliberately incomplete: its tagline is emptied after creation, so a
  // colleague created for it must be gated. AC-10.
  companyC: { id: 'phase13-company-c', name: 'Phase 13 Exhibitor C' },
  repA: { id: 'phase13-rep-a', email: 'phase13-rep-a@wbr.invalid', name: 'Phase 13 Rep A', role: 'SPONSOR', company: 'phase13-company-a' },
  repB: { id: 'phase13-rep-b', email: 'phase13-rep-b@wbr.invalid', name: 'Phase 13 Rep B', role: 'SPONSOR', company: 'phase13-company-b' },
  repC: { id: 'phase13-rep-c', email: 'phase13-rep-c@wbr.invalid', name: 'Phase 13 Rep C', role: 'SPONSOR', company: 'phase13-company-c' },
  // A real delegate with no company: the subject of the attach checks and of
  // AC-8, which is about not taking away access a real person already has.
  //
  // THE NAME STARTS WITH 'AAAA' ON PURPOSE, and it is not decoration. Step 3
  // needs this person to be visible in the team screen's picker, and that picker
  // is fed by a query that takes the FIRST 200 unattached accounts ordered by
  // name — see getCachedAvailableUsers in app/api/profile/sponsor-data/route.ts.
  // There are over 2,400 unattached accounts in the seeded data, so a fixture
  // named "Phase 13 …" is never in the 200 the screen can show, and Step 3
  // reported a skip that looked like a defect. Sorting first is the cheapest way
  // to make the fixture reachable through the real screen.
  delegate: { id: 'phase13-delegate', email: 'phase13-delegate@wbr.invalid', name: 'AAAA Phase 13 Delegate', role: 'ATTENDEE', company: null },
}

/** Accounts the APP creates during the run. The app chooses their ids, so
 *  cleanup finds them by email rather than by id prefix. */
const NEW_COLLEAGUE = 'phase13-colleague-new@wbr.invalid'
const GATED_COLLEAGUE = 'phase13-colleague-gated@wbr.invalid'

/**
 * EVERY row this run can create, in an order that respects foreign keys.
 * One definition, three consumers: the cleanup, the statements printed on
 * startup for crash recovery, and the leftover count that verifies the cleanup.
 *
 * The `email LIKE` clause is not redundant with the `id LIKE` clause: two of
 * these accounts are created THROUGH THE APP, so their ids are chosen by the app
 * and carry no phase13 prefix.
 */
const CLEANUP_SQL = [
  ['meetingRequests', `DELETE FROM MeetingRequest WHERE requesterId LIKE 'phase13-%' OR targetUserId LIKE 'phase13-%'`],
  ['submissions', `DELETE FROM FormSubmission WHERE formId IN (SELECT id FROM SubmissionForm WHERE sponsorId LIKE 'phase13-%')`],
  ['forms', `DELETE FROM SubmissionForm WHERE sponsorId LIKE 'phase13-%'`],
  ['users', `DELETE FROM User WHERE id LIKE 'phase13-%' OR email LIKE 'phase13-%'`],
  ['companies', `DELETE FROM Sponsor WHERE id LIKE 'phase13-%'`],
]

/**
 * A company satisfying all six required items, so its representatives are not
 * gated and the run measures the thing it is about. The description is 21
 * characters, the smallest the policy accepts — the rule is `length > 20` and
 * Phase 5 found a screen claiming 20.
 */
const COMPLETE_COMPANY = {
  logoUrl: '/sponsors/phase13.png',
  tagline: 'A disposable exhibitor for Phase 13',
  description: 'Twenty-one characters',
  contactName: 'Phase Thirteen Contact',
  contactEmail: 'phase13-contact@wbr.invalid',
  solutionsOffering: JSON.stringify(['ERP / Operations']),
  website: 'https://phase13.wbr.invalid',
}
const COMPANY_COLUMNS = Object.keys(COMPLETE_COMPANY)

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
  if (!raw) throw new Error(`sign-in for ${email} at ${base} set no session cookie (HTTP ${res.status})`)
  return raw.split(';')[0].split('=').slice(1).join('=')
}

/** Sign in and report whether it worked, without throwing. AC-7 is exactly this
 *  question, so it needs an answer rather than a crash. */
async function trySignIn(email, base = BASE_URL) {
  try {
    return { ok: true, cookie: await signIn(email, PASSWORD, base) }
  } catch (err) {
    return { ok: false, reason: String(err.message) }
  }
}

async function api(cookie, method, path, body, base = BASE_URL) {
  const init = { method, headers: { Cookie: `${COOKIE_NAME}=${cookie}` }, redirect: 'manual' }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${base}${path}`, init)
  let parsed = null
  try { parsed = await res.json() } catch { /* not json */ }
  return { status: res.status, body: parsed }
}

function describe(res) {
  const err = typeof res.body?.error === 'string' ? ` "${res.body.error}"` : ''
  return `${res.status}${err}`
}

async function isListening(base) {
  try {
    await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(2500) })
    return true
  } catch {
    return false
  }
}

// ── database access ─────────────────────────────────────────────────────────

function openDb() {
  const db = new DatabaseSync(DB_PATH)
  // `PRAGMA journal_mode` here reports `delete`, not write-ahead logging, so a
  // write fails IMMEDIATELY with "database is locked" while the app server holds
  // a read lock rather than waiting its turn. Phase 5's first run died on this
  // and so did its cleanup block.
  db.exec('PRAGMA busy_timeout = 10000')
  return db
}

function withRetry(label, fn, attempts = 5) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      return fn()
    } catch (err) {
      lastErr = err
      if (!String(err.message).includes('locked')) throw err
      const until = Date.now() + i * 250
      while (Date.now() < until) { /* synchronous back-off, as Phase 5 */ }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastErr.message}`)
}

async function createDisposables(db) {
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)

  withRetry('create disposables', () => {
    // Idempotent: a previous run killed mid-way leaves rows behind.
    for (const [, sql] of CLEANUP_SQL) db.prepare(sql).run()

    // Sponsor requires conferenceId and has NO updatedAt column — checked against
    // pragma_table_info rather than remembered. Phase 5 lost a cycle to this.
    for (const c of [D.companyA, D.companyB, D.companyC]) {
      db.prepare(`
        INSERT INTO Sponsor (id, conferenceId, name, ${COMPANY_COLUMNS.join(', ')})
        VALUES (?, ?, ?, ${COMPANY_COLUMNS.map(() => '?').join(', ')})
      `).run(c.id, CONFERENCE_ID, c.name, ...COMPANY_COLUMNS.map(k => COMPLETE_COMPANY[k]))
    }

    // Company C is made incomplete on purpose: AC-10 is about a colleague created
    // for a company that does not satisfy the required set.
    db.prepare(`UPDATE Sponsor SET tagline = '' WHERE id = ?`).run(D.companyC.id)

    for (const who of [D.repA, D.repB, D.repC, D.delegate]) {
      db.prepare(`
        INSERT INTO User (id, email, name, role, password, sponsorId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(who.id, who.email, who.name, who.role, hash, who.company)
    }
  })
}

function deleteDisposables(db) {
  return withRetry('delete disposables', () => {
    const counts = {}
    for (const [label, sql] of CLEANUP_SQL) counts[label] = db.prepare(sql).run().changes
    return counts
  })
}

/** Count anything this run could have left behind. Derived from CLEANUP_SQL so a
 *  statement added there cannot be forgotten here. Zero is the only pass. */
function countLeftovers(db) {
  return CLEANUP_SQL.reduce((total, [, sql]) => {
    const counted = sql.replace(/^DELETE FROM (\w+)/, 'SELECT COUNT(*) AS n FROM $1')
    return total + db.prepare(counted).get().n
  }, 0)
}

function readUser(db, where, value) {
  return db.prepare(`SELECT id, email, role, sponsorId FROM User WHERE ${where} = ?`).get(value)
}

// ── the browser's own storage ───────────────────────────────────────────────

/**
 * Read what the portal has persisted, without creating anything.
 *
 * `indexedDB.open` CREATES a database when it is absent, which would turn "the
 * cache is gone" into "the cache is an empty database I just made". The
 * existence check comes first for that reason.
 */
async function readPersistedCache(page, key) {
  return page.evaluate(async cacheKey => {
    const names = (await indexedDB.databases()).map(d => d.name)
    if (!names.includes('keyval-store')) return { present: false, length: 0, text: '' }

    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('keyval-store')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (!db.objectStoreNames.contains('keyval')) {
      db.close()
      return { present: false, length: 0, text: '' }
    }
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction('keyval', 'readonly')
      const req = tx.objectStore('keyval').get(cacheKey)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    if (value === undefined || value === null) return { present: false, length: 0, text: '' }
    const text = JSON.stringify(value)
    return { present: true, length: text.length, text }
  }, key)
}

/**
 * Wait until the cache has been written, or give up.
 *
 * The provider writes on a throttle after a cache change rather than
 * immediately, so reading straight after a page load is reading too early —
 * the same class of mistake as Phase 6's `networkidle` race, which reported a
 * working feature broken. Waiting for the outcome and letting the timeout be the
 * failure is the rule that mistake produced.
 */
async function waitForPersistedCache(page, key, { present, timeoutMs = 15000 }) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await readPersistedCache(page, key)
    if (last.present === present) return last
    await page.waitForTimeout(500)
  }
  return last ?? { present: !present, length: 0, text: '' }
}

async function browserSignIn(context, cookie, base = BASE_URL) {
  const url = new URL(base)
  await context.addCookies([{
    name: COOKIE_NAME,
    value: cookie,
    domain: url.hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }])
}

// ── the run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('Phase 13 — sponsor portal carried issues')
  console.log(`  sponsor:  ${BASE_URL}`)
  console.log(`  meetings: ${MEETINGS_URL}`)
  console.log(`  database: ${DB_PATH}`)
  console.log('\nIf this run is killed part-way, these statements clean up after it:')
  for (const [, sql] of CLEANUP_SQL) console.log(`  ${sql};`)

  if (!(await isListening(BASE_URL))) {
    console.error(`\nThe sponsor app is not answering on ${BASE_URL}. Start it and re-run.`)
    process.exit(1)
  }
  const meetingsLive = await isListening(MEETINGS_URL)

  const db = openDb()
  await createDisposables(db)

  const browser = await chromium.launch()
  let exitCode = 0

  try {
    const cookieA = await signIn(D.repA.email)
    const cookieB = await signIn(D.repB.email)
    const cookieC = await signIn(D.repC.email)

    // ── Step 1 — the persisted cache is written, then erased by signing out ──
    section('Step 1 — signing out erases this company\'s data from the browser (AC-1, AC-2, AC-3)')
    {
      const context = await browser.newContext()
      await browserSignIn(context, cookieA)
      const page = await context.newPage()

      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-testid="portal-nav"]', { timeout: 20000 })

      const written = await waitForPersistedCache(page, CACHE_KEY, { present: true })
      if (written.present && written.length > 0) {
        ok(`AC-2: the portal persisted ${written.length.toLocaleString()} characters while signed in ` +
           `— the fix erases the data without disabling the feature`)
      } else {
        fail('AC-2: nothing was persisted while signed in, so this run cannot show that sign-out ' +
             'erases it. Either the feature is disabled or the wait was too short.')
      }

      const namesThisCompany = written.text.includes(D.companyA.name)
      if (namesThisCompany) ok(`AC-1 precondition: the stored copy contains "${D.companyA.name}"`)
      else fail(`AC-1 precondition: the stored copy does not mention "${D.companyA.name}", so a later ` +
                'absence would prove nothing about this company\'s data')

      // Press the REAL button. Phase 5 passed 68 of 68 while a screen could not be
      // submitted, because its test called the address instead of pressing the
      // control. Exercising a function is not exercising the screen.
      await page.click('[data-testid="sign-out"]')
      await page.waitForURL(/\/login/, { timeout: 20000 })

      const after = await waitForPersistedCache(page, CACHE_KEY, { present: false })
      if (!after.present) {
        ok('AC-1: after pressing the real Sign out button, the stored query cache is gone')
      } else {
        fail(`AC-1: ${after.length.toLocaleString()} characters remain under "${CACHE_KEY}" after ` +
             `sign-out${after.text.includes(D.companyA.name) ? `, still naming "${D.companyA.name}"` : ''}`)
      }

      await context.close()
    }

    // ── Step 1b — signing in again still works ──────────────────────────────
    {
      const context = await browser.newContext()
      await browserSignIn(context, await signIn(D.repA.email))
      const page = await context.newPage()
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
      try {
        await page.waitForSelector('[data-testid="portal-nav"]', { timeout: 20000 })
        ok('AC-3: signing in again after a sign-out renders the portal normally')
      } catch {
        fail('AC-3: the portal did not render after signing in again — erasing the store broke the restore path')
      }
      await context.close()
    }

    // ── Step 2 — the attach address refuses a target owned by another company ─
    section('Step 2 — attaching a teammate (AC-4, AC-5, AC-6)')
    {
      const attachToA = await api(cookieA, 'POST', '/api/profile/teammates', { userId: D.delegate.id })
      const afterAttach = readUser(db, 'id', D.delegate.id)
      if (attachToA.status === 200 && afterAttach.sponsorId === D.companyA.id) {
        ok('AC-5: a target with no company is attached — 200, and the database agrees')
      } else {
        fail(`AC-5: expected 200 and company A in the database, got ${describe(attachToA)} ` +
             `and sponsorId=${afterAttach?.sponsorId}`)
      }

      const steal = await api(cookieB, 'POST', '/api/profile/teammates', { userId: D.delegate.id })
      const afterSteal = readUser(db, 'id', D.delegate.id)
      if (steal.status === 409) ok('AC-4: another company\'s representative is refused — 409')
      else fail(`AC-4: expected 409, got ${describe(steal)} — this is the defect Phase 6 measured at 200`)

      if (afterSteal.sponsorId === D.companyA.id) {
        ok('AC-4: the target still belongs to company A — the refusal changed nothing')
      } else {
        fail(`AC-4: the target moved to ${afterSteal?.sponsorId} despite the refusal`)
      }

      const missing = await api(cookieB, 'POST', '/api/profile/teammates', { userId: 'phase13-no-such-user' })
      if (missing.status === 404) ok('AC-6: an identifier matching nothing answers 404, not 500')
      else fail(`AC-6: expected 404, got ${describe(missing)}`)

      const again = await api(cookieA, 'POST', '/api/profile/teammates', { userId: D.delegate.id })
      if (again.status === 200) ok('AC-5: re-attaching somebody already on the team is not an error — 200')
      else fail(`AC-5: expected 200 for a repeat attach, got ${describe(again)}`)

      const detach = await api(cookieA, 'DELETE', '/api/profile/teammates', { userId: D.delegate.id })
      const afterDetach = readUser(db, 'id', D.delegate.id)
      if (detach.status === 200 && afterDetach.sponsorId === null) {
        ok('detach returns the delegate to no company, so the next step starts clean')
      } else {
        fail(`detach failed: ${describe(detach)}, sponsorId=${afterDetach?.sponsorId}`)
      }
    }

    // ── Step 3 — the refusal is shown to the exhibitor, not discarded ────────
    section('Step 3 — a refused attach is shown on the screen (AC-4 screen half)')
    {
      const context = await browser.newContext()
      await browserSignIn(context, cookieB)
      const page = await context.newPage()
      await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-testid="teammate-access-note"]', { timeout: 20000 })

      // B's page now holds a list that includes the delegate. A attaches them
      // behind B's back — the real situation that produces a 409, no request
      // interception involved.
      // Search by email: it is unique, whereas a name substring could match a
      // seeded person and click the wrong row.
      await page.fill('input[placeholder="Search by name or email…"]', D.delegate.email)
      const row = page.locator(`text=${D.delegate.email}`).first()
      const rowVisible = await row.isVisible().catch(() => false)

      if (!rowVisible) {
        skip('AC-4 screen half: the delegate did not appear in company B\'s picker, so the refusal ' +
             'path could not be reached through the screen. The cached available-users list is ' +
             '120 seconds old; re-run if this persists.')
      } else {
        const stolen = await api(cookieA, 'POST', '/api/profile/teammates', { userId: D.delegate.id })
        if (stolen.status !== 200) fail(`setup for AC-4 screen half: company A could not attach first (${describe(stolen)})`)

        await row.click()
        try {
          await page.waitForSelector('[data-testid="teammate-error"]', { timeout: 15000 })
          const text = (await page.locator('[data-testid="teammate-error"]').textContent()) ?? ''
          if (text.trim().length > 0) {
            ok(`AC-4 screen half: the exhibitor is told why — "${text.trim()}"`)
          } else {
            fail('AC-4 screen half: the error element rendered empty')
          }
        } catch {
          fail('AC-4 screen half: the attach was refused and the screen said nothing — the silent ' +
               'failure this phase set out to remove')
        }

        await api(cookieA, 'DELETE', '/api/profile/teammates', { userId: D.delegate.id })
      }
      await context.close()
    }

    // ── Step 4 — an existing account keeps its role, and its other access ────
    section('Step 4 — attaching an existing person does not change who they are (AC-8, AC-9)')
    {
      const linked = await api(cookieA, 'POST', '/api/profile/teammates/register', {
        name: D.delegate.name, email: D.delegate.email, jobTitle: 'Delegate', password: PASSWORD,
      })
      const afterLink = readUser(db, 'id', D.delegate.id)

      if (linked.status < 400 && afterLink.sponsorId === D.companyA.id) {
        ok('registering an email that already has an account links it to the company')
      } else {
        fail(`expected the existing account to be linked, got ${describe(linked)} and ` +
             `sponsorId=${afterLink?.sponsorId}`)
      }

      if (afterLink.role === 'ATTENDEE') {
        ok('AC-8: the delegate\'s role is unchanged after being attached')
      } else {
        fail(`AC-8: the delegate's role became ${afterLink?.role} — attaching an existing person ` +
             'must not change who they are')
      }

      if (!meetingsLive) {
        skip('AC-8: the meetings portal is not listening, so the half that matters — that a real ' +
             `person keeps real access — was not measured. Start it on ${MEETINGS_URL} and re-run.`)
      } else {
        const intoMeetings = await trySignIn(D.delegate.email, MEETINGS_URL)
        if (intoMeetings.ok) {
          ok('AC-8: the attached delegate still signs in to the meetings portal')
          const context = await browser.newContext()
          await browserSignIn(context, intoMeetings.cookie, MEETINGS_URL)
          const page = await context.newPage()
          await page.goto(`${MEETINGS_URL}/`, { waitUntil: 'domcontentloaded' })
          const landedOnLogin = /\/login/.test(page.url())
          if (!landedOnLogin) ok(`AC-8: and reaches a meetings screen (${page.url()})`)
          else fail('AC-8: the delegate signed in but was bounced to the meetings sign-in page')
          await context.close()
        } else {
          fail(`AC-8: the attached delegate can no longer sign in to the meetings portal — ` +
               `${intoMeetings.reason}`)
        }
      }

      // AC-9 — the screen states what attaching does and does not do.
      const context = await browser.newContext()
      await browserSignIn(context, cookieA)
      const page = await context.newPage()
      await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded' })
      try {
        await page.waitForSelector('[data-testid="teammate-access-note"]', { timeout: 20000 })
        const note = ((await page.locator('[data-testid="teammate-access-note"]').textContent()) ?? '').toLowerCase()
        if (note.includes('does not give them access')) {
          ok('AC-9: the team screen states that attaching does not grant portal access')
        } else {
          fail(`AC-9: the note rendered but does not say attaching withholds portal access — "${note.trim()}"`)
        }
      } catch {
        fail('AC-9: the team screen carries no note about what attaching does')
      }
      await context.close()

      await api(cookieA, 'DELETE', '/api/profile/teammates', { userId: D.delegate.id })
    }

    // ── Step 5 — a created colleague can actually sign in ────────────────────
    section('Step 5 — a colleague the portal creates can sign in to the portal (AC-7)')
    {
      const created = await api(cookieA, 'POST', '/api/profile/teammates/register', {
        name: 'Phase 13 New Colleague', email: NEW_COLLEAGUE, jobTitle: 'Colleague', password: PASSWORD,
      })
      if (created.status === 201) ok('the colleague account was created — 201')
      else fail(`expected 201 creating a colleague, got ${describe(created)}`)

      const row = readUser(db, 'email', NEW_COLLEAGUE)
      if (row?.role === 'SPONSOR') ok('the created account holds the exhibitor-representative role')
      else fail(`the created account holds role ${row?.role} — the portal admits SPONSOR and the ` +
                'event-operating roles only, so this account could not sign in')

      const entry = await trySignIn(NEW_COLLEAGUE)
      if (entry.ok) {
        ok('AC-7: the colleague signs in to the sponsor portal — the defect Phase 6 measured at 403')
        const context = await browser.newContext()
        await browserSignIn(context, entry.cookie)
        const page = await context.newPage()
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
        try {
          await page.waitForSelector('[data-testid="portal-nav"]', { timeout: 20000 })
          ok('AC-7: and reaches the portal, with its navigation rendered')
        } catch {
          fail(`AC-7: the colleague signed in but the portal did not render (at ${page.url()})`)
        }
        await context.close()
      } else {
        fail(`AC-7: the colleague still cannot sign in — ${entry.reason}`)
      }
    }

    // ── Step 6 — a created colleague is not a way around Phases 5 and 6 ──────
    section('Step 6 — a colleague of an incomplete company is gated like anybody else (AC-10)')
    {
      // 6a — AN INCOMPLETE REPRESENTATIVE CANNOT CREATE A COLLEAGUE AT ALL.
      //
      // The first version of this step assumed they could, and asserted a 201.
      // The address refused with 403, and the test was wrong rather than the
      // product: `POST /api/profile/teammates/register` is one of the nineteen
      // addresses Phase 6 guards, so an incomplete representative never reaches
      // it. That is worth asserting rather than quietly dropping — it means the
      // route this phase was worried about cannot even be started from an
      // incomplete company.
      const refusedCreate = await api(cookieC, 'POST', '/api/profile/teammates/register', {
        name: 'Phase 13 Refused Colleague', email: GATED_COLLEAGUE, jobTitle: 'Colleague', password: PASSWORD,
      })
      if (refusedCreate.status === 403 && refusedCreate.body?.onboardingRequired === true) {
        ok('AC-10: a representative whose own company is incomplete cannot create a colleague — 403 ' +
           'with the standard refusal body')
      } else {
        fail(`AC-10: expected 403 with onboardingRequired, got ${describe(refusedCreate)} — an ` +
             'incomplete representative was able to reach the colleague-creation address')
      }

      const shouldBeAbsent = readUser(db, 'email', GATED_COLLEAGUE)
      if (!shouldBeAbsent) ok('AC-10: and the refused attempt created no account')
      else fail(`AC-10: the refused attempt still created an account (${shouldBeAbsent.id})`)

      // AC-9's other half: the create-a-colleague screen says what it grants.
      // Runs BEFORE 6b, because 6b makes company A incomplete and would send this
      // representative to the checklist instead of the screen being inspected.
      const context = await browser.newContext()
      await browserSignIn(context, cookieA)
      const page = await context.newPage()
      await page.goto(`${BASE_URL}/submissions`, { waitUntil: 'domcontentloaded' })
      const addButton = page.locator('button', { hasText: 'Add Teammate' }).first()
      try {
        await addButton.waitFor({ timeout: 20000 })
        await addButton.click()
        await page.waitForSelector('[data-testid="register-teammate-access-note"]', { timeout: 15000 })
        const note = ((await page.locator('[data-testid="register-teammate-access-note"]').textContent()) ?? '').toLowerCase()
        if (note.includes('buyer directory')) {
          ok('AC-9: the create-a-colleague form states that the new account gets the buyer directory')
        } else {
          fail(`AC-9: the form's note does not mention what it grants — "${note.trim()}"`)
        }
      } catch {
        fail('AC-9: the create-a-colleague form carries no note about what the new account can reach')
      }
      await context.close()

      // 6b — THE COLLEAGUE CREATED IN STEP 5 IS GATED ONCE THEIR COMPANY FALLS
      // INCOMPLETE. This is the question AC-10 is really asking: the new account
      // holds the exhibitor-representative role now, so is it subject to the same
      // gate and guard as anybody else holding that role, or has this phase
      // minted a way past Phases 5 and 6? The colleague is a real one created
      // through the app in Step 5, and the company is made incomplete the same
      // way Phase 6 did it — by emptying the tagline.
      withRetry('empty company A tagline', () =>
        db.prepare(`UPDATE Sponsor SET tagline = '' WHERE id = ?`).run(D.companyA.id))

      const gated = await trySignIn(NEW_COLLEAGUE)
      if (!gated.ok) {
        fail(`AC-10: the colleague could not sign in to be measured — ${gated.reason}`)
      } else {
        const ctx = await browser.newContext()
        await browserSignIn(ctx, gated.cookie)
        const gatedPage = await ctx.newPage()
        await gatedPage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
        try { await gatedPage.waitForURL(/\/onboarding/, { timeout: 15000 }) } catch { /* reported below */ }

        if (/\/onboarding/.test(gatedPage.url())) {
          ok('AC-10: once their company is incomplete the colleague is sent to the checklist, ' +
             'exactly like any other representative')
        } else {
          fail(`AC-10: the colleague reached ${gatedPage.url()} instead of the checklist — the ` +
               'screen gate does not apply to accounts this form creates')
        }

        const navPresent = await gatedPage.locator('[data-testid="portal-nav"]').count()
        if (navPresent === 0) ok('AC-10: and is not handed the portal navigation')
        else fail('AC-10: the portal navigation rendered for a gated colleague')

        const refused = await api(gated.cookie, 'GET', '/api/attendees')
        if (refused.status === 403 && refused.body?.onboardingRequired === true) {
          ok('AC-10: and the buyer directory refuses them with the standard body')
        } else {
          fail(`AC-10: the buyer directory answered ${describe(refused)} to a gated colleague — ` +
               'expected 403 with onboardingRequired')
        }
        await ctx.close()
      }

      // Restore, so a later assertion is not measuring a company this step broke.
      // Everything here is disposable and deleted at the end anyway; restoring is
      // for anyone reading the run's output, and for any step added after this one.
      withRetry('restore company A tagline', () =>
        db.prepare(`UPDATE Sponsor SET tagline = ? WHERE id = ?`).run(COMPLETE_COMPANY.tagline, D.companyA.id))
    }

    // ── Step 7 — the three things adversarial review round 1 found ───────────
    section('Step 7 — the company comes from the database, and the write is atomic (AC-12, AC-13, AC-14)')
    {
      // 7a — AC-12. A representative moved between companies mid-session must not
      // be able to create a colleague at the company they LEFT. Before the round-1
      // fix this produced a working SPONSOR account with the buyer directory at
      // the old company; it was reproduced end to end before anything was changed.
      withRetry('move rep A to company B', () =>
        db.prepare(`UPDATE User SET sponsorId = ? WHERE id = ?`).run(D.companyB.id, D.repA.id))

      const staleColleague = 'phase13-colleague-stale@wbr.invalid'
      const madeWithStaleToken = await api(cookieA, 'POST', '/api/profile/teammates/register', {
        name: 'Phase 13 Stale Colleague', email: staleColleague, jobTitle: 'X', password: PASSWORD,
      })
      const staleRow = readUser(db, 'email', staleColleague)

      if (madeWithStaleToken.status === 201 && staleRow?.sponsorId === D.companyB.id) {
        ok('AC-12: a colleague created on a stale session lands at the company the database says ' +
           'the caller belongs to NOW, not the one their token names')
      } else if (staleRow?.sponsorId === D.companyA.id) {
        fail('AC-12: the colleague was created at the company the caller has LEFT — the session ' +
             'token is still deciding where accounts are created')
      } else {
        fail(`AC-12: expected 201 and company B, got ${describe(madeWithStaleToken)} and ` +
             `sponsorId=${staleRow?.sponsorId}`)
      }

      // The team list and the attach address read the same way, and for the same
      // reason: a moved representative must not see or change their former
      // company's team.
      const teamOnStaleToken = await api(cookieA, 'GET', '/api/profile/teammates')
      const namesOldCompanyRep = Array.isArray(teamOnStaleToken.body) &&
        teamOnStaleToken.body.some(t => t.email === D.repB.email)
      if (teamOnStaleToken.status === 200 && namesOldCompanyRep) {
        ok('AC-12: the team list shows the CURRENT company\'s team on a stale session')
      } else {
        fail(`AC-12: the team list answered ${describe(teamOnStaleToken)} and did not show ` +
             'company B\'s team to a representative the database places at company B')
      }

      withRetry('restore rep A to company A', () =>
        db.prepare(`UPDATE User SET sponsorId = ? WHERE id = ?`).run(D.companyA.id, D.repA.id))

      // 7b — AC-13. Two companies attaching the same unattached person at the same
      // moment. Before the round-1 fix both were accepted in 15 of 15 attempts,
      // because the handler read, decided, and then wrote.
      withRetry('detach the delegate', () =>
        db.prepare(`UPDATE User SET sponsorId = NULL WHERE id = ?`).run(D.delegate.id))

      const freshA = await signIn(D.repA.email)
      const freshB = await signIn(D.repB.email)
      const [raceA, raceB] = await Promise.all([
        api(freshA, 'POST', '/api/profile/teammates', { userId: D.delegate.id }),
        api(freshB, 'POST', '/api/profile/teammates', { userId: D.delegate.id }),
      ])
      const winners = [raceA, raceB].filter(r => r.status === 200).length
      const refused = [raceA, raceB].filter(r => r.status === 409).length
      const landedAt = readUser(db, 'id', D.delegate.id)?.sponsorId

      if (winners === 1 && refused === 1) {
        ok(`AC-13: two simultaneous attaches produced exactly one success and one 409 ` +
           `(A=${raceA.status}, B=${raceB.status}); the delegate is at ${landedAt}`)
      } else {
        fail(`AC-13: expected one 200 and one 409, got A=${raceA.status} B=${raceB.status} — ` +
             'the refusal can be overtaken by a simultaneous request')
      }

      withRetry('detach the delegate again', () =>
        db.prepare(`UPDATE User SET sponsorId = NULL WHERE id = ?`).run(D.delegate.id))

      // 7c — AC-14. A session that ends WITHOUT the Sign out button being pressed.
      // The button was the only path the first version of this phase covered;
      // expiry, an invalidated session and a deleted cookie all leave the stored
      // data behind unless the sign-in screen erases it too.
      const context = await browser.newContext()
      await browserSignIn(context, await signIn(D.repA.email))
      const page = await context.newPage()
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-testid="portal-nav"]', { timeout: 20000 })
      const stored = await waitForPersistedCache(page, CACHE_KEY, { present: true })

      if (!stored.present) {
        fail('AC-14: nothing was stored, so this check cannot show it being erased')
      } else {
        // End the session the way expiry does — the cookie stops being usable —
        // WITHOUT pressing the button.
        await context.clearCookies()
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
        await page.waitForURL(/\/login/, { timeout: 20000 })
        const after = await waitForPersistedCache(page, CACHE_KEY, { present: false })
        if (!after.present) {
          ok('AC-14: a session that ends without the button still leaves no stored data behind — ' +
             'the sign-in screen erases it')
        } else {
          fail(`AC-14: ${after.length.toLocaleString()} characters survived a session ending ` +
               'without the Sign out button')
        }
      }
      await context.close()
    }
  } catch (err) {
    fail(`run aborted: ${err.stack ?? err.message}`)
    exitCode = 1
  } finally {
    await browser.close()

    section('Cleanup (AC-11)')
    const counts = deleteDisposables(db)
    console.log(`  removed: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`)
    const leftovers = countLeftovers(db)
    if (leftovers === 0) ok('AC-11: nothing this run created is left in the database')
    else fail(`AC-11: ${leftovers} rows remain — clean up with the statements printed at the top`)
    db.close()
  }

  section('Result')
  console.log(`  ${passCount} passed, ${failCount} failed, ${skipCount} skipped`)

  /**
   * A SKIPPED CHECK IS NOT A PASS, AND THIS RUN WILL NOT PRETEND IT IS.
   *
   * Added after adversarial review round 1. The earlier version exited 0 whenever
   * nothing had failed, so a run with the meetings portal switched off reported
   * success while AC-8 — the criterion saying this phase does not take away
   * access a real person already has — went unmeasured. The document said that
   * portal was not optional and the script disagreed with the document. When a
   * written claim and an executable check disagree, the check is what people act
   * on, so the check is what changed.
   *
   * `PHASE13_ALLOW_PARTIAL=1` exists for someone deliberately running a subset
   * while working on something else. It prints what it let through, so a partial
   * run can never be quoted as the acceptance run by accident.
   */
  const allowPartial = process.env.PHASE13_ALLOW_PARTIAL === '1'
  if (skipCount > 0 && !allowPartial) {
    console.log(`\n  ${skipCount} check(s) were SKIPPED, so this is NOT a complete run.`)
    console.log('  Start every prerequisite listed at the top of this file and run it again.')
    console.log('  To accept a partial run on purpose: PHASE13_ALLOW_PARTIAL=1')
  } else if (skipCount > 0) {
    console.log(`\n  PARTIAL RUN ACCEPTED BY PHASE13_ALLOW_PARTIAL — ${skipCount} check(s) unmeasured.`)
    console.log('  This run is not evidence for the phase and must not be quoted as such.')
  }

  console.log('\n  Green here is evidence about the assertions above and nothing wider.')
  console.log('  Run phase-13-negative-controls.sh before citing this total.')

  const incomplete = skipCount > 0 && !allowPartial
  process.exit(failCount > 0 || incomplete || exitCode !== 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
