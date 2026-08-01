#!/usr/bin/env node
/**
 * Phase 7 — the no-company explanation.
 *
 * Acceptance criteria from `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`
 * § Phase 7. Requirements, and the finding that reduced this phase to verification,
 * in `.claude/docs/prds/wbr_onboarding_enforcement_prd_2026_07_30.md`
 * § Phase 7 — the no-company explanation.
 *
 *   AC-1  A representative account with no exhibiting company sees the
 *         explanation, not the checklist, and the explanation names the
 *         organizer as the next step.
 *   AC-2  The same account is refused at the sponsor data addresses — all
 *         nineteen of them, enumerated below rather than sampled.
 *   AC-3  The same account is not shown a form whose save would fail. Asserted
 *         in both halves: the checklist does not render, AND the save address it
 *         would have posted to does refuse this account.
 *   AC-4  An organizer or staff account with no exhibiting company is still
 *         released by role and never sees this explanation.
 *   AC-5  A representative whose company link is then attached, with the six
 *         items satisfied, reaches the portal normally.
 *   AC-6  The throwaway accounts and every row this run creates are removed,
 *         verified by counting rows rather than assumed.
 *   AC-7  Smoketest document committed per `docs/smoketests/CONTRACT.md`.
 *         DOCUMENT DELIVERABLE — not asserted here.
 *
 * WHY THIS PHASE IS VERIFICATION RATHER THAN CONSTRUCTION. Five of the seven
 * criteria were already satisfied by code shipped in Phases 5 and 6 before this
 * file existed — the explanation screen at
 * apps/sponsor/app/(authenticated)/onboarding/page.tsx, the data-side refusal at
 * apps/sponsor/lib/require-complete-profile.ts, and three role releases sitting
 * above the company question. Nothing verified any of it, because NO SEEDED
 * ACCOUNT IS IN THIS STATE. That is what this file is for. The full criterion-to-
 * file-and-line table is in the requirements document and is not repeated here.
 *
 * WHAT A GREEN RUN IS EVIDENCE OF. The assertions listed below and nothing
 * wider. This repository has been burned by the opposite reading five times:
 * Phase 1 passed 33 of 33 while a delegate blocked from every screen could still
 * post in a chat room; Phase 5 passed 68 of 68 while the sponsor checklist could
 * not be submitted in a browser at all; Phase 6's first Step 10 reported three
 * failures against a feature that worked; Phase 13 printed a "5 of 5 caught"
 * control table describing code that no longer existed; and Phase 6.5's own
 * control driver reported six catches against an app that was never running.
 * Before citing a total from this file, run phase-7-negative-controls.sh, which
 * breaks each shipped behaviour in turn and shows these assertions going red.
 *
 * EVERY REFUSAL IS PAIRED WITH A CONTROL. An assertion that a call was refused
 * proves nothing on its own — a malformed request is refused too, and so is a
 * request to an app that is not running. Each refusal here sits beside the
 * equivalent call from a legitimate account getting past the guard.
 *
 * WHAT THE CONTROL ASSERTS, PRECISELY. For the nineteen addresses the control is
 * "the guard let this caller through", not "the handler succeeded". A 404 from a
 * handler that was handed a deliberately absent identifier is a PASS: it proves
 * execution reached the handler. Demanding 200 everywhere would mean inventing a
 * meeting, a form and a response for addresses this phase is not about, and
 * would make the control fail for reasons that have nothing to do with the gate.
 * One full end-to-end 200 is asserted separately at Step 2 so a green control
 * column cannot mean the app is broken in some uniform way.
 *
 * NOTHING SEEDED IS TOUCHED. This run creates one company and three accounts,
 * plus whatever the app writes on their behalf, and removes all of it. If it is
 * killed part-way the exact cleanup statements are PRINTED ON STARTUP.
 *
 * Prerequisites:
 *   - Sponsor app on SPONSOR_BASE_URL (default http://localhost:3003), tier C —
 *     a production build, not a dev server. Kill the port first; a server
 *     started before your change serves stale code (check with `ps -o lstart=`):
 *       lsof -ti:3003 | xargs kill -9
 *       pnpm --filter sponsor build
 *       cd apps/sponsor && WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true pnpm start
 *   - THAT ENVIRONMENT VARIABLE MUST BE SET IN THIS SCRIPT'S ENVIRONMENT TOO,
 *     not only the server's. The script reads it to decide whether the AI draft
 *     address is live; set it on the server only and you get a silent skip.
 *     Phase 6.5 lost time to exactly this.
 *   - apps/sponsor/.env.local with DATABASE_URL (absolute file: path) and
 *     NEXTAUTH_SECRET.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-7-no-company-explanation.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure, setup error, or a skip that was
 * not deliberate.
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE_URL = process.env.SPONSOR_BASE_URL ?? 'http://localhost:3003'
const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'password123'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'
const CONFERENCE_ID = 'conf-2025'

/**
 * A company satisfying all six required items, so nothing in this run is refused
 * for an unrelated completeness reason. Same shape Phases 13 and 6.5 used —
 * copied rather than re-derived, so a change to the required set breaks one
 * definition in three places at once instead of silently passing in two of them.
 */
const COMPLETE_COMPANY = {
  logoUrl: '/sponsors/phase7.png',
  tagline: 'A disposable exhibitor for Phase 7',
  description: 'Twenty-one characters',
  contactName: 'Phase Seven Contact',
  contactEmail: 'phase7-contact@wbr.invalid',
  solutionsOffering: JSON.stringify(['ERP / Operations']),
  website: 'https://phase7.wbr.invalid',
}
const COMPANY_COLUMNS = Object.keys(COMPLETE_COMPANY)

const D = {
  company: { id: 'phase7-company', name: 'Phase 7 Exhibitor' },

  /**
   * THE SUBJECT OF THIS PHASE. An exhibitor representative whose company link is
   * genuinely absent. `sponsorId` is null and the role is SPONSOR, so neither the
   * role exemption nor a completeness check applies — this account falls into the
   * one branch Phase 7 is about.
   */
  noCompanyRep: { id: 'phase7-nocompany-rep', email: 'phase7-nocompany-rep@wbr.invalid', name: 'Phase 7 Unlinked Rep', role: 'SPONSOR', company: null },

  /**
   * THE CONTROL. Same role, same everything, except this one has a complete
   * company. Every refusal asserted against the account above is asserted in the
   * opposite direction against this one. Without it, a 403 could mean the app is
   * broken rather than that the rule works.
   */
  attachedRep: { id: 'phase7-attached-rep', email: 'phase7-attached-rep@wbr.invalid', name: 'Phase 7 Linked Rep', role: 'SPONSOR', company: 'phase7-company' },

  /**
   * AC-4. Also has no company, and must NOT be treated like the subject: the
   * role exemption sits above the company question in all three enforcement
   * points, so this account is released rather than explained to. STAFF is used
   * rather than ORGANIZER because the seeded organizer account already has no
   * company, and a fixture is cleaned up while a seeded account must not be.
   */
  noCompanyStaff: { id: 'phase7-nocompany-staff', email: 'phase7-nocompany-staff@wbr.invalid', name: 'Phase 7 Unlinked Staff', role: 'STAFF', company: null },
}

/**
 * ALL NINETEEN GUARDED ADDRESSES, enumerated rather than sampled.
 *
 * The count is not a remembered number: it is `git grep -c "requireCompleteProfile()"`
 * over apps/sponsor/app/api, which gives 19 calls across 14 files. Three files
 * hold more than one because they export more than one verb.
 *
 * Identifiers that do not exist are used deliberately for the parameterised
 * addresses. The guard runs BEFORE the handler looks anything up, so the subject
 * account is refused regardless — and for the control, reaching a 404 is the
 * proof that execution got past the guard. See the header note on what the
 * control asserts.
 *
 * `writes: true` marks the two that create a row when the control call succeeds.
 * Both write inside the phase7- prefix, so the cleanup block removes them and
 * Step 6 counts to prove it.
 */
const GUARDED = [
  { m: 'GET', p: '/api/attendees' },
  { m: 'GET', p: '/api/browse' },
  { m: 'GET', p: '/api/meetings-data' },
  { m: 'PATCH', p: '/api/meetings/phase7-no-such-meeting', b: { status: 'APPROVED' } },
  { m: 'GET', p: '/api/profile/sponsor-data' },
  { m: 'POST', p: '/api/profile/teammates/register', b: { name: 'Phase 7 Probe', email: 'phase7-probe-colleague@wbr.invalid', jobTitle: 'Probe', password: 'password123' }, writes: true },
  { m: 'GET', p: '/api/profile/teammates' },
  { m: 'POST', p: '/api/profile/teammates', b: { userId: 'phase7-no-such-user' } },
  { m: 'DELETE', p: '/api/profile/teammates', b: { userId: 'phase7-no-such-user' } },
  { m: 'POST', p: '/api/recommendations/phase7-no-such-attendee/draft-intro', b: {}, ai: true },
  { m: 'GET', p: '/api/recommendations/quota' },
  { m: 'POST', p: '/api/request-meeting', b: { attendeeId: 'phase7-no-such-attendee' } },
  { m: 'GET', p: '/api/sponsor-data' },
  { m: 'GET', p: '/api/submissions/phase7-no-such-form' },
  { m: 'PATCH', p: '/api/submissions/phase7-no-such-form', b: { title: 'Phase 7 probe' } },
  { m: 'DELETE', p: '/api/submissions/phase7-no-such-form' },
  { m: 'PATCH', p: '/api/submissions/phase7-no-such-form/submissions/phase7-no-such-response', b: { status: 'ACCEPTED' } },
  { m: 'GET', p: '/api/submissions' },
  { m: 'POST', p: '/api/submissions', b: { title: 'Phase 7 probe form', type: 'ABSTRACT', fields: [] }, writes: true },
]

/**
 * Cleanup, in dependency order — children before parents.
 *
 * Rows the app writes on the fixtures' behalf are matched by the company or the
 * account rather than by a phase7- identifier, because the app generates its own
 * identifiers and they do not carry the prefix.
 */
const CLEANUP_SQL = [
  ['submission responses', `DELETE FROM FormSubmission WHERE formId IN (SELECT id FROM SubmissionForm WHERE sponsorId LIKE 'phase7-%')`],
  ['submission forms', `DELETE FROM SubmissionForm WHERE sponsorId LIKE 'phase7-%'`],
  ['meeting requests', `DELETE FROM MeetingRequest WHERE targetSponsorId LIKE 'phase7-%' OR requesterId LIKE 'phase7-%'`],
  ['probe colleague', `DELETE FROM User WHERE email LIKE 'phase7-%'`],
  ['accounts', `DELETE FROM User WHERE id LIKE 'phase7-%'`],
  ['companies', `DELETE FROM Sponsor WHERE id LIKE 'phase7-%'`],
]

let passCount = 0
let failCount = 0
let skipCount = 0
const skipReasons = []
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }
function skip(msg) { skipCount++; skipReasons.push(msg); console.log(`  – SKIP ${msg}`) }
function section(title) { console.log(`\n${title}`) }
function eq(actual, expected, msg) {
  if (actual === expected) ok(`${msg} (${actual})`)
  else fail(`${msg} — expected ${expected}, got ${actual}`)
}
function truthy(actual, msg) {
  if (actual) ok(msg)
  else fail(`${msg} — was ${JSON.stringify(actual)}`)
}

// ── plumbing ────────────────────────────────────────────────────────────────

const db = new DatabaseSync(DB_PATH)
// PRAGMA journal_mode is `delete` here, not write-ahead logging, so a write
// throws `database is locked` instead of waiting while an app holds the file.
// Phase 5's first run died on this and so did its cleanup block.
db.exec('PRAGMA busy_timeout = 5000')
const one = (q, ...a) => db.prepare(q).get(...a)
const run = (q, ...a) => db.prepare(q).run(...a)

function withRetry(what, fn, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try { return fn() } catch (err) {
      if (i === attempts - 1) throw new Error(`${what}: ${err.message}`)
    }
  }
}

async function signIn(email, password = PASSWORD) {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  if (!csrfRes.ok) throw new Error(`GET ${BASE_URL}/api/auth/csrf -> ${csrfRes.status}`)
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

async function api(cookie, method, path, body) {
  const init = { method, headers: { Cookie: `${COOKIE_NAME}=${cookie}` }, redirect: 'manual' }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE_URL}${path}`, init)
  let parsed = null
  try { parsed = await res.json() } catch { /* not json */ }
  return { status: res.status, body: parsed }
}

/** A screen rather than an address: no redirect following, and the HTML kept. */
async function page(cookie, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    redirect: 'manual',
  })
  const html = res.status === 200 ? await res.text() : ''
  return { status: res.status, location: res.headers.get('location'), html }
}

async function isListening(url) {
  try { await fetch(url, { redirect: 'manual' }); return true } catch { return false }
}

const aiEnabled = () => process.env.WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED === 'true'

/** The refusal this whole phase is about, matched on both parts, not on status alone. */
const isOnboardingRefusal = r => r.status === 403 && r.body?.onboardingRequired === true

/**
 * The explanation panel's own element, so an assertion about its wording cannot
 * be satisfied by text somewhere else in the document.
 *
 * NEGATIVE CONTROL 4 PROVED THIS NECESSARY, and it is the reason this function
 * exists rather than a bare `html.includes`. The first version of Step 1 tested
 * /organi[sz]er/i against the whole page. The explanation names the organizer
 * TWICE — once describing the situation and once as the instruction — so a
 * control that removed the instruction left the other mention behind and the
 * suite stayed green against code that no longer told anyone what to do.
 *
 * THE FIXED WINDOW THAT REPLACED IT WAS ALSO WRONG, and adversarial review
 * round 1 said so: a 1500-character slice from the marker can run past the end
 * of the panel and into the serialized payload Next.js embeds further down the
 * document, which repeats the same sentences. An assertion satisfied by that
 * payload is an assertion about a string in the response, not about the screen.
 *
 * So this walks the element instead. It finds the marker, steps back to the
 * opening angle bracket of the element carrying it, then counts `div` opens and
 * closes forward until the element balances. Exact, and with no browser or
 * parser dependency — the suite is deliberately fetch-based, and pulling in a
 * headless browser to read one element would cost far more than it returns.
 */
function explanationPanel(html) {
  // ANCHOR ON THE ELEMENT'S OWN OPENING TAG, not on the marker text.
  //
  // The version before this one searched for the bare marker string and stepped
  // back to the previous '<'. Adversarial review round 3 reproduced the hole and
  // it is worth stating exactly, because it is the third appearance of this
  // phase's recurring defect: if anything earlier in the document contains the
  // marker text — a serialized payload, a script, a comment — the search finds
  // THAT first, steps back to whatever tag precedes it, and returns a slice
  // spanning the payload and the real panel together. An AC-1 assertion would
  // then be satisfied by payload text while the visible panel said nothing.
  //
  // Requiring `data-testid="…"` inside a real `<div` opening tag removes that:
  // Next.js serializes its payload as escaped JSON strings, which do not form a
  // literal div start tag.
  const open = /<div\b[^>]*\bdata-testid=(["'])sponsor-onboarding-no-company\1[^>]*>/i
  const found = open.exec(html)
  if (!found) return ''
  const start = found.index

  const tag = /<\/?div\b/gi
  tag.lastIndex = start
  let depth = 0
  let t
  while ((t = tag.exec(html)) !== null) {
    if (t[0][1] === '/') {
      depth--
      if (depth === 0) {
        const end = html.indexOf('>', tag.lastIndex)
        const slice = html.slice(start, end === -1 ? tag.lastIndex : end + 1)
        // A script inside the slice means the walk ran past the element — an
        // unbalanced div somewhere would do it. Refuse rather than return a
        // slice that might carry payload text.
        return /<script\b/i.test(slice) ? '' : slice
      }
    } else {
      depth++
    }
  }
  return ''  // never closed — treat as not found rather than guessing
}

// ── setup / teardown ────────────────────────────────────────────────────────

function cleanup() {
  withRetry('cleanup', () => { for (const [, sql] of CLEANUP_SQL) run(sql) })
}

async function createDisposables() {
  // Reuse the scrypt hasher the app itself uses, so the password is valid by
  // construction rather than by a copied hash that could go stale.
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)

  withRetry('create disposables', () => {
    for (const [, sql] of CLEANUP_SQL) run(sql)

    // Sponsor requires conferenceId and has NO updatedAt column — checked
    // against the live schema rather than remembered. Phase 5 lost a cycle here.
    run(`INSERT INTO Sponsor (id, conferenceId, name, ${COMPANY_COLUMNS.join(', ')})
         VALUES (?, ?, ?, ${COMPANY_COLUMNS.map(() => '?').join(', ')})`,
      D.company.id, CONFERENCE_ID, D.company.name, ...COMPANY_COLUMNS.map(k => COMPLETE_COMPANY[k]))

    for (const w of [D.noCompanyRep, D.attachedRep, D.noCompanyStaff]) {
      run(`INSERT INTO User (id, email, name, role, password, sponsorId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        w.id, w.email, w.name, w.role, hash, w.company)
    }
  })
}

// ── the run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('Phase 7 — the no-company explanation')
  console.log(`  sponsor:  ${BASE_URL}`)
  console.log(`  database: ${DB_PATH}`)
  console.log(`  AI switch: ${aiEnabled() ? 'on' : 'OFF — the draft-intro address will be skipped'}`)
  console.log('\nIf this run is killed part-way, clean up with:')
  for (const [what, sql] of CLEANUP_SQL) console.log(`  ${sql};   -- ${what}`)

  // ASSERT THE APP IS ANSWERING BEFORE TRUSTING ANY REFUSAL. Phase 6.5's control
  // driver reported six catches against an app that was never running, because
  // "connection refused" and "correctly refused" look identical to a checker
  // that only reads a failure count.
  if (!(await isListening(BASE_URL))) {
    console.error(`\nThe sponsor app is not answering on ${BASE_URL}. Start it and re-run.`)
    process.exit(1)
  }

  await createDisposables()

  const unlinked = await signIn(D.noCompanyRep.email)
  const linked = await signIn(D.attachedRep.email)
  const staff = await signIn(D.noCompanyStaff.email)

  // ══ 1. AC-1 and AC-3 — the screen ═══════════════════════════════════════════
  section('1. The unlinked representative sees the explanation, not the checklist (AC-1, AC-3)')
  {
    const gated = await page(unlinked, '/dashboard')
    truthy([307, 302, 303].includes(gated.status), `a portal screen redirects the unlinked representative (${gated.status})`)
    truthy(gated.location?.includes('/onboarding'), `and it redirects to the explanation, not the portal (${gated.location})`)

    const shown = await page(unlinked, '/onboarding')
    eq(shown.status, 200, 'the explanation screen renders')
    truthy(shown.html.includes('sponsor-onboarding-no-company'), 'it is the explanation panel')

    // AN ABSENCE CHECK MUST NOT BE SATISFIED BY AN ABSENT PAGE.
    //
    // `page()` returns an empty html string for any non-200 answer, so a bare
    // `!html.includes('…checklist')` passes when the screen 500s — reporting
    // "the checklist did not render" about a page that rendered nothing at all.
    // Adversarial review round 1 found this. Both assertions now require the
    // explanation to have rendered FIRST, so a broken screen fails them instead
    // of collecting them. Negative control 5 holds the property in place: it
    // breaks the render and its predicted count includes these two.
    const rendered = shown.status === 200 && shown.html.includes('sponsor-onboarding-no-company')
    truthy(rendered && !shown.html.includes('sponsor-onboarding-checklist'),
      'the explanation rendered AND the checklist did not (AC-3)')
    truthy(rendered && !shown.html.includes('sponsor-onboarding-input-tagline'),
      'the explanation rendered AND no checklist input is present either')

    // AC-1, ASSERTED ON THE PANEL'S OWN TEXT AND IN TWO PARTS.
    //
    // Against the rendered output rather than the source, because the page's own
    // comment calls its wording provisional and points at these criteria as the
    // specification. Split in two because the criterion is "names the organizer
    // AS THE NEXT STEP" — a bare noun does not satisfy that, and the first
    // version of this assertion, which searched the whole document for the word,
    // stayed green under negative control 4.
    const panel = explanationPanel(shown.html)
    truthy(panel.length > 0, 'the explanation panel could be located in the page')
    truthy(/organi[sz]er/i.test(panel), 'the explanation names the organizer (AC-1, part 1)')
    truthy(
      /contact[^<]{0,80}organi[sz]er/i.test(panel),
      'and tells the reader to contact them, so the organizer is a next step rather than a noun (AC-1, part 2)',
    )

    // CONTROL — the same screen for the linked representative is the portal, not
    // the explanation. Without this, a redirect could mean the app redirects
    // everybody.
    const control = await page(linked, '/dashboard')
    eq(control.status, 200, 'CONTROL: the linked representative reaches the portal')
    truthy(!control.html.includes('sponsor-onboarding-no-company'), 'CONTROL: and is not shown the explanation')
  }

  // ══ 2. AC-2 — the nineteen addresses ════════════════════════════════════════
  section('2. Every guarded address refuses the unlinked representative, and lets the linked one through (AC-2)')
  {
    // One full end-to-end success first, so a green control column below cannot
    // mean the app is uniformly broken in a way that produces 404 everywhere.
    const alive = await api(linked, 'GET', '/api/sponsor-data')
    eq(alive.status, 200, 'CONTROL: GET /api/sponsor-data answers 200 for the linked representative')

    let refused = 0
    let passedGuard = 0
    for (const a of GUARDED) {
      const label = `${a.m} ${a.p}`

      if (a.ai && !aiEnabled()) {
        skip(`${label} — WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED is not set in this script's environment`)
        continue
      }

      const r = await api(unlinked, a.m, a.p, a.b)
      if (isOnboardingRefusal(r)) { refused++; ok(`${label} refuses the unlinked representative (403, onboardingRequired)`) }
      else fail(`${label} did NOT refuse — got ${r.status} ${JSON.stringify(r.body)}`)

      // The control asserts the guard let this caller through, not that the
      // handler succeeded. See the header note.
      const c = await api(linked, a.m, a.p, a.b)
      if (!isOnboardingRefusal(c)) { passedGuard++; ok(`CONTROL: ${label} gets past the guard for the linked representative (${c.status})`) }
      else fail(`CONTROL: ${label} wrongly refused the LINKED representative — the gate is over-blocking`)
    }
    console.log(`  … ${refused} refused, ${passedGuard} controls past the guard`)
  }

  // ══ 3. AC-3 — the save address the checklist would have posted to ═══════════
  section('3. The form the checklist would have shown could not have saved anyway (AC-3)')
  {
    // This is the reason a checklist here would be a trap, and it is asserted
    // rather than quoted. PATCH /api/profile is deliberately NOT behind the
    // guard — the checklist saves through it — so it refuses with its own
    // message, and that is the message this phase's screen exists to replace.
    const r = await api(unlinked, 'PATCH', '/api/profile', { tagline: 'Phase 7 probe' })
    eq(r.status, 403, 'PATCH /api/profile refuses the unlinked representative')
    eq(r.body?.error, 'No sponsor linked', 'and says why — the trap a checklist would have walked them into')

    const c = await api(linked, 'PATCH', '/api/profile', { tagline: COMPLETE_COMPANY.tagline })
    truthy(c.status !== 403, `CONTROL: the same save succeeds for the linked representative (${c.status})`)
  }

  // ══ 4. AC-4 — released by role, not by company ══════════════════════════════
  section('4. A staff account with no company is released by role and never sees the explanation (AC-4)')
  {
    const portal = await page(staff, '/dashboard')
    eq(portal.status, 200, 'the unlinked STAFF account reaches the portal')
    truthy(!portal.html.includes('sponsor-onboarding-no-company'), 'and is never shown the explanation')

    // Typing the address directly must not put an explanation in front of an
    // account the gate has already released.
    const direct = await page(staff, '/onboarding')
    truthy([307, 302, 303].includes(direct.status), `visiting /onboarding directly redirects the staff account away (${direct.status})`)
    truthy(direct.location?.includes('/dashboard'), `and sends it to the portal (${direct.location})`)

    // The data side agrees with the screen side. Same account, same absent
    // company, opposite answer from the subject of this phase — which is the
    // whole point of the role exemption sitting above the company question.
    const r = await api(staff, 'GET', '/api/sponsor-data')
    truthy(!isOnboardingRefusal(r), `the guarded addresses do not refuse it either (${r.status})`)
  }

  // ══ 5. AC-5 — attaching the company releases them ═══════════════════════════
  section('5. Attaching the company releases the representative (AC-5)')
  {
    // THE WRITE ITSELF IS ASSERTED, not assumed. Adversarial review round 2
    // found this step trusting that its own UPDATE had done something. If the
    // fixture row were missing or its id had drifted, the statement would report
    // success having changed nothing, and every assertion below would then be
    // measuring an account that was never attached in the first place.
    const attached = withRetry('attach company', () =>
      run(`UPDATE User SET sponsorId = ? WHERE id = ?`, D.company.id, D.noCompanyRep.id))
    eq(attached.changes, 1, 'the company link was written to exactly one row')

    // ON THE SAME SESSION, deliberately. The session token still says no company,
    // because it was minted before the attach and never changes. Both the screen
    // gate and the request guard read the company from the database, so the
    // release must happen without signing in again — and if it does not, the
    // stale-session defect Phase 6.5 closed has come back.
    const same = await page(unlinked, '/dashboard')
    eq(same.status, 200, 'the portal opens on the SAME session, with no sign-out (this is what reading from the database buys)')

    const data = await api(unlinked, 'GET', '/api/sponsor-data')
    eq(data.status, 200, 'and the data addresses serve it on that same session')

    // And again on a fresh session, so the result is not an artefact of one
    // cookie.
    const fresh = await signIn(D.noCompanyRep.email)
    const freshPage = await page(fresh, '/dashboard')
    eq(freshPage.status, 200, 'a fresh sign-in reaches the portal too')

    // Put it back, so Step 6 counts the same fixture it started with.
    const detached = withRetry('detach company', () =>
      run(`UPDATE User SET sponsorId = NULL WHERE id = ?`, D.noCompanyRep.id))
    eq(detached.changes, 1, 'the company link was removed from exactly one row')

    // A REDIRECT IS NOT THE SAME THING AS A REFUSAL, and the first version of
    // this accepted any 302, 303 or 307. Round 2 named what that would let
    // through: a deleted row, an invalid session, or middleware bouncing to the
    // sign-in page would all have satisfied it, and none of them is evidence
    // that removing the company link is what refused this account.
    //
    // Now both halves are pinned. The screen must send them specifically back to
    // the explanation, and a data address must answer the specific onboarding
    // refusal rather than some other error.
    const again = await page(unlinked, '/dashboard')
    truthy([307, 302, 303].includes(again.status), `removing the link redirects them out of the portal again (${again.status})`)
    truthy(again.location?.includes('/onboarding'), `and specifically back to the explanation, not to sign-in or anywhere else (${again.location})`)

    const refusedAgain = await api(unlinked, 'GET', '/api/sponsor-data')
    truthy(isOnboardingRefusal(refusedAgain),
      `and the data addresses answer the onboarding refusal again, not a different error (${refusedAgain.status})`)
  }

  // ══ 6. AC-6 — cleanup, counted rather than assumed ══════════════════════════
  section('6. Nothing seeded was touched and nothing this run made is left (AC-6)')
  {
    cleanup()
    const left = {
      companies: one(`SELECT COUNT(*) AS n FROM Sponsor WHERE id LIKE 'phase7-%'`).n,
      accounts: one(`SELECT COUNT(*) AS n FROM User WHERE id LIKE 'phase7-%' OR email LIKE 'phase7-%'`).n,
      forms: one(`SELECT COUNT(*) AS n FROM SubmissionForm WHERE sponsorId LIKE 'phase7-%'`).n,
      requests: one(`SELECT COUNT(*) AS n FROM MeetingRequest WHERE targetSponsorId LIKE 'phase7-%' OR requesterId LIKE 'phase7-%'`).n,
    }
    for (const [what, n] of Object.entries(left)) eq(n, 0, `no ${what} left behind`)

    // The seeded demonstration accounts are untouched — asserted, because a
    // cleanup statement with a mistaken pattern would delete them silently.
    const seeded = one(`SELECT COUNT(*) AS n FROM User WHERE email IN ('wbr@test.com','sponsor@test.com','stephcurry@test.com','onboarding-demo@test.com')`).n
    eq(seeded, 4, 'the four canonical demonstration accounts are still present')
  }

  // ── summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(70)}`)
  console.log(`Phase 7: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`)
  if (skipCount) {
    console.log('\nSkipped, and why:')
    for (const r of skipReasons) console.log(`  – ${r}`)
    console.log('\nA skip is NOT a pass. Set the switch and re-run before citing this total.')
  }
  console.log('AC-7 (smoketest document) is a document deliverable and is not asserted here.')
  process.exit(failCount > 0 || skipCount > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('\nRun failed:', err.message)
  try { cleanup() } catch { /* best effort — the statements were printed on startup */ }
  process.exit(1)
})
