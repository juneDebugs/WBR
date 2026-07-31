#!/usr/bin/env node
/**
 * Phase 6 — sponsor request guard.
 *
 * Acceptance criteria from `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`:
 *
 *   AC-1  All nine reading addresses return 403 to a representative whose company
 *         is incomplete, asserted by looping over a list.
 *   AC-2  The ten guarded changing addresses do the same.
 *   AC-3  All nineteen serve a complete representative normally — over-blocking
 *         ruled out in the same run.
 *   AC-4  The profile-save address serves an incomplete representative, so the
 *         checklist can be completed; asserted explicitly in both directions.
 *   AC-5  A representative whose session points at a deleted or absent company
 *         row is refused, not allowed.
 *   AC-6  Every request handler in the sponsor app is enumerated in the smoketest
 *         document and marked guarded or deliberately exempt.
 *   AC-7  The teammate-registration handler's exemption status is decided by
 *         reading its caller, and the decision with its reason is recorded.
 *   AC-8  The buyer-directory refusal is demonstrated against a deployed preview
 *         using two distinct signed-in sessions, and the result recorded either
 *         way — refused, or served from a shared cache.
 *   AC-9  Every refusal carries the same status and body shape as the participant
 *         app's.
 *   AC-10 Smoketest doc committed per docs/smoketests/CONTRACT.md.
 *
 * AC-6 and AC-7 are document deliverables and live in
 * docs/smoketests/phase-6-sponsor-request-guard.md with the commands that
 * reproduce them. Asserting a directory listing here would be a test that breaks
 * on a rename while passing through a real behaviour change, which the plan's own
 * testing rule forbids. AC-8 needs a deployed preview and a protection-bypass
 * token, so it has its own script — phase-6-deployed-cache-check.mjs — and is not
 * silently folded into this run's totals.
 *
 * WHAT A GREEN RUN IS EVIDENCE OF. The assertions listed below and nothing wider.
 * Phase 5's suite passed 68 of 68 while the sponsor checklist could not be
 * submitted in a browser at all, because it completed the required item by calling
 * an address instead of pressing the button. Phase 1 passed 33 of 33 while a
 * delegate blocked from every screen could still post in a chat room. Treat a
 * passing run here as evidence about these assertions and no further.
 *
 * BEFORE TRUSTING A GREEN RUN, RUN THE NEGATIVE CONTROLS:
 *   docs/smoketests/playwright/phase-6-negative-controls.sh
 * That driver removes each guard behaviour in turn, rebuilds, and re-runs this
 * script, so the numbers below are known to be capable of going red.
 *
 * HOW A REFUSAL IS RECOGNISED, and why it is not just the status code. Several
 * handlers in this app already answer 403 for their own reasons — "No sponsor",
 * "No sponsor linked", "Forbidden" — so a status check alone cannot tell this
 * phase's refusal from behaviour that predates it. Every assertion below requires
 * status 403 AND `onboardingRequired: true` in the body, which is the marker the
 * participant app's guard already sets and the only thing a caller can key on.
 *
 * WHY THE CHANGING ADDRESSES ARE SENT DELIBERATELY INVALID BODIES. For the
 * complete-representative direction the question is only "did the guard let them
 * through", so each changing address is sent a body that fails that handler's own
 * validation AFTER the guard has run — an empty object, or a made-up record id.
 * A guard that refused would answer 403 with the onboarding marker; a guard that
 * let them through produces that handler's own 400 or 404. This keeps the run
 * free of side effects: no meetings are approved, no colleague accounts are
 * created, no submission forms are destroyed. The two addresses where a genuine
 * 200 is reachable without side effects use a disposable form this run creates.
 *
 * NOTHING SEEDED IS TOUCHED. Phase 5's review found a probe that emptied columns
 * on two arbitrary seeded companies and restored them only in a finally block, so
 * a crash between writes left two real companies incomplete. This run creates its
 * own company, its own two representatives and its own submission form, and
 * deletes them at the end, verifying the deletion by counting rows.
 *
 * IF IT IS KILLED MID-WAY, the exact cleanup statements are PRINTED ON STARTUP so
 * they can be copied rather than reconstructed. They are also listed in
 * CLEANUP_SQL below, and the cleanup the script runs itself uses the same
 * predicates — one definition, three uses.
 *
 * An earlier version of this comment carried a shorter snippet that deleted
 * SubmissionForm by id prefix and did not mention MeetingRequest at all. An
 * adversarial review round caught it: the happy-path checks create a second
 * submission form and a meeting request THROUGH THE APP, so the app chooses those
 * ids and no `phase6-` prefix exists on them. A runner following those
 * instructions would have left rows behind, or hit a foreign-key error trying to
 * delete the users first. Order matters and is fixed below: child rows, then
 * users, then the company.
 *
 * Prerequisites:
 *   - Sponsor app on SPONSOR_BASE_URL (default http://localhost:3003), tier C —
 *     a production build, not a dev server. Kill anything already on the port
 *     first; a server started before your change serves stale code:
 *       lsof -ti:3003 | xargs kill -9
 *       pnpm --filter sponsor build
 *       cd apps/sponsor && WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true pnpm start
 *   - THAT ENVIRONMENT VARIABLE MATTERS. Two of the nineteen addresses — the
 *     AI-draft allowance and the draft-introduction address — sit behind a feature
 *     switch that answers 404 before the guard runs. With the switch off they
 *     cannot be proven to refuse, and this script reports a loud SKIP for them
 *     rather than a pass.
 *
 *     Raised by an adversarial review round as "two of the claimed nineteen are
 *     observable without the guard". Half right, and the half that matters is the
 *     wording rather than the behaviour. With the switch off those addresses answer
 *     404 TO EVERYBODY — complete representative, incomplete representative and
 *     organizer alike — so nobody receives any data and there is nothing to
 *     expose. The switch is a stricter refusal than the guard, not a way past it.
 *
 *     The review's remedy was to move the identity checks and the guard ahead of
 *     the feature switch. REJECTED, with the reason recorded so it is not
 *     re-proposed: it would answer a signed-in incomplete representative "complete
 *     your company profile" about a feature that does not exist on that
 *     deployment, which is a false explanation. 404 is the true one.
 *
 *     So the precise claim is: NINETEEN addresses call the guard, and two of them
 *     are only reachable at all when the AI feature switch is on. The count of
 *     guarded addresses is nineteen either way; the count this run can produce
 *     EVIDENCE for is seventeen when the switch is off.
 *   - apps/sponsor/.env.local with DATABASE_URL (absolute file: path) and
 *     NEXTAUTH_SECRET.
 *   - For AC-9 only: the participant app on 3001, so the two apps' refusals can be
 *     compared against each other rather than against a copied literal. If it is
 *     not listening the run records a loud SKIP for that criterion.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-6-sponsor-request-guard.mjs
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
const ATTENDEE_URL = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'

const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'password123'

/** The organizer demonstration login: ORGANIZER role, no exhibiting company. */
const ORGANIZER_DEMO = 'wbr@test.com'
/** The deliberately-incomplete delegate, for the cross-app refusal comparison. */
const INCOMPLETE_DELEGATE = 'onboarding-demo@test.com'

const DISPOSABLE = {
  conferenceId: 'conf-2025',
  sponsorId: 'phase6-company',
  sponsorName: 'Phase 6 Disposable Exhibitor',
  formId: 'phase6-form',
  rep: {
    id: 'phase6-rep',
    email: 'phase6-rep@wbr.invalid',
    name: 'Phase 6 Representative',
    role: 'SPONSOR',
  },
  orphan: {
    id: 'phase6-orphan',
    email: 'phase6-orphan@wbr.invalid',
    name: 'Phase 6 Unlinked Representative',
    role: 'SPONSOR',
  },
  /**
   * A disposable delegate, attached to no company, used as the real subject of
   * the happy-path mutation checks: somebody to attach as a teammate and somebody
   * to ask for a meeting. Exists so those checks can assert a genuine success
   * instead of a validation error.
   */
  target: {
    id: 'phase6-target',
    email: 'phase6-target@wbr.invalid',
    name: 'Phase 6 Target Delegate',
    role: 'ATTENDEE',
  },
}

/**
 * EVERY row this run can create, in an order that respects foreign keys: child
 * rows first, then the accounts, then the company. One definition with three
 * consumers — the cleanup the script runs, the statements it prints on startup,
 * and the leftover count that verifies the cleanup worked.
 *
 * Note what is NOT keyed on the `phase6-` prefix. The happy-path checks create a
 * submission form and a meeting request through the app, so the app chooses those
 * ids. Those two are found by company and by participant instead.
 */
const CLEANUP_SQL = [
  ['submissions', `DELETE FROM FormSubmission WHERE formId IN (SELECT id FROM SubmissionForm WHERE sponsorId = 'phase6-company')`],
  ['forms', `DELETE FROM SubmissionForm WHERE sponsorId = 'phase6-company'`],
  ['meetingRequests', `DELETE FROM MeetingRequest WHERE requesterId LIKE 'phase6-%' OR targetUserId LIKE 'phase6-%'`],
  ['users', `DELETE FROM User WHERE id LIKE 'phase6-%'`],
  ['companies', `DELETE FROM Sponsor WHERE id = 'phase6-company'`],
]

/**
 * A complete company: every one of the six required items satisfied. The
 * description is 21 characters, the smallest value the policy accepts — the rule
 * is `length > 20`, and Phase 5 found the screen claiming 20. Starting at the
 * boundary means a policy change in either direction shows up here.
 */
const COMPLETE_COMPANY = {
  logoUrl: '/sponsors/phase6-disposable.png',
  tagline: 'A disposable exhibitor for Phase 6',
  description: 'Twenty-one characters',
  contactName: 'Phase Six Contact',
  contactEmail: 'phase6-contact@wbr.invalid',
  solutionsOffering: JSON.stringify(['ERP / Operations']),
  website: 'https://phase6.wbr.invalid',
}

let passCount = 0
let failCount = 0
let skipCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }
function skip(msg) { skipCount++; console.log(`  – SKIP ${msg}`) }
function section(title) { console.log(`\n${title}`) }

// ── the nineteen guarded addresses ──────────────────────────────────────────
//
// One list, walked in both directions, so neither direction can quietly cover a
// different set from the other. `path` is a function because two entries need the
// id of the disposable submission form this run creates.
//
// `servedNote` records what a NOT-refused answer looks like for that address, so
// a reader can tell an intended 400 or 404 from an accident.

const ADDRESSES = [
  // ---- reading: nine ----
  { kind: 'read', method: 'GET', path: () => '/api/attendees',
    label: 'buyer directory', servedNote: '200 with the full people list' },
  { kind: 'read', method: 'GET', path: () => '/api/browse?search=&limit=1',
    label: 'buyer browse/search', servedNote: '200' },
  { kind: 'read', method: 'GET', path: () => '/api/meetings-data',
    label: 'meetings data', servedNote: '200' },
  { kind: 'read', method: 'GET', path: () => '/api/sponsor-data',
    label: 'own company data', servedNote: '200' },
  { kind: 'read', method: 'GET', path: () => '/api/profile/sponsor-data',
    label: 'company profile + available users', servedNote: '200' },
  { kind: 'read', method: 'GET', path: () => '/api/profile/teammates',
    label: 'team list', servedNote: '200' },
  { kind: 'read', method: 'GET', path: () => '/api/recommendations/quota',
    label: 'remaining AI-draft allowance', servedNote: '200', needsAiFeature: true },
  { kind: 'read', method: 'GET', path: () => '/api/submissions',
    label: 'submission forms', servedNote: '200' },
  { kind: 'read', method: 'GET', path: ctx => `/api/submissions/${ctx.formId}`,
    label: 'one submission form', servedNote: '200 for the disposable form' },

  // ---- changing: ten ----
  { kind: 'change', method: 'PATCH', path: () => '/api/meetings/phase6-no-such-meeting',
    body: { status: 'APPROVED' },
    label: 'approve/reject a meeting', servedNote: '404 — no such meeting request' },
  { kind: 'change', method: 'POST', path: () => '/api/profile/teammates/register',
    body: {},
    label: 'register a colleague account', servedNote: '400 — email and password required' },
  { kind: 'change', method: 'POST', path: () => '/api/profile/teammates',
    body: {},
    label: 'attach a teammate', servedNote: '400 — userId required' },
  { kind: 'change', method: 'DELETE', path: () => '/api/profile/teammates',
    body: {},
    label: 'detach a teammate', servedNote: '400 — userId required' },
  { kind: 'change', method: 'POST', path: () => '/api/recommendations/phase6-no-such-attendee/draft-intro',
    body: {},
    label: 'draft an introduction', servedNote: '502 — no AI credential configured',
    needsAiFeature: true },
  { kind: 'change', method: 'POST', path: () => '/api/request-meeting',
    body: {},
    label: 'ask a buyer for a meeting', servedNote: '400 — targetUserId required' },
  { kind: 'change', method: 'PATCH', path: ctx => `/api/submissions/${ctx.formId}`,
    body: { title: 'Phase 6 disposable form' },
    label: 'edit a submission form', servedNote: '200 for the disposable form' },
  { kind: 'change', method: 'DELETE', path: () => '/api/submissions/phase6-no-such-form',
    label: 'delete a submission form',
    servedNote: '200 — deleteMany matches nothing, so no form is destroyed' },
  { kind: 'change', method: 'PATCH',
    path: () => '/api/submissions/phase6-no-such-form/submissions/phase6-no-such-submission',
    body: { status: 'PENDING' },
    label: 'set a submission status', servedNote: '404 — no such form' },
  { kind: 'change', method: 'POST', path: () => '/api/submissions',
    body: {},
    label: 'create a submission form', servedNote: '400 — Title required' },
]

const READ_COUNT = ADDRESSES.filter(a => a.kind === 'read').length
const CHANGE_COUNT = ADDRESSES.filter(a => a.kind === 'change').length

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

/** Call one address and return status plus parsed body, following no redirects. */
async function call(cookie, entry, ctx, base = BASE_URL) {
  const init = {
    method: entry.method,
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    redirect: 'manual',
  }
  if (entry.body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(entry.body)
  }
  const res = await fetch(`${base}${entry.path(ctx)}`, init)
  let body = null
  try { body = await res.json() } catch { /* not json, leave null */ }
  return { status: res.status, body }
}

/**
 * Is this answer THIS PHASE's refusal?
 *
 * Both halves are required. Several handlers in this app answered 403 before this
 * phase existed, for their own reasons, so the status alone cannot tell the two
 * apart — and a test that could not tell them apart would pass just as happily
 * against a guard that was never called.
 */
function isOnboardingRefusal({ status, body }) {
  return status === 403 && body?.onboardingRequired === true
}

function describe(res) {
  const marker = res.body?.onboardingRequired === true ? ' onboardingRequired' : ''
  const err = typeof res.body?.error === 'string' ? ` "${res.body.error}"` : ''
  return `${res.status}${marker}${err}`
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
  // The app server reads this same file throughout the run, and this database is
  // in rollback-journal mode rather than write-ahead logging (`PRAGMA
  // journal_mode` reports `delete`), so a write fails IMMEDIATELY with "database
  // is locked" when a reader holds the lock instead of waiting its turn. Phase 5's
  // first run died exactly there, and so did the restore in its cleanup block.
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
      while (Date.now() < until) { /* synchronous back-off, see Phase 5 */ }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastErr.message}`)
}

const COMPANY_COLUMNS = Object.keys(COMPLETE_COMPANY)

async function createDisposables(db) {
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)

  withRetry('create disposables', () => {
    // Idempotent: a previous run killed mid-way leaves these behind.
    for (const [, sql] of CLEANUP_SQL) db.prepare(sql).run()

    // NOTE ON THIS TABLE: Sponsor requires conferenceId and has NO updatedAt
    // column. Phase 5 lost a cycle to an INSERT naming updatedAt here. Checked
    // against pragma_table_info rather than remembered.
    db.prepare(`
      INSERT INTO Sponsor (id, conferenceId, name, ${COMPANY_COLUMNS.join(', ')})
      VALUES (?, ?, ?, ${COMPANY_COLUMNS.map(() => '?').join(', ')})
    `).run(
      DISPOSABLE.sponsorId, DISPOSABLE.conferenceId, DISPOSABLE.sponsorName,
      ...COMPANY_COLUMNS.map(c => COMPLETE_COMPANY[c]),
    )

    for (const who of [DISPOSABLE.rep, DISPOSABLE.orphan, DISPOSABLE.target]) {
      db.prepare(`
        INSERT INTO User (id, email, name, role, password, sponsorId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        who.id, who.email, who.name, who.role, hash,
        // The orphan is created with NO company link on purpose. That is the
        // state AC-5 is about and no seeded account is in it.
        who === DISPOSABLE.rep ? DISPOSABLE.sponsorId : null,
      )
    }

    // SubmissionForm requires updatedAt with no default — the opposite of Sponsor.
    db.prepare(`
      INSERT INTO SubmissionForm (id, sponsorId, title, updatedAt)
      VALUES (?, ?, ?, datetime('now'))
    `).run(DISPOSABLE.formId, DISPOSABLE.sponsorId, 'Phase 6 disposable form')
  })
}

function deleteDisposables(db) {
  return withRetry('delete disposables', () => {
    const counts = {}
    for (const [label, sql] of CLEANUP_SQL) counts[label] = db.prepare(sql).run().changes
    return counts
  })
}

/** Count anything this run could have left behind. Zero is the only acceptable answer. */
function countLeftovers(db) {
  // Derived from CLEANUP_SQL rather than written out again, so a statement added
  // there cannot be forgotten here and leave the run reporting a clean database
  // while rows survive.
  return CLEANUP_SQL.reduce((total, [, sql]) => {
    const counted = sql.replace(/^DELETE FROM (\w+)/, 'SELECT COUNT(*) AS n FROM $1')
    return total + db.prepare(counted).get().n
  }, 0)
}

function setCompanyColumn(db, column, value) {
  if (!COMPANY_COLUMNS.includes(column)) throw new Error(`refusing to write unknown column ${column}`)
  withRetry(`set ${column}`, () =>
    db.prepare(`UPDATE Sponsor SET ${column} = ? WHERE id = ?`).run(value, DISPOSABLE.sponsorId),
  )
}

// ── the two directions, over one list ───────────────────────────────────────

async function assertAllRefused(cookie, who, ctx, aiFeatureLive) {
  for (const entry of ADDRESSES) {
    if (entry.needsAiFeature && !aiFeatureLive) {
      skip(`${who}: ${entry.method} ${entry.path(ctx)} (${entry.label}) — AI feature switch is off, ` +
           `so this address answers 404 before the guard. Re-run with ` +
           `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true to cover it.`)
      continue
    }
    const res = await call(cookie, entry, ctx)
    if (isOnboardingRefusal(res)) ok(`${who}: ${entry.method} ${entry.path(ctx)} -> 403 (${entry.label})`)
    else fail(`${who}: ${entry.method} ${entry.path(ctx)} -> ${describe(res)} — expected 403 with ` +
              `onboardingRequired (${entry.label})`)
  }
}

async function assertNoneRefused(cookie, who, ctx, aiFeatureLive) {
  for (const entry of ADDRESSES) {
    if (entry.needsAiFeature && !aiFeatureLive) {
      skip(`${who}: ${entry.method} ${entry.path(ctx)} (${entry.label}) — AI feature switch is off`)
      continue
    }
    const res = await call(cookie, entry, ctx)
    if (!isOnboardingRefusal(res)) ok(`${who}: ${entry.method} ${entry.path(ctx)} -> ${describe(res)} ` +
                                     `— not refused by the gate (expected ${entry.servedNote})`)
    else fail(`${who}: ${entry.method} ${entry.path(ctx)} -> refused by the gate — OVER-BLOCKING ` +
              `(${entry.label})`)
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Phase 6 — sponsor request guard')
  console.log(`Sponsor app: ${BASE_URL}`)
  console.log(`Database:    ${DB_PATH}`)
  console.log(`Addresses:   ${READ_COUNT} reading + ${CHANGE_COUNT} changing = ${ADDRESSES.length}`)
  console.log('\nIf this run is killed part-way, these statements remove everything it creates.')
  console.log('They are the same ones the cleanup block runs, in the same order:')
  for (const [, sql] of CLEANUP_SQL) console.log(`  ${sql};`)

  if (!(await isListening(BASE_URL))) {
    console.error(`\nNothing is listening on ${BASE_URL}. Start a production build first — see the ` +
                  `prerequisites at the top of this file.`)
    process.exit(1)
  }

  const db = openDb()
  const ctx = { formId: DISPOSABLE.formId }
  let browser

  try {
    section('Setup — disposable company, two representatives, one submission form')
    await createDisposables(db)
    ok(`created company ${DISPOSABLE.sponsorId} satisfying all six required items`)
    ok(`created ${DISPOSABLE.rep.email} attached to it, and ${DISPOSABLE.orphan.email} attached to nothing`)

    const repCookie = await signIn(DISPOSABLE.rep.email)
    ok(`signed in as ${DISPOSABLE.rep.email} — POST /api/auth/... is exempt and still works`)

    // Is the AI feature switch on? Decide by asking, not by reading the
    // environment: this script and the server are separate processes and the
    // server's environment is what counts.
    const quotaProbe = await call(repCookie, ADDRESSES.find(a => a.label.includes('AI-draft')), ctx)
    const aiFeatureLive = quotaProbe.status !== 404
    if (aiFeatureLive) ok('AI feature switch is ON — both AI addresses are reachable and will be asserted')
    else console.log('  ! AI feature switch is OFF — 2 of 19 addresses will report SKIP, not pass')

    section(`AC-3a — a COMPLETE company: the guard refuses none of the ${ADDRESSES.length}`)
    // NOTE THE NARROWED CLAIM. This walk proves the guard does not refuse a
    // complete representative. It does NOT prove those addresses work, because
    // the changing ones are sent invalid bodies on purpose to keep the run free of
    // side effects. An adversarial review round pointed out that the earlier
    // wording — "serve a complete representative normally" — claimed more than the
    // evidence carried: a complete representative could be broken with a 400 or a
    // 500 on a core workflow and this walk would still pass. AC-3b below covers
    // the high-value mutations for real.
    await assertNoneRefused(repCookie, 'complete rep', ctx, aiFeatureLive)

    section('AC-4a — the profile-save address serves a COMPLETE representative')
    {
      const res = await fetch(`${BASE_URL}/api/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${repCookie}` },
        body: JSON.stringify({ tagline: COMPLETE_COMPANY.tagline }),
      })
      if (res.status === 200) ok('PATCH /api/profile -> 200 while complete')
      else fail(`PATCH /api/profile -> ${res.status} while complete, expected 200`)
    }

    section('AC-3b — the high-value mutations genuinely SUCCEED for a complete representative')
    {
      // Real subjects, real successes, checked in the database — not a validation
      // error standing in for one. Each of these is undone immediately, and the
      // cleanup block removes anything a crash leaves behind.
      const asRep = (method, path, body) => fetch(`${BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${repCookie}` },
        body: JSON.stringify(body),
      })
      const sponsorIdOf = id =>
        db.prepare('SELECT sponsorId FROM User WHERE id = ?').get(id)?.sponsorId ?? null

      // 1. Attach a teammate, and detach again.
      {
        const res = await asRep('POST', '/api/profile/teammates', { userId: DISPOSABLE.target.id })
        if (res.status === 200 && sponsorIdOf(DISPOSABLE.target.id) === DISPOSABLE.sponsorId) {
          ok('POST /api/profile/teammates attached a real delegate to the company')
        } else {
          fail(`POST /api/profile/teammates -> ${res.status}, target company is ` +
               `${JSON.stringify(sponsorIdOf(DISPOSABLE.target.id))}`)
        }
        const del = await asRep('DELETE', '/api/profile/teammates', { userId: DISPOSABLE.target.id })
        if (del.status === 200 && sponsorIdOf(DISPOSABLE.target.id) === null) {
          ok('DELETE /api/profile/teammates detached them again')
        } else {
          fail(`DELETE /api/profile/teammates -> ${del.status}, target company is ` +
               `${JSON.stringify(sponsorIdOf(DISPOSABLE.target.id))}`)
        }
      }

      // 2. Ask a real buyer for a meeting. This is one of the two capabilities the
      //    customer named when asked what an incomplete participant should not be
      //    able to do, so it is worth knowing it still works for someone complete.
      {
        const res = await asRep('POST', '/api/request-meeting', {
          targetUserId: DISPOSABLE.target.id,
          message: 'Created by the Phase 6 run',
          priority: 'MED',
        })
        const row = db.prepare('SELECT id FROM MeetingRequest WHERE requesterId = ? AND targetUserId = ?')
          .get(DISPOSABLE.rep.id, DISPOSABLE.target.id)
        if (res.status < 400 && row) ok(`POST /api/request-meeting -> ${res.status} and a request row exists`)
        else fail(`POST /api/request-meeting -> ${res.status}, row found: ${Boolean(row)}`)
      }

      // 3. Create a submission form for real. The app chooses the id, which is why
      //    cleanup deletes forms by company rather than by the one id this script
      //    knows about.
      {
        const before = db.prepare('SELECT COUNT(*) AS n FROM SubmissionForm WHERE sponsorId = ?')
          .get(DISPOSABLE.sponsorId).n
        const res = await asRep('POST', '/api/submissions', { title: 'Phase 6 created form', type: 'FORM' })
        const after = db.prepare('SELECT COUNT(*) AS n FROM SubmissionForm WHERE sponsorId = ?')
          .get(DISPOSABLE.sponsorId).n
        if (res.status < 400 && after === before + 1) {
          ok(`POST /api/submissions -> ${res.status} and the form count went ${before} -> ${after}`)
        } else {
          fail(`POST /api/submissions -> ${res.status}, form count ${before} -> ${after}`)
        }
      }
    }

    section(`AC-1 + AC-2 — company INCOMPLETE (tagline cleared): all ${ADDRESSES.length} refused`)
    setCompanyColumn(db, 'tagline', null)
    ok('tagline cleared on the disposable company — one of the six required items now missing')
    await assertAllRefused(repCookie, 'incomplete rep', ctx, aiFeatureLive)

    section('AC-4b — the profile-save address STILL serves the incomplete representative')
    {
      // This is the assertion that stops a future change trapping every
      // incomplete representative permanently. It checks the write landed, not
      // just that the status was 200 — a 200 that wrote nothing would leave the
      // representative equally stuck.
      const written = 'Restored by the Phase 6 run'
      const res = await fetch(`${BASE_URL}/api/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${repCookie}` },
        body: JSON.stringify({ tagline: written }),
      })
      if (res.status === 200) ok('PATCH /api/profile -> 200 while INCOMPLETE — the way out is open')
      else fail(`PATCH /api/profile -> ${res.status} while incomplete, expected 200 — every ` +
                `incomplete representative is now permanently trapped`)

      const row = db.prepare('SELECT tagline FROM Sponsor WHERE id = ?').get(DISPOSABLE.sponsorId)
      if (row.tagline === written) ok('the save actually landed in the database, not just answered 200')
      else fail(`the save answered but the database holds ${JSON.stringify(row.tagline)}`)
    }

    section('AC-3 again — completing the item releases every address within one request')
    {
      // Deliberately re-walked rather than assumed from the earlier pass: the
      // company has been emptied and refilled since, and "the guard consults the
      // required set rather than a one-time marker" is only shown by measuring
      // after a round trip through incomplete and back.
      await assertNoneRefused(repCookie, 'released rep', ctx, aiFeatureLive)
    }

    section('AC-5 — a representative with NO company row is refused, not allowed')
    {
      const orphanCookie = await signIn(DISPOSABLE.orphan.email)
      ok(`signed in as ${DISPOSABLE.orphan.email}, which is attached to no company`)
      await assertAllRefused(orphanCookie, 'no-company rep', ctx, aiFeatureLive)
    }

    section('The person-based exemption — an ORGANIZER is refused by none of them')
    {
      // Not one of Phase 6's numbered criteria, asserted anyway because it is the
      // most severe way this phase could fail. wbr@test.com holds the organizer
      // role, has NO exhibiting company, and is admitted to this portal by
      // APP_ALLOWED_ROLES. If the guard asked about completeness before asking
      // who the person is, the primary demonstration login would be refused at
      // every address in this app — in front of the customer.
      //
      // Several of these answer 403 for a DIFFERENT reason (this account has no
      // company, and handlers say "No sponsor"). That is behaviour that predates
      // this phase and is unchanged by it. What is asserted is narrower and exact:
      // the onboarding refusal did not fire.
      const organizerCookie = await signIn(ORGANIZER_DEMO)
      ok(`signed in as ${ORGANIZER_DEMO} (organizer, no exhibiting company)`)
      await assertNoneRefused(organizerCookie, 'organizer', ctx, aiFeatureLive)
    }

    section('AC-9 — the refusal is the same shape as the participant app\'s')
    if (!(await isListening(ATTENDEE_URL))) {
      skip(`the participant app is not listening on ${ATTENDEE_URL}, so the two apps' refusal ` +
           `bodies cannot be compared. Start it and re-run to cover AC-9.`)
    } else {
      setCompanyColumn(db, 'tagline', null)
      const sponsorRefusal = await call(repCookie, ADDRESSES[0], ctx)

      const delegateCookie = await signIn(INCOMPLETE_DELEGATE, PASSWORD, ATTENDEE_URL)
      const delegateRes = await fetch(`${ATTENDEE_URL}/api/data/people`, {
        headers: { Cookie: `next-auth.session-token=${delegateCookie}` },
        redirect: 'manual',
      })
      let delegateBody = null
      try { delegateBody = await delegateRes.json() } catch { /* leave null */ }
      const delegateRefusal = { status: delegateRes.status, body: delegateBody }

      // Compared against the other app's live answer rather than against a
      // literal copied into this file. A copied literal would keep passing after
      // the participant app changed its refusal, which is the drift being guarded
      // against.
      if (!isOnboardingRefusal(delegateRefusal)) {
        fail(`the participant app answered ${describe(delegateRefusal)} for an incomplete delegate — ` +
             `expected its own onboarding refusal, so there is nothing to compare against. Is ` +
             `${INCOMPLETE_DELEGATE} still deliberately incomplete?`)
      } else {
        if (sponsorRefusal.status === delegateRefusal.status) {
          ok(`both apps refuse with ${sponsorRefusal.status}`)
        } else {
          fail(`sponsor refuses with ${sponsorRefusal.status}, participant app with ${delegateRefusal.status}`)
        }
        const sponsorKeys = Object.keys(sponsorRefusal.body ?? {}).sort().join(',')
        const delegateKeys = Object.keys(delegateRefusal.body ?? {}).sort().join(',')
        if (sponsorKeys === delegateKeys) ok(`both bodies carry the same keys: {${sponsorKeys}}`)
        else fail(`sponsor body keys {${sponsorKeys}} differ from the participant app's {${delegateKeys}}`)

        if (sponsorRefusal.body?.onboardingRequired === true &&
            delegateRefusal.body?.onboardingRequired === true) {
          ok('both set onboardingRequired: true — the marker a caller keys on is identical')
        } else {
          fail('the onboardingRequired marker is not set identically in both apps')
        }
        // Recorded, not asserted equal: the human sentence differs by design,
        // because a representative completes their COMPANY'S profile and a
        // delegate completes their own. The shape a caller depends on is what
        // must match, and it is asserted above.
        console.log(`    (messages, deliberately different: sponsor "${sponsorRefusal.body?.error}" ` +
                    `vs delegate "${delegateRefusal.body?.error}")`)
      }
    }

    section('The checklist still works with the guard live — pressing the real button')
    {
      // Phase 5 reported 68 of 68 passing while this screen could not be submitted
      // in a browser at all, because the run completed the required item by calling
      // an address with fetch instead of pressing the button. The lesson is in the
      // plan: exercising the address is not exercising the screen.
      //
      // The specific risk this phase introduces: if the checklist or anything it
      // renders reads one of the nineteen guarded addresses, the guard traps every
      // incomplete representative on the only screen that can release them.
      // Reading the code says it does not — the page queries the database on the
      // server and its only network call is the exempt PATCH /api/profile — but
      // reading the code is what missed the last three defects.
      setCompanyColumn(db, 'tagline', null)
      browser = await chromium.launch()
      const pageCtx = await browser.newContext()
      await pageCtx.addCookies([{
        name: COOKIE_NAME, value: repCookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax',
      }])
      const page = await pageCtx.newPage()

      const failedRequests = []
      page.on('response', res => {
        if (res.status() === 403 && res.url().includes('/api/')) failedRequests.push(res.url())
      })

      await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle' })
      const heading = await page.locator('h1').first().textContent().catch(() => null)
      if (heading) ok(`the checklist renders a heading: "${heading.trim().slice(0, 60)}"`)
      else fail('the checklist rendered no heading — the screen is blank behind a normal 200')

      const navPresent = await page.locator('[data-testid="portal-nav"]').count()
      if (navPresent === 0) ok('no portal navigation on the checklist — it cannot be used to click around the gate')
      else fail('portal navigation rendered on the checklist')

      if (failedRequests.length === 0) {
        ok('the checklist screen made no request that the guard refused')
      } else {
        fail(`the checklist screen made ${failedRequests.length} request(s) the guard refused: ` +
             `${failedRequests.join(', ')} — an incomplete representative may be trapped`)
      }

      // Ask the browser itself whether any field would refuse to submit, rather
      // than assuming. This is the assertion Phase 5 added after an <input
      // type="url"> silently refused every relative logo path by never firing the
      // submit event: no request, no error, nothing a status check could see.
      const invalid = await page.evaluate(() => {
        const form = document.querySelector('form')
        if (!form) return { noForm: true }
        if (form.checkValidity()) return { valid: true }
        return {
          valid: false,
          offenders: Array.from(form.elements)
            .filter(el => typeof el.checkValidity === 'function' && !el.checkValidity())
            .map(el => ({ name: el.name || el.id || el.tagName, value: String(el.value).slice(0, 60),
                          message: el.validationMessage })),
        }
      })
      if (invalid.noForm) fail('no form on the checklist screen')
      else if (invalid.valid) ok('every field on the checklist would submit — form.checkValidity() is true')
      else fail(`the checklist cannot be submitted: ${JSON.stringify(invalid.offenders)}`)

      // NOW PRESS IT. Everything above this line is still only a claim about the
      // screen; the whole reason Phase 5's suite reported 68 of 68 over a screen
      // that did not work is that it stopped short of exactly this step.
      const typed = 'Pressed by the Phase 6 run'
      await page.locator('[data-testid="sponsor-onboarding-input-tagline"]').fill(typed)
      const submit = page.locator('[data-testid="sponsor-onboarding-submit"]')
      if (await submit.isDisabled()) {
        fail('the submit button is still disabled after filling the only missing item')
      } else {
        ok('the submit button became enabled once the only missing item was filled')
        await submit.click()

        // WAIT FOR THE OUTCOME, NOT FOR A NETWORK STATE. The first version of this
        // assertion used waitForLoadState('networkidle') here and reported the
        // product broken three times over — button pressed, nothing saved, still on
        // the checklist. Measured in a separate run: the product was fine. That
        // helper returns IMMEDIATELY when the network happens to be idle at the
        // moment it is called, which it was, because the click's request had not
        // started yet. So the page address and the database were both read before
        // the save was sent.
        //
        // A test that reports a working feature broken is as expensive as one that
        // reports a broken feature working: both send somebody looking in the wrong
        // place. Wait for the thing being asserted — leaving the checklist — and
        // let the timeout be the failure.
        const leftChecklist = await page
          .waitForURL(u => !new URL(u).pathname.startsWith('/onboarding'), { timeout: 15000 })
          .then(() => true)
          .catch(() => false)

        const landed = page.url()
        const navAfter = leftChecklist
          ? await page.locator('[data-testid="portal-nav"]').count()
          : 0
        if (!leftChecklist) {
          fail(`pressing submit left the representative on ${landed} after 15s — with the request ` +
               `guard live, the checklist no longer releases them`)
        } else if (navAfter === 0) {
          fail(`pressing submit reached ${landed} but the portal navigation did not render`)
        } else {
          ok(`pressing submit released the representative to ${new URL(landed).pathname} with the ` +
             `portal navigation rendered`)
        }

        const stored = db.prepare('SELECT tagline FROM Sponsor WHERE id = ?').get(DISPOSABLE.sponsorId)
        if (stored.tagline === typed) ok('the typed value reached the database')
        else fail(`the checklist submitted but the database holds ${JSON.stringify(stored.tagline)}`)

        // The point of the whole phase, stated as one assertion: the address that
        // refused this representative a moment ago now serves them, and the thing
        // that changed was pressing a button on a screen.
        const after = await call(repCookie, ADDRESSES[0], ctx)
        if (!isOnboardingRefusal(after)) {
          ok(`the buyer directory now answers ${after.status} to the same session that was refused`)
        } else {
          fail('the buyer directory still refuses after the checklist released the representative')
        }
      }
    }
  } catch (err) {
    fail(`run aborted: ${err.message}`)
    console.error(err)
  } finally {
    section('Cleanup — nothing seeded was touched; the disposables go away')
    try {
      const counts = deleteDisposables(db)
      console.log(`  deleted: ${JSON.stringify(counts)}`)
      const left = countLeftovers(db)
      if (left === 0) ok('no phase6- rows remain — verified by counting, not assumed')
      else fail(`${left} phase6- row(s) remain in the database`)
    } catch (err) {
      fail(`CLEANUP FAILED: ${err.message} — remove phase6- rows by hand, see the header of this file`)
    }
    if (browser) await browser.close().catch(() => {})
    db.close()
  }

  section('Result')
  console.log(`  ${passCount} passed, ${failCount} failed, ${skipCount} skipped`)
  console.log(`\n  AC-6, AC-7 and AC-10 are document deliverables — see ` +
              `docs/smoketests/phase-6-sponsor-request-guard.md`)
  console.log(`  AC-8 needs a deployed preview — see phase-6-deployed-cache-check.mjs`)
  if (skipCount > 0) {
    console.log(`\n  ${skipCount} SKIPPED assertion(s) above are not passes. Read them.`)
  }
  process.exit(failCount === 0 ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
