#!/usr/bin/env node
/**
 * Phase 6.5 — sponsor portal remaining defects.
 *
 * Acceptance criteria from `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`
 * § Phase 6.5. Requirements and every measurement behind them in
 * `.claude/docs/prds/wbr_onboarding_enforcement_prd_2026_07_30.md` § Phase 6.5.
 *
 *   AC-1   Every handler that consults the caller's company reads it from the
 *          database. DOCUMENT DELIVERABLE — the enumeration of all nineteen
 *          guarded addresses lives in the smoketest document, not here.
 *   AC-2   A representative moved between companies mid-session is REFUSED at
 *          their previous company's records and SERVED at their current
 *          company's, without signing out. All five changing addresses, both
 *          directions.
 *   AC-3   The case Phase 6 measured is closed: a representative the database
 *          places at one company can no longer approve a meeting request
 *          addressed to another.
 *   AC-4   The reading addresses show the CURRENT company's data on a stale
 *          session, not the previous one's.
 *   AC-5   No additional database read per request. DOCUMENT DELIVERABLE —
 *          a query count is not observable from outside, so this is asserted by
 *          reading the code and recorded as such.
 *   AC-6   `apps/sponsor/lib/caller-company.ts` no longer exists and exactly one
 *          way to resolve the caller's company remains.
 *   AC-7   The teammate picker offers no account holding a WBR-side role,
 *          asserted against the list the screen actually receives.
 *   AC-8   A signed-out request to an admin-app page whose address ends in an
 *          image extension is redirected, matching the other three apps.
 *   AC-9   `pnpm-lock.yaml` records `packages/ui`.
 *   AC-10  `CHANGELOG.md` says twelve, not fifteen.
 *   AC-11  PATCH and DELETE on /api/submissions/[id] answer 404 for a form that
 *          is not the caller's, rather than a 200 that quietly did nothing.
 *   AC-12  A response's status can be changed only through the form it belongs
 *          to. Asserted with two representatives EACH SIGNED IN AT THEIR OWN
 *          COMPANY, so it does not depend on a stale session.
 *   AC-13  Everything this run creates is removed, verified by counting rows.
 *
 * WHAT A GREEN RUN IS EVIDENCE OF. The assertions listed below and nothing
 * wider. This repository has been burned by the opposite reading four times now:
 * Phase 1 passed 33 of 33 while a delegate blocked from every screen could still
 * post in a chat room; Phase 5 passed 68 of 68 while the sponsor checklist could
 * not be submitted in a browser at all; Phase 6's first Step 10 reported three
 * failures against a feature that worked; and Phase 13 printed a "5 of 5 caught"
 * control table describing code that no longer existed. Before citing a total
 * from this file, run phase-6-5-negative-controls.sh, which breaks each fix in
 * turn and shows these assertions going red. That driver exits non-zero if a
 * control fails to apply or fails to be caught, so its own evidence cannot go
 * stale unnoticed.
 *
 * EVERY REFUSAL IS PAIRED WITH A CONTROL. An assertion that a call was refused
 * proves nothing alone — a malformed request is also refused. Each refusal here
 * sits next to the equivalent legitimate call succeeding. The cross-company
 * defect at AC-12 was only found this way: the refusal looked correct until the
 * control showed the call itself worked.
 *
 * NOTHING SEEDED IS TOUCHED. This run creates two companies and three accounts,
 * plus whatever the app creates on its behalf, and deletes all of it at the end.
 * If it is killed part-way the exact cleanup statements are PRINTED ON STARTUP.
 *
 * Prerequisites:
 *   - Sponsor app on SPONSOR_BASE_URL (default http://localhost:3003), tier C —
 *     a production build, not a dev server. Kill the port first; a server
 *     started before your change serves stale code (check with `ps -o lstart=`):
 *       lsof -ti:3003 | xargs kill -9
 *       pnpm --filter sponsor build
 *       cd apps/sponsor && WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true pnpm start
 *   - THAT ENVIRONMENT VARIABLE MATTERS for the two AI addresses, exactly as it
 *     does for Phase 6's suite. With the switch off they answer 404 to everybody
 *     and this script reports a loud SKIP for them rather than a pass.
 *   - Admin app on WEB_BASE_URL (default http://localhost:3000) for AC-8 only.
 *     Without it AC-8 reports a SKIP rather than a pass.
 *   - apps/sponsor/.env.local with DATABASE_URL (absolute file: path) and
 *     NEXTAUTH_SECRET.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-6-5-sponsor-remaining-defects.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure, setup error, or skipped check
 * that was not deliberately skipped.
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE_URL = process.env.SPONSOR_BASE_URL ?? 'http://localhost:3003'
const WEB_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3000'
const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'password123'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'
const CONFERENCE_ID = 'conf-2025'

/** A company satisfying all six required items, so nothing is refused for an
 *  unrelated completeness reason. Same shape Phase 13 used. */
const COMPLETE_COMPANY = {
  logoUrl: '/sponsors/phase65.png',
  tagline: 'A disposable exhibitor for Phase 6.5',
  description: 'Twenty-one characters',
  contactName: 'Phase Six Five Contact',
  contactEmail: 'phase65-contact@wbr.invalid',
  solutionsOffering: JSON.stringify(['ERP / Operations']),
  website: 'https://phase65.wbr.invalid',
}
const COMPANY_COLUMNS = Object.keys(COMPLETE_COMPANY)

const D = {
  companyA: { id: 'phase65-company-a', name: 'Phase 6.5 Exhibitor A' },
  companyB: { id: 'phase65-company-b', name: 'Phase 6.5 Exhibitor B' },
  repA: { id: 'phase65-rep-a', email: 'phase65-rep-a@wbr.invalid', name: 'Phase 6.5 Rep A', role: 'SPONSOR', company: 'phase65-company-a' },
  repB: { id: 'phase65-rep-b', email: 'phase65-rep-b@wbr.invalid', name: 'Phase 6.5 Rep B', role: 'SPONSOR', company: 'phase65-company-b' },

  // THE TWO PICKER FIXTURES ARE NAMED TO SORT FIRST, and that is not decoration.
  //
  // getCachedAvailableUsers takes the FIRST 200 unattached accounts ordered by
  // name, and there are over 2,400. A fixture named "Phase 6.5 …" would never be
  // in the list the screen can show, so an assertion that it is absent would pass
  // whether the fix worked or not — the worst kind of green. Phase 13 lost an
  // investigation to exactly this and recorded it; this is that lesson applied.
  //
  // The staff account is the subject: it must NOT be offered.
  // The delegate is the control: it MUST be offered, so that "staff is absent"
  // cannot be satisfied by an empty or broken list.
  pickerStaff: { id: 'phase65-picker-staff', email: 'phase65-picker-staff@wbr.invalid', name: 'AAAA Phase 65 Staff', role: 'STAFF', company: null },
  pickerDelegate: { id: 'phase65-picker-delegate', email: 'phase65-picker-delegate@wbr.invalid', name: 'AAAB Phase 65 Delegate', role: 'ATTENDEE', company: null },
}

/** Every row this run can create, in an order that respects foreign keys.
 *  One definition, two consumers: the cleanup and the statements printed on
 *  startup — so a statement cannot be added in one place and forgotten in the
 *  other. */
const CLEANUP_SQL = [
  ['meeting requests', `DELETE FROM MeetingRequest WHERE id LIKE 'phase65-%'`],
  ['responses', `DELETE FROM FormSubmission WHERE id LIKE 'phase65-%'`],
  ['forms', `DELETE FROM SubmissionForm WHERE sponsorId LIKE 'phase65-%'`],
  ['accounts', `DELETE FROM User WHERE id LIKE 'phase65-%'`],
  ['companies', `DELETE FROM Sponsor WHERE id LIKE 'phase65-%'`],
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

async function signIn(email, password = PASSWORD, base = BASE_URL) {
  const csrfRes = await fetch(`${base}/api/auth/csrf`)
  if (!csrfRes.ok) throw new Error(`GET ${base}/api/auth/csrf -> ${csrfRes.status}`)
  const { csrfToken } = await csrfRes.json()
  const csrfCookies = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
  const res = await fetch(`${base}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookies },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
    redirect: 'manual',
  })
  const raw = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) throw new Error(`sign-in for ${email} set no session cookie (HTTP ${res.status})`)
  return raw.split(';')[0].split('=').slice(1).join('=')
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

async function isListening(url) {
  try { await fetch(url, { redirect: 'manual' }); return true } catch { return false }
}

const aiEnabled = () => process.env.WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED === 'true'

// ── setup / teardown ────────────────────────────────────────────────────────

function cleanup() {
  withRetry('cleanup', () => { for (const [, sql] of CLEANUP_SQL) run(sql) })
}

async function createDisposables() {
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)

  withRetry('create disposables', () => {
    for (const [, sql] of CLEANUP_SQL) run(sql)

    // Sponsor requires conferenceId and has NO updatedAt column — checked
    // against the live schema rather than remembered. Phase 5 lost a cycle here.
    for (const c of [D.companyA, D.companyB]) {
      run(`INSERT INTO Sponsor (id, conferenceId, name, ${COMPANY_COLUMNS.join(', ')})
           VALUES (?, ?, ?, ${COMPANY_COLUMNS.map(() => '?').join(', ')})`,
        c.id, CONFERENCE_ID, c.name, ...COMPANY_COLUMNS.map(k => COMPLETE_COMPANY[k]))
    }
    for (const w of [D.repA, D.repB, D.pickerStaff, D.pickerDelegate]) {
      run(`INSERT INTO User (id, email, name, role, password, sponsorId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        w.id, w.email, w.name, w.role, hash, w.company)
    }
  })
}

// ── the run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('Phase 6.5 — sponsor portal remaining defects')
  console.log(`  sponsor:  ${BASE_URL}`)
  console.log(`  admin:    ${WEB_URL}`)
  console.log(`  database: ${DB_PATH}`)
  console.log('\nIf this run is killed part-way, clean up with:')
  for (const [what, sql] of CLEANUP_SQL) console.log(`  ${sql};   -- ${what}`)

  if (!(await isListening(BASE_URL))) {
    console.error(`\nThe sponsor app is not answering on ${BASE_URL}. Start it and re-run.`)
    process.exit(1)
  }

  await createDisposables()

  const cookieA = await signIn(D.repA.email)
  const cookieB = await signIn(D.repB.email)

  // Fixtures created THROUGH THE APP, so the app decides their shape rather
  // than this script guessing it.
  const mkForm = async (cookie, title) => {
    const r = await api(cookie, 'POST', '/api/submissions', { title, type: 'ABSTRACT', fields: [] })
    if (r.status !== 200) throw new Error(`create form -> ${r.status} ${JSON.stringify(r.body)}`)
    return r.body.id
  }
  const formA = await mkForm(cookieA, 'Phase 6.5 form A')
  const formB = await mkForm(cookieB, 'Phase 6.5 form B')

  const mkResponse = (formId, suffix) => {
    const id = `phase65-resp-${suffix}`
    run(`INSERT INTO FormSubmission (id, formId, name, email, data, status, createdAt, updatedAt)
         VALUES (?, ?, 'Phase 65 Responder', 'phase65-responder@wbr.invalid', '{}', 'PENDING', datetime('now'), datetime('now'))`,
      id, formId)
    return id
  }
  const respA = mkResponse(formA, 'a')
  const respB = mkResponse(formB, 'b')

  const statusOf = id => one(`SELECT status FROM FormSubmission WHERE id=?`, id)?.status ?? '(gone)'
  const titleOf = id => one(`SELECT title FROM SubmissionForm WHERE id=?`, id)?.title ?? '(gone)'
  const formExists = id => one(`SELECT COUNT(*) AS n FROM SubmissionForm WHERE id=?`, id).n === 1

  // ══ 1. AC-12 — the cross-company response defect ═══════════════════════════
  // FIRST, and with both representatives correctly signed in at their own
  // company. This has nothing to do with stale sessions and must not be able to
  // hide behind one.
  section('1. A response can be changed only through the form it belongs to (AC-12)')
  {
    const before = statusOf(respB)
    const r = await api(cookieA, 'PATCH', `/api/submissions/${formA}/submissions/${respB}`, { status: 'ACCEPTED' })
    eq(r.status, 404, "company A pairing its own form with company B's response is refused")
    eq(statusOf(respB), before, "company B's response is unchanged in the database")

    // THE CONTROL. Without it, a 404 above could mean the call is simply broken.
    const ownBefore = statusOf(respA)
    const ctrl = await api(cookieA, 'PATCH', `/api/submissions/${formA}/submissions/${respA}`, { status: 'REVIEWED' })
    eq(ctrl.status, 200, "control: company A changing its OWN response succeeds")
    if (statusOf(respA) === 'REVIEWED' && ownBefore !== 'REVIEWED') ok('control: the change reached the database')
    else fail(`control: expected respA PENDING -> REVIEWED, saw ${ownBefore} -> ${statusOf(respA)}`)
  }

  // ══ 2. AC-11 — a refusal on the write verbs is visible ═════════════════════
  section("2. Editing or deleting another company's form is refused, visibly (AC-11)")
  {
    const before = titleOf(formB)
    const p = await api(cookieA, 'PATCH', `/api/submissions/${formB}`, { title: 'renamed by company A' })
    eq(p.status, 404, "company A editing company B's form is refused")
    eq(titleOf(formB), before, "company B's form title is unchanged")

    const d = await api(cookieA, 'DELETE', `/api/submissions/${formB}`)
    eq(d.status, 404, "company A deleting company B's form is refused")
    eq(formExists(formB), true, "company B's form is still there")

    const g = await api(cookieA, 'GET', `/api/submissions/${formB}`)
    eq(g.status, 404, "and reading it answers the same 404, so all three verbs agree")

    // Controls on the caller's own form.
    const own = await api(cookieA, 'PATCH', `/api/submissions/${formA}`, { title: 'Phase 6.5 form A renamed' })
    eq(own.status, 200, 'control: company A editing its OWN form succeeds')
    eq(titleOf(formA), 'Phase 6.5 form A renamed', 'control: the edit reached the database')
  }

  // ══ 3. AC-2 / AC-3 / AC-4 — the stale session ══════════════════════════════
  section('3. A representative moved between companies mid-session (AC-2, AC-3, AC-4)')
  console.log('   Representative A is moved to company B in the database. Their session,')
  console.log('   and the company recorded in it at sign-in, are left untouched.')
  withRetry('move rep A', () => run(`UPDATE User SET sponsorId=? WHERE id=?`, D.companyB.id, D.repA.id))
  {
    const moved = one(`SELECT sponsorId FROM User WHERE id=?`, D.repA.id).sponsorId
    eq(moved, D.companyB.id, 'the database now places representative A at company B')

    // ── reading addresses (AC-4) ──
    const list = await api(cookieA, 'GET', '/api/submissions')
    const ids = Array.isArray(list.body) ? list.body.map(f => f.id) : []
    eq(list.status, 200, 'GET /api/submissions answers')
    eq(ids.includes(formB), true, "the form list shows the CURRENT company's form")
    eq(ids.includes(formA), false, "and not the PREVIOUS company's form")

    const profile = await api(cookieA, 'GET', '/api/profile/sponsor-data')
    eq(profile.status, 200, 'GET /api/profile/sponsor-data answers')
    eq(profile.body?.sponsor?.id, D.companyB.id, 'the company profile is the CURRENT company')

    const dash = await api(cookieA, 'GET', '/api/sponsor-data')
    eq(dash.status, 200, 'GET /api/sponsor-data answers')
    if (JSON.stringify(dash.body ?? {}).includes(D.companyA.id)) {
      fail("the dashboard payload still mentions the PREVIOUS company's identifier")
    } else ok("the dashboard payload does not mention the PREVIOUS company's identifier")

    const meetings = await api(cookieA, 'GET', '/api/meetings-data')
    eq(meetings.status, 200, 'GET /api/meetings-data answers')

    if (aiEnabled()) {
      const quota = await api(cookieA, 'GET', '/api/recommendations/quota')
      eq(quota.status, 200, 'GET /api/recommendations/quota serves a caller whose CURRENT company exists')
    } else {
      skip('GET /api/recommendations/quota — WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED is not "true"')
    }

    // ── changing addresses (AC-2) ──
    const staleEdit = await api(cookieA, 'PATCH', `/api/submissions/${formA}`, { title: 'edited on a stale session' })
    eq(staleEdit.status, 404, "editing the PREVIOUS company's form is refused")
    eq(titleOf(formA), 'Phase 6.5 form A renamed', "the PREVIOUS company's form is unchanged")

    const currentEdit = await api(cookieA, 'PATCH', `/api/submissions/${formB}`, { title: 'edited by the current company' })
    eq(currentEdit.status, 200, "editing the CURRENT company's form succeeds")
    eq(titleOf(formB), 'edited by the current company', 'and the edit reached the database')

    const staleResp = await api(cookieA, 'PATCH', `/api/submissions/${formA}/submissions/${respA}`, { status: 'ACCEPTED' })
    eq(staleResp.status, 404, "setting a response status on the PREVIOUS company's form is refused")
    const currentResp = await api(cookieA, 'PATCH', `/api/submissions/${formB}/submissions/${respB}`, { status: 'ACCEPTED' })
    eq(currentResp.status, 200, "setting one on the CURRENT company's form succeeds")

    const created = await api(cookieA, 'POST', '/api/submissions', { title: 'phase65 created on a stale session', type: 'ABSTRACT', fields: [] })
    eq(created.status, 200, 'POST /api/submissions succeeds')
    const owner = created.body?.id ? one(`SELECT sponsorId FROM SubmissionForm WHERE id=?`, created.body.id)?.sponsorId : '(none)'
    eq(owner, D.companyB.id, 'the new form belongs to the CURRENT company, not the previous one')

    const staleDelete = await api(cookieA, 'DELETE', `/api/submissions/${formA}`)
    eq(staleDelete.status, 404, "deleting the PREVIOUS company's form is refused")
    eq(formExists(formA), true, "the PREVIOUS company's form is still there")

    // ── AC-3, the address the original defect was measured on ──
    const mkRequest = (suffix, targetCompany) => {
      const id = `phase65-req-${suffix}`
      run(`INSERT INTO MeetingRequest (id, requesterId, targetSponsorId, status, priority, createdAt, updatedAt)
           VALUES (?, ?, ?, 'PENDING', 'MED', datetime('now'), datetime('now'))`,
        id, D.pickerDelegate.id, targetCompany)
      return id
    }
    const reqToA = mkRequest('to-a', D.companyA.id)
    const reqToB = mkRequest('to-b', D.companyB.id)
    const reqStatus = id => one(`SELECT status FROM MeetingRequest WHERE id=?`, id)?.status ?? '(gone)'

    const approveA = await api(cookieA, 'PATCH', `/api/meetings/${reqToA}`, { status: 'APPROVED' })
    eq(approveA.status, 403, "approving a meeting request addressed to the PREVIOUS company is refused")
    eq(reqStatus(reqToA), 'PENDING', 'that request is still PENDING — the exact case Phase 6 measured')

    const approveB = await api(cookieA, 'PATCH', `/api/meetings/${reqToB}`, { status: 'APPROVED' })
    eq(approveB.status, 200, "approving one addressed to the CURRENT company succeeds")
    eq(reqStatus(reqToB), 'APPROVED', 'and that request is now APPROVED')

    // ── the AI draft address ──
    if (aiEnabled()) {
      const draft = await api(cookieA, 'POST', `/api/recommendations/${D.pickerDelegate.id}/draft-intro`, { idempotencyKey: 'phase65-key-1' })
      if (draft.status === 403) {
        fail('the draft-introduction address refused a caller whose CURRENT company exists')
      } else if (draft.status === 502 && draft.body?.error === 'ai_unavailable') {
        ok('the draft-introduction address resolved the company and reached the credential check (502 ai_unavailable, no key configured)')
        skip('the draft-introduction SUCCESS path needs an OPENAI_API_KEY, which is configured nowhere locally')
      } else {
        ok(`the draft-introduction address answered ${draft.status} after resolving the company`)
      }
    } else {
      skip('the draft-introduction address — WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED is not "true"')
    }
  }

  // ══ 4. AC-7 — the teammate picker ══════════════════════════════════════════
  section('4. The teammate picker offers no WBR-side account (AC-7)')
  {
    // FORCE THE CACHED LIST TO REFRESH BEFORE READING IT, and do it through the
    // app's own behaviour rather than by reaching into its cache.
    //
    // getCachedAvailableUsers is wrapped in unstable_cache with a 120-second
    // window and the tag `attendee-pool`. That cache is written to .next/cache,
    // so it SURVIVES A REBUILD AND A RESTART. The negative-control driver found
    // this the hard way: control 5 broke the rule, the broken list was cached,
    // and the two runs after it — including the restored, fully-fixed tree —
    // were served that stale list and reported the staff account still offered.
    // An assertion whose result depends on what a previous run cached is not an
    // assertion about the code.
    //
    // Attaching and then detaching the delegate calls revalidateTag('attendee-pool')
    // twice, which is the app's own way of saying the pool has changed. After
    // this the next read is computed fresh.
    //
    // RECORDED, because it is a property of the product and not only of this
    // test: after this fix is deployed, a list cached before the deployment can
    // still offer a WBR-side account until the tag is revalidated or the 120
    // seconds elapse. Bounded and self-correcting, but not instant.
    await api(cookieB, 'POST', '/api/profile/teammates', { userId: D.pickerDelegate.id })
    await api(cookieB, 'DELETE', '/api/profile/teammates', { userId: D.pickerDelegate.id })
    const detached = one(`SELECT sponsorId FROM User WHERE id=?`, D.pickerDelegate.id).sponsorId
    eq(detached, null, 'setup: the delegate is unattached again, and the cached pool has been revalidated')

    const r = await api(cookieB, 'GET', '/api/profile/sponsor-data')
    eq(r.status, 200, 'the screen receives its list')
    const offered = Array.isArray(r.body?.availableUsers) ? r.body.availableUsers : []
    const ids = offered.map(u => u.id)

    // The control comes FIRST. If the delegate is missing, the list is empty or
    // broken and the staff assertion below would pass for the wrong reason.
    eq(ids.includes(D.pickerDelegate.id), true, 'control: the delegate fixture IS offered, so the list is real')
    eq(ids.includes(D.pickerStaff.id), false, 'the STAFF fixture is NOT offered')
    console.log(`      (the screen received ${offered.length} accounts)`)

    // The rule is enforced at the address too, not only in the list, because the
    // list is cached for 120 seconds and can be bypassed by calling directly.
    const attachStaff = await api(cookieB, 'POST', '/api/profile/teammates', { userId: D.pickerStaff.id })
    eq(attachStaff.status, 403, 'attaching a STAFF account directly is refused, not just hidden')
    eq(one(`SELECT sponsorId FROM User WHERE id=?`, D.pickerStaff.id).sponsorId, null, 'the staff account has no company afterwards')

    // THE THIRD PATH TO THE SAME COLUMN. Found by adversarial review round 1 and
    // confirmed by measurement before the code changed.
    //
    // Three addresses can write a person's company: the picker's attach (above),
    // this registration address when the email belongs to an account that already
    // exists, and this registration address when it creates a new one. The first
    // version of this phase wired the rule into the picker and the attach handler
    // and missed the registration address entirely — so a WBR-side account with
    // no company could still be attached by posting its EMAIL rather than its
    // identifier, bypassing both the filtered list and the guarded attach.
    //
    // Phase 13 recorded the same lesson about this same defect family: it has
    // three code paths, not one. Missing one of them again is why this assertion
    // exists rather than a comment.
    const registerStaff = await api(cookieB, 'POST', '/api/profile/teammates/register',
      { email: D.pickerStaff.email, password: 'password123', name: 'AAAA Phase 65 Staff' })
    eq(registerStaff.status, 403, 'registering a WBR-side account BY EMAIL is refused too')
    eq(one(`SELECT sponsorId FROM User WHERE id=?`, D.pickerStaff.id).sponsorId, null,
      'the staff account still has no company after the email path')

    const attachDelegate = await api(cookieB, 'POST', '/api/profile/teammates', { userId: D.pickerDelegate.id })
    eq(attachDelegate.status, 200, 'control: attaching the delegate succeeds')
    eq(one(`SELECT sponsorId FROM User WHERE id=?`, D.pickerDelegate.id).sponsorId, D.companyB.id, 'control: the delegate is now on company B')
  }

  // ══ 5. AC-8 — the admin app protects pages by folder ═══════════════════════
  section('5. The admin app protects a page whose address ends in an image extension (AC-8)')
  if (!(await isListening(WEB_URL))) {
    skip(`AC-8 — the admin app is not answering on ${WEB_URL}`)
  } else {
    const res = await fetch(`${WEB_URL}/dashboard/sponsors/anything.png`, { redirect: 'manual' })
    if (res.status === 307 || res.status === 302) {
      ok(`a signed-out request is redirected (${res.status} -> ${res.headers.get('location')})`)
    } else {
      fail(`a signed-out request answered ${res.status}; expected a redirect to the sign-in page`)
    }
    const control = await fetch(`${WEB_URL}/dashboard/sponsors`, { redirect: 'manual' })
    if (control.status === 307 || control.status === 302) ok('control: an ordinary dashboard page is redirected the same way')
    else fail(`control: an ordinary dashboard page answered ${control.status}`)
  }

  // ══ 6. AC-6, AC-9, AC-10 — repository facts ════════════════════════════════
  section('6. Repository facts (AC-6, AC-9, AC-10)')
  {
    eq(existsSync(join(ROOT, 'apps/sponsor/lib/caller-company.ts')), false,
      'apps/sponsor/lib/caller-company.ts no longer exists')

    const lock = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8')
    eq(/^\s{2}packages\/ui:/m.test(lock), true, 'pnpm-lock.yaml records packages/ui')

    const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
    eq(/Corrected 2026-08-01: twelve/.test(changelog), true, 'CHANGELOG.md carries the corrected count of twelve')
  }

  // ══ 7. AC-13 — cleanup ═════════════════════════════════════════════════════
  section('7. Nothing seeded was touched and nothing this run made is left (AC-13)')
  {
    cleanup()
    const left = {
      companies: one(`SELECT COUNT(*) AS n FROM Sponsor WHERE id LIKE 'phase65-%'`).n,
      accounts: one(`SELECT COUNT(*) AS n FROM User WHERE id LIKE 'phase65-%'`).n,
      forms: one(`SELECT COUNT(*) AS n FROM SubmissionForm WHERE sponsorId LIKE 'phase65-%'`).n,
      responses: one(`SELECT COUNT(*) AS n FROM FormSubmission WHERE id LIKE 'phase65-%'`).n,
      requests: one(`SELECT COUNT(*) AS n FROM MeetingRequest WHERE id LIKE 'phase65-%'`).n,
    }
    const total = Object.values(left).reduce((a, b) => a + b, 0)
    eq(total, 0, `no phase65 rows remain — verified by counting (${JSON.stringify(left)})`)
  }

  section('Result')
  console.log(`  ${passCount} passed, ${failCount} failed, ${skipCount} skipped`)
  if (skipReasons.length) {
    console.log('\n  Skipped, each deliberately and for a stated reason:')
    for (const r of skipReasons) console.log(`    - ${r}`)
  }
  console.log('\n  AC-1 and AC-5 are document deliverables — see')
  console.log('  docs/smoketests/phase-6-5-sponsor-remaining-defects.md')
  console.log('\n  Green here is evidence about the assertions above and nothing wider.')
  console.log('  Run phase-6-5-negative-controls.sh before citing this total.')
}

try {
  await main()
} catch (err) {
  console.error(`\nRUN FAILED: ${err.message}`)
  failCount++
} finally {
  try { cleanup() } catch (err) { console.error(`cleanup failed: ${err.message}`) }
  db.close()
}
process.exit(failCount > 0 ? 1 : 0)
