#!/usr/bin/env node
/**
 * Phase 2 verification: the gate demonstration account restores its own
 * incompleteness on every sign-in.
 *
 * Every assertion below is a contract check per docs/smoketests/CONTRACT.md
 * §1.1 — a binary observable. A column holds a value or it does not; a request
 * redirects to the checklist or it does not. Nothing here is environment
 * sensitive, so it is valid on a development server as well as on a local
 * production build. It is run on a production build anyway, because phase 7
 * measured a case that passed on one and failed on the other.
 *
 *   AC-1  Signing in as the delegate demonstration account on the participant
 *         application lands on the checklist.
 *   AC-2  Completing the checklist releases the account into the application.
 *   AC-3  Signing out and signing in again shows the checklist again. This is
 *         the whole phase.
 *   AC-4  The same three hold on the meetings portal, through the gate phase 1
 *         built.
 *   AC-5  CONTAINMENT. For each of the three non-demonstration canonical
 *         accounts: read its required fields from the database, sign in, read
 *         them again — the values are identical.
 *   AC-6  An account not carrying the flag is unaffected even when its profile
 *         is deliberately incomplete.
 *   AC-7  The restore happens on the sign-in path only: a session left open
 *         while the checklist is being completed does not have the field
 *         blanked underneath it.
 *
 * WHY AC-5 IS THE POINT AND NOT A FOOTNOTE
 * The mechanism under test rewrites a whole account definition when it fires.
 * The only thing standing between that and three real demonstration logins is
 * one early return. AC-5 is what proves the early return works, so it is built
 * to fail loudly rather than to pass quietly:
 *
 *   - It reads the six columns straight from the database on both sides, never
 *     from a screen, so a cached page cannot report a stale pass.
 *   - It runs in two parts. Part 1 signs each account in as it stands. Part 2
 *     first gives one account values that NO definition holds, so a write
 *     cannot be mistaken for a no-op: comparing before against after can pass
 *     when a leak writes back the same value it found, and part 2 removes that.
 *
 * WHAT THIS RUN DELIBERATELY DOES NOT ASSERT
 * That exactly one account definition carries the restore flag. That is a
 * structural claim about a source file rather than an observable behaviour, and
 * a browser check that asserts on source text stops being a check of the
 * running system. It is covered instead by
 * packages/db/scripts/test-canonical-account-restore.ts, which calls the module
 * directly. The behavioural half — this account restores, those three do not —
 * is what is asserted here, and it is the half that matters on the day.
 *
 * WHAT THIS RUN TOUCHES, AND HOW IT PUTS IT BACK
 * It writes to four canonical accounts. Their PROFILE columns are snapshotted on
 * start and restored on exit, and the restore is VERIFIED by reading back — a
 * failed teardown fails the run, because leaving the demonstration prop
 * completed is exactly the harm this phase exists to prevent. One throwaway
 * delegate is created for the preflight and deleted at the end.
 *
 * `loginCount` and `updatedAt` are NOT put back, because every successful
 * sign-in calls recordLogin() and this run signs in many times. They are printed
 * at the end instead. The distinction is deliberate: "the profile columns are
 * back" is true, "the rows are untouched" would not be.
 *
 * Prerequisites:
 *   - Participant application on ATTENDEE_BASE_URL (default
 *     http://localhost:3001) and meetings portal on MEETINGS_BASE_URL (default
 *     http://localhost:3002), both serving THIS branch. Check what is actually
 *     on each port before trusting it:
 *       lsof -nP -iTCP:3001 -iTCP:3002 -sTCP:LISTEN
 *       ps -o pid,etime,command -p <pid>
 *     A process whose age is measured in days is not this run's server.
 *   - Each app's .env.local with DATABASE_URL as an ABSOLUTE file: path
 *     pointing at the same database this script reads, and NEXTAUTH_SECRET set.
 *
 * DO NOT run this against a deployment. It writes, and every Vercel deployment
 * of this project — preview included — reads and writes the shared production
 * database. The preflight refuses a non-local base address for that reason.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-2-demo-account-restore.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure, setup error or dirty teardown.
 */

import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')

/**
 * The two applications, and the body each one's OWN checklist sends.
 *
 * The shapes differ and that is not a mistake in this file. The participant
 * app's save address passes the body it receives to the database layer, so a
 * list must arrive already encoded as a string, and its checklist sends
 * JSON.stringify(...) accordingly (apps/attendee/components/onboarding/
 * OnboardingChecklist.tsx). The meetings portal's address encodes the list
 * itself, so its checklist sends a real array. Sending one shape to both makes
 * one of them answer 500 — measured, and recorded as a finding rather than
 * fixed here, because neither address is this phase's subject.
 *
 * The stored result is the same either way, which is what the assertions read.
 */
const COMPLETED_LIST = ['AI & Automation']
const COMPLETED_STORED = JSON.stringify(COMPLETED_LIST)

const ATTENDEE = {
  label: 'participant application',
  base: process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001',
  completionBody: { solutionsSeeking: COMPLETED_STORED },
}
const MEETINGS = {
  label: 'meetings portal',
  base: process.env.MEETINGS_BASE_URL ?? 'http://localhost:3002',
  completionBody: { solutionsSeeking: COMPLETED_LIST },
}

const PASSWORD = process.env.WBR_PASSWORD ?? 'password123'
const CHECKLIST = '/onboarding'

/** The canonical account held one field short on purpose — the subject. */
const DEMO_EMAIL = 'onboarding-demo@test.com'

/**
 * The three that must be untouched. Each is signed in to the participant
 * application, which admits all three roles; the meetings portal does not admit
 * SPONSOR, so it cannot serve as the single place to check all three.
 */
const CONTAINMENT_ACCOUNTS = [
  { email: 'wbr@test.com', role: 'ORGANIZER' },
  { email: 'stephcurry@test.com', role: 'BRAND' },
  { email: 'sponsor@test.com', role: 'SPONSOR' },
]

const ALL_CANONICAL = [DEMO_EMAIL, ...CONTAINMENT_ACCOUNTS.map(a => a.email)]

/** The six the delegate gate measures. Mirrors DELEGATE_REQUIRED_FIELDS. */
const REQUIRED_COLUMNS = ['name', 'jobTitle', 'company', 'companySize', 'annualRevenue', 'solutionsSeeking']

/**
 * The PROFILE columns this run snapshots and puts back. Deliberately not "every
 * column".
 *
 * `loginCount` and `updatedAt` are NOT restored, and must not be: every
 * successful sign-in calls recordLogin(), so this run legitimately increments
 * them on each account it signs in as. Writing them back would be falsifying an
 * audit trail to make a test look tidy.
 *
 * So the teardown's claim is "the profile columns are back", not "the row is
 * back". Saying the stronger thing while doing the weaker one is what an earlier
 * review caught here — the difference matters because the containment criterion
 * is about profile values, and a claim that overreaches is one a later reader
 * relies on.
 */
const SNAPSHOT_COLUMNS = [...REQUIRED_COLUMNS, 'solutionsOffering', 'image']

/** Columns this run knowingly changes and does not put back. Reported, not restored. */
const UNRESTORED_COLUMNS = ['loginCount', 'updatedAt']

const THROWAWAY = {
  id: 'phase2-throwaway-delegate',
  email: 'phase2-throwaway-delegate@wbr.invalid',
  name: 'Phase 2 Throwaway Delegate',
  role: 'ATTENDEE',
}

const COMPLETE_PROFILE = {
  name: 'Phase 2 Throwaway Delegate',
  jobTitle: 'Head of eCommerce',
  company: 'Throwaway Co',
  companySize: 'MIDMARKET',
  annualRevenue: '10M-50M',
  solutionsSeeking: JSON.stringify(['AI & Automation']),
}

let passCount = 0
let failCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }
function step(title) { console.log(`\n${title}`) }

// ── plumbing ────────────────────────────────────────────────────────────────

function cookieName(base) {
  return base.startsWith('https://')
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'
}

async function signIn(app, email, password = PASSWORD) {
  const name = cookieName(app.base)
  const csrfRes = await fetch(`${app.base}/api/auth/csrf`)
  if (!csrfRes.ok) throw new Error(`GET ${app.base}/api/auth/csrf -> ${csrfRes.status}`)
  const { csrfToken } = await csrfRes.json()
  const csrfCookies = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

  const res = await fetch(`${app.base}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookies },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
    redirect: 'manual',
  })
  const raw = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith(`${name}=`))
  if (!raw) {
    throw new Error(
      `credentials sign-in for ${email} on ${app.label} did not set ${name} (HTTP ${res.status}). ` +
      'Check NEXTAUTH_SECRET, and that this role may sign in to this app.',
    )
  }
  return raw.split(';')[0].split('=').slice(1).join('=')
}

/**
 * Follow the whole redirect chain by hand, with a cap.
 *
 * Following it is the point: observing "307 to somewhere" and stopping there
 * reports a pass for a redirect that never arrives. The cap turns a loop into a
 * failure rather than a hang.
 */
async function followChain(app, cookie, path, cap = 6) {
  const name = cookieName(app.base)
  const hops = []
  let current = path
  for (let i = 0; i < cap; i++) {
    const res = await fetch(`${app.base}${current}`, {
      headers: { Cookie: `${name}=${cookie}` },
      redirect: 'manual',
    })
    if (res.status < 300 || res.status >= 400) {
      return { hops, finalPath: current, finalStatus: res.status, looped: false }
    }
    const loc = res.headers.get('location') ?? ''
    hops.push(`${current} -> ${res.status} ${loc}`)
    current = loc.startsWith('http') ? new URL(loc).pathname + new URL(loc).search : loc
  }
  return { hops, finalPath: current, finalStatus: null, looped: true }
}

async function saveProfile(app, cookie, body) {
  const res = await fetch(`${app.base}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `${cookieName(app.base)}=${cookie}` },
    body: JSON.stringify(body),
  })
  return res.status
}

// ── the database ─────────────────────────────────────────────────────────────

function openDb() {
  return new DatabaseSync(DB_PATH)
}

function snapshot(db, email) {
  const row = db.prepare(
    `SELECT ${SNAPSHOT_COLUMNS.join(', ')} FROM User WHERE email = ?`,
  ).get(email)
  if (!row) throw new Error(`no User row for ${email} — cannot snapshot`)
  return row
}

function restoreRow(db, email, snap) {
  db.prepare(
    `UPDATE User SET ${SNAPSHOT_COLUMNS.map(c => `${c} = ?`).join(', ')} WHERE email = ?`,
  ).run(...SNAPSHOT_COLUMNS.map(c => snap[c] ?? null), email)
}

/** The six required columns as a comparable string — the containment probe. */
function requiredSnapshot(db, email) {
  const row = db.prepare(
    `SELECT ${REQUIRED_COLUMNS.join(', ')} FROM User WHERE email = ?`,
  ).get(email)
  if (!row) throw new Error(`no User row for ${email}`)
  return JSON.stringify(Object.fromEntries(REQUIRED_COLUMNS.map(c => [c, row[c] ?? null])))
}

function readColumn(db, email, column) {
  const row = db.prepare(`SELECT ${column} AS value FROM User WHERE email = ?`).get(email)
  return row ? row.value : undefined
}

function setColumns(db, email, values) {
  const keys = Object.keys(values)
  db.prepare(
    `UPDATE User SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE email = ?`,
  ).run(...keys.map(k => values[k]), email)
}

async function createThrowaway(db) {
  // Reuse the app's own hasher, so the password is valid by construction rather
  // than by a copied hash that could go stale.
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  db.prepare('DELETE FROM User WHERE id = ? OR email = ?').run(THROWAWAY.id, THROWAWAY.email)
  db.prepare(`
    INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(THROWAWAY.id, THROWAWAY.email, THROWAWAY.name, THROWAWAY.role, hash)
  setColumns(db, THROWAWAY.email, COMPLETE_PROFILE)
}

function deleteThrowaway(db) {
  return db.prepare('DELETE FROM User WHERE id = ? OR email = ?')
    .run(THROWAWAY.id, THROWAWAY.email).changes
}

// ── the run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('Phase 2 — the gate demonstration account restores its own incompleteness')
  console.log(`database: ${DB_PATH}`)
  console.log(`participant application: ${ATTENDEE.base}`)
  console.log(`meetings portal:         ${MEETINGS.base}`)

  // ── Preflight A: refuse a deployment ───────────────────────────────────────
  step('Preflight A — this run writes, so it refuses anything but a local server')
  for (const app of [ATTENDEE, MEETINGS]) {
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(app.base)
    if (!isLocal) {
      console.log(`  ✗ ${app.label} is ${app.base}, which is not local`)
      console.log('    Every deployment of this project writes to the SHARED production database.')
      process.exit(1)
    }
    ok(`${app.label} is a local address`)
  }

  const db = openDb()
  const snapshots = {}
  let teardownClean = false

  try {
    for (const email of ALL_CANONICAL) snapshots[email] = snapshot(db, email)
    ok(`snapshotted ${ALL_CANONICAL.length} canonical accounts`)

    // ── Preflight B: the apps read THIS database ─────────────────────────────
    //
    // Asserted rather than assumed. A run whose server is pointed at a different
    // file would otherwise report the gate misbehaving when nothing is wrong.
    step('Preflight B — both applications read the database this script writes')
    await createThrowaway(db)
    for (const app of [ATTENDEE, MEETINGS]) {
      const completeCookie = await signIn(app, THROWAWAY.email)
      const whenComplete = await followChain(app, completeCookie, '/')
      const releasedWhenComplete = whenComplete.finalPath !== CHECKLIST && !whenComplete.looped

      setColumns(db, THROWAWAY.email, { solutionsSeeking: JSON.stringify([]) })
      const blockedCookie = await signIn(app, THROWAWAY.email)
      const whenBlocked = await followChain(app, blockedCookie, '/')
      const blockedWhenEmptied = whenBlocked.finalPath === CHECKLIST

      // Put it back complete for the next application's turn.
      setColumns(db, THROWAWAY.email, { solutionsSeeking: COMPLETE_PROFILE.solutionsSeeking })

      if (releasedWhenComplete && blockedWhenEmptied) {
        ok(`${app.label} reflects a change written straight to this database file`)
      } else {
        fail(
          `${app.label} did not reflect a database change — complete→released was ` +
          `${releasedWhenComplete}, emptied→blocked was ${blockedWhenEmptied}. ` +
          'Check DATABASE_URL in that app\'s .env.local.',
        )
      }
    }

    // ── AC-1 to AC-4: the restore, on both applications ─────────────────────
    for (const app of [ATTENDEE, MEETINGS]) {
      step(`AC-1 to AC-3 on the ${app.label} — the checklist returns after every sign-in`)

      // Start from the blocked state, however the previous run left it.
      setColumns(db, DEMO_EMAIL, { solutionsSeeking: JSON.stringify([]) })

      const first = await signIn(app, DEMO_EMAIL)
      const firstChain = await followChain(app, first, '/')
      if (firstChain.finalPath === CHECKLIST) ok('AC-1 signing in lands on the checklist')
      else fail(`AC-1 expected ${CHECKLIST}, ended on ${firstChain.finalPath} (${firstChain.hops.join(' | ') || 'no redirect'})`)

      const saveStatus = await saveProfile(app, first, app.completionBody)
      if (saveStatus === 200) ok('the checklist save is accepted')
      else fail(`the checklist save answered ${saveStatus}, expected 200`)

      const storedAfterSave = readColumn(db, DEMO_EMAIL, 'solutionsSeeking')
      if (storedAfterSave === COMPLETED_STORED) {
        ok('the completed value is in the database, read directly rather than from a screen')
      } else {
        fail(`expected the saved list in the database, found ${storedAfterSave}`)
      }

      const released = await followChain(app, first, '/')
      if (released.finalPath !== CHECKLIST && !released.looped) {
        ok('AC-2 the completed account is released into the application')
      } else {
        fail(`AC-2 still blocked after completing — ended on ${released.finalPath}`)
      }

      // ── AC-7, taken here because the session is open and complete ─────────
      // The restore must not run on the token callback. If it did, requests on
      // an open session would blank the field underneath it.
      //
      // Page requests ALONE are not enough to establish this. The meetings
      // portal's middleware decodes the token with getToken() and forwards
      // headers, which does not run the app's NextAuth callbacks — so a restore
      // wrongly placed in jwt() could be invisible to page requests on that app.
      // /api/auth/session goes through the session and jwt callbacks, so it is
      // requested explicitly here. Without it this check claims more than it
      // measures.
      for (let i = 0; i < 3; i++) {
        await followChain(app, first, '/')
        await fetch(`${app.base}/api/auth/session`, {
          headers: { Cookie: `${cookieName(app.base)}=${first}` },
        })
      }
      const stillComplete = readColumn(db, DEMO_EMAIL, 'solutionsSeeking')
      if (stillComplete === COMPLETED_STORED) {
        ok('AC-7 requests on an open session do not blank the field underneath it')
      } else {
        fail(`AC-7 the field changed to ${stillComplete} without a new sign-in — the restore is on the wrong callback`)
      }

      // ── AC-3: the phase ───────────────────────────────────────────────────
      // Signing out is dropping the cookie; a fresh sign-in is what must restore.
      const second = await signIn(app, DEMO_EMAIL)
      const restored = readColumn(db, DEMO_EMAIL, 'solutionsSeeking')
      if (restored === '[]') ok('AC-3 the next sign-in put the account back into its blocked state')
      else fail(`AC-3 expected [] after a fresh sign-in, found ${restored}`)

      const secondChain = await followChain(app, second, '/')
      if (secondChain.finalPath === CHECKLIST) ok('AC-3 and the checklist appears again')
      else fail(`AC-3 expected ${CHECKLIST} on the second sign-in, ended on ${secondChain.finalPath}`)

      // A third sign-in must write nothing new — it must not churn on every visit.
      const beforeThird = requiredSnapshot(db, DEMO_EMAIL)
      await signIn(app, DEMO_EMAIL)
      const afterThird = requiredSnapshot(db, DEMO_EMAIL)
      if (beforeThird === afterThird) ok('a further sign-in leaves the six fields unchanged')
      else fail(`a further sign-in changed the fields:\n      before ${beforeThird}\n      after  ${afterThird}`)
    }
    console.log('\n  (the two blocks above are AC-4: the same three checks on both applications)')

    // ── AC-5: CONTAINMENT ───────────────────────────────────────────────────
    step('AC-5 part 1 — the three accounts without the flag are untouched by signing in')
    for (const account of CONTAINMENT_ACCOUNTS) {
      const before = requiredSnapshot(db, account.email)
      await signIn(ATTENDEE, account.email)
      const after = requiredSnapshot(db, account.email)
      if (before === after) {
        ok(`${account.email} (${account.role}) — six required fields identical after sign-in`)
      } else {
        fail(`${account.email} CHANGED on sign-in:\n      before ${before}\n      after  ${after}`)
      }
    }

    // Part 1 alone has a weakness: if an account's stored values happen to equal
    // the values a leak would write, the comparison passes while the leak
    // happens. Part 2 removes that by giving one account a value no definition
    // holds, so a write cannot be mistaken for a no-op.
    step('AC-5 part 2 — with a value no definition holds, so a leak cannot look like a no-op')
    const DIVERGENT = JSON.stringify(['Returns Management'])
    const leakProbe = 'stephcurry@test.com'
    setColumns(db, leakProbe, { companySize: 'STARTUP', solutionsSeeking: DIVERGENT })

    const beforeLeak = requiredSnapshot(db, leakProbe)
    await signIn(ATTENDEE, leakProbe)
    const afterLeak = requiredSnapshot(db, leakProbe)

    if (readColumn(db, leakProbe, 'solutionsSeeking') === DIVERGENT) {
      ok(`${leakProbe} kept the distinctive value it was given, so no definition was written over it`)
    } else {
      fail(
        `${leakProbe} lost its distinctive value on sign-in — it now holds ` +
        `${readColumn(db, leakProbe, 'solutionsSeeking')}. The restore has reached an unflagged account.`,
      )
    }
    if (beforeLeak === afterLeak) ok(`${leakProbe} — all six fields identical with the distinctive value in place`)
    else fail(`${leakProbe} CHANGED:\n      before ${beforeLeak}\n      after  ${afterLeak}`)

    // ── AC-6: an unflagged account left deliberately incomplete ─────────────
    step('AC-6 — an unflagged account with an incomplete profile stays incomplete')
    const probe = 'stephcurry@test.com'
    setColumns(db, probe, { companySize: null, annualRevenue: null })
    const beforeIncomplete = requiredSnapshot(db, probe)
    await signIn(ATTENDEE, probe)
    const afterIncomplete = requiredSnapshot(db, probe)

    if (beforeIncomplete === afterIncomplete) {
      ok(`${probe} with two required fields emptied is not repaired by signing in`)
    } else {
      fail(`${probe} was repaired by signing in:\n      before ${beforeIncomplete}\n      after  ${afterIncomplete}`)
    }
    if (readColumn(db, probe, 'companySize') === null) ok('its emptied companySize is still empty')
    else fail('its emptied companySize was filled in')

    teardownClean = true
  } catch (err) {
    fail(`run error: ${err?.message ?? err}`)
  } finally {
    // ── Teardown, and a failed teardown fails the run ──────────────────────
    step('Teardown — every touched account is put back, and the restore is read back')
    let teardownFailures = 0

    try {
      for (const email of ALL_CANONICAL) {
        if (!snapshots[email]) continue
        restoreRow(db, email, snapshots[email])
      }
      for (const email of ALL_CANONICAL) {
        const snap = snapshots[email]
        if (!snap) continue
        const now = db.prepare(`SELECT ${SNAPSHOT_COLUMNS.join(', ')} FROM User WHERE email = ?`).get(email)
        const same = SNAPSHOT_COLUMNS.every(c => (now?.[c] ?? null) === (snap[c] ?? null))
        if (same) ok(`${email} — profile columns restored to their pre-run values`)
        else { fail(`${email} profile columns were NOT restored — check it by hand`); teardownFailures++ }
      }

      // Say plainly what this run changed and did not put back, rather than
      // letting "restored" be read as "the row is untouched".
      const changed = db.prepare(
        `SELECT email, ${UNRESTORED_COLUMNS.join(', ')} FROM User WHERE email IN (${ALL_CANONICAL.map(() => '?').join(',')})`,
      ).all(...ALL_CANONICAL)
      console.log(`  · not restored by design (${UNRESTORED_COLUMNS.join(', ')}) — this run signed in, and recordLogin() counts that:`)
      for (const row of changed) {
        console.log(`      ${row.email}: loginCount=${row.loginCount}`)
      }

      const demoNow = readColumn(db, DEMO_EMAIL, 'solutionsSeeking')
      if (demoNow === '[]') {
        ok('the demonstration account is back in its blocked state, ready to be shown')
      } else {
        fail(`the demonstration prop is NOT blocked — solutionsSeeking is ${demoNow}`)
        teardownFailures++
      }

      const removed = deleteThrowaway(db)
      if (removed >= 1) ok(`throwaway account removed (${removed} row)`)
      else { fail('throwaway account was not removed'); teardownFailures++ }
    } catch (err) {
      fail(`teardown error: ${err?.message ?? err}`)
      teardownFailures++
    } finally {
      db.close()
    }

    if (teardownFailures > 0 && teardownClean) {
      console.log('\n  A dirty teardown fails this run even though every assertion above passed.')
    }
  }

  console.log(`\n${passCount} passed, ${failCount} failed`)
  process.exitCode = failCount === 0 ? 0 : 1
}

main().catch(err => {
  console.error(`\n[fatal] ${err?.stack ?? err}`)
  process.exit(1)
})
