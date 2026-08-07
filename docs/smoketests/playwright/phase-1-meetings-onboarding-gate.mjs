#!/usr/bin/env node
/**
 * Phase 1 verification: the meetings portal enforces the onboarding gate.
 *
 * Every assertion below is a contract check per docs/smoketests/CONTRACT.md
 * §1.1 — a binary observable. A redirect happens or it does not; an address
 * answers 403 or it does not; a column holds a value or it does not. Nothing
 * here is environment-sensitive, so it is valid on a dev server as well as on a
 * local production build.
 *
 *   AC-1   A delegate with an incomplete profile signing in to the meetings
 *          portal lands on the checklist, which names the missing fields.
 *   AC-2   From that blocked state, every participant-facing data address
 *          refuses.
 *   AC-3   From that blocked state the profile-save address accepts, and saving
 *          the last missing field releases the person into the portal.
 *   AC-4   Both authenticated route groups are gated: the blocked person
 *          reaches neither the portal screens nor the staff screen.
 *   AC-5   A WBR-side account with a deliberately incomplete profile reaches
 *          every screen including the staff queue, and is refused at no data
 *          address.
 *   AC-6   The checklist route is reachable while blocked and does not redirect
 *          to itself.
 *   AC-7   No new role list. Asserted behaviourally: the exempt account used
 *          here holds STAFF, not ORGANIZER, so an exemption hand-written around
 *          the organizer demonstration account would fail this run. The
 *          structural half — that the code calls isWbrStaff() — is recorded with
 *          file references in the markdown beside this script, per the rule that
 *          a test must not assert a function name.
 *   AC-8   The gate reads the required set rather than a stored completed
 *          marker, so clearing a required field afterwards blocks again.
 *   AC-9   The profile-save address stores a name (UF-30).
 *   AC-10  A save that omits a field leaves that field as it was (UF-30).
 *
 * WHY THIS RUN CREATES ITS OWN ACCOUNTS. Two of the checks need an account in a
 * state no seeded row is in: a WBR-side person whose profile is incomplete, and
 * a delegate who is complete and can then be broken. Doing that to a canonical
 * demonstration login would leave it damaged if the run died half way — the
 * self-heal in packages/db/src/test-accounts.ts repairs password, role and
 * company link only, not profile fields. Both throwaways are deleted at the end,
 * and the one canonical account this run does touch — the deliberately
 * incomplete delegate — is snapshotted on start and restored on exit.
 *
 * Prerequisites:
 *   - Meetings portal reachable at MEETINGS_BASE_URL (default
 *     http://localhost:3002), serving THIS branch. Check what is actually on the
 *     port before trusting it:
 *       lsof -nP -iTCP:3002 -sTCP:LISTEN
 *     A process whose age is measured in days is not this run's server.
 *   - apps/meetings/.env.local with DATABASE_URL as an ABSOLUTE file: path and
 *     NEXTAUTH_SECRET set.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-1-meetings-onboarding-gate.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')

const BASE_URL = process.env.MEETINGS_BASE_URL ?? 'http://localhost:3002'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'
const PASSWORD = process.env.MEETINGS_PASSWORD ?? 'password123'

/** The canonical account held one field short on purpose. */
const DEMO_EMAIL = 'onboarding-demo@test.com'

const THROWAWAY_STAFF = {
  id: 'phase1-mtg-throwaway-staff',
  email: 'phase1-mtg-throwaway-staff@wbr.invalid',
  name: 'Phase 1 Throwaway Staff',
  role: 'STAFF',
}

const THROWAWAY_DELEGATE = {
  id: 'phase1-mtg-throwaway-delegate',
  email: 'phase1-mtg-throwaway-delegate@wbr.invalid',
  name: 'Phase 1 Throwaway Delegate',
  role: 'ATTENDEE',
}

/** Screens in the (portal) route group. */
const PORTAL_SCREENS = ['/', '/browse', '/meetings', '/requests', '/profile']
/** The second authenticated route group. */
const STAFF_SCREEN = '/staff'
/** The checklist, which sits outside both. */
const CHECKLIST = '/onboarding'

/**
 * The nine participant-facing data addresses, ten handlers.
 *
 * The two that change data are probed with a body that is refused for a reason
 * that is NOT completeness — no target, and nothing to update. That keeps the
 * observation binary (403 when blocked, 400 when released) while writing no row,
 * which matters because this run signs in as an exempt account too and an exempt
 * caller would otherwise create real meeting requests.
 */
// `released` is the EXACT status an admitted caller must get. Asserting "not
// 403" was not enough: a 500, a 401 or a redirect would all have been recorded
// as "not refused", so an address that was broken rather than open would have
// passed the exemption check. The two write probes answer 400 because their
// bodies are refused for a reason that is not completeness — which is also what
// proves the guard ran before the handler's own validation and not instead of it.
const DATA_ADDRESSES = [
  { method: 'GET', path: '/api/bootstrap', released: 200 },
  { method: 'GET', path: '/api/browse/people', released: 200 },
  { method: 'GET', path: '/api/browse/sponsors', released: 200 },
  { method: 'GET', path: '/api/browse/requests', released: 200 },
  { method: 'GET', path: '/api/dashboard', released: 200 },
  { method: 'GET', path: '/api/dashboard/recommendations', released: 200 },
  { method: 'GET', path: '/api/meetings', released: 200 },
  { method: 'GET', path: '/api/meeting-requests', released: 200 },
  { method: 'POST', path: '/api/meeting-requests', body: {}, released: 400 },
  { method: 'PATCH', path: '/api/meeting-requests/phase1-no-such-request', body: {}, released: 400 },
]

/**
 * Every address behind the meeting-engine console.
 *
 * All nine are probed in the revoked-role state, where `requireStaff()` refuses
 * before a handler reads its body — so a POST or PATCH here cannot write
 * anything, whatever it carries. Only the four GET addresses are probed in the
 * working state, for the opposite reason: a write probe that got past the check
 * would act on the event's real schedule.
 */
const STAFF_ADDRESSES = [
  { method: 'GET', path: '/api/staff/companies', readOnly: true },
  { method: 'GET', path: '/api/staff/companies/phase1-no-such-sponsor/availability', readOnly: true },
  { method: 'GET', path: '/api/staff/companies/phase1-no-such-sponsor/schedule', readOnly: true },
  { method: 'GET', path: '/api/staff/meetings/phase1-no-such-meeting/availability', readOnly: true },
  { method: 'POST', path: '/api/staff/meetings/assign', body: {} },
  { method: 'POST', path: '/api/staff/meetings/auto-schedule', body: {} },
  { method: 'POST', path: '/api/staff/meetings/phase1-no-such-meeting/cancel', body: {} },
  { method: 'PATCH', path: '/api/staff/meetings/phase1-no-such-meeting', body: {} },
  { method: 'PATCH', path: '/api/staff/requests/phase1-no-such-request', body: {} },
]

const REQUIRED_COLUMNS = ['name', 'jobTitle', 'company', 'companySize', 'annualRevenue', 'solutionsSeeking']

/** A complete delegate profile, for the account this run creates and then breaks. */
const COMPLETE_PROFILE = {
  name: THROWAWAY_DELEGATE.name,
  jobTitle: 'Head of eCommerce',
  company: 'Throwaway Co',
  companySize: 'MIDMARKET',
  annualRevenue: '10M-50M',
  solutionsSeeking: JSON.stringify(['Email Marketing']),
}

let passCount = 0
let failCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }
function step(title) { console.log(`\n${title}`) }

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
      `Check NEXTAUTH_SECRET, and that this role may sign in to this app.`,
    )
  }
  return raw.split(';')[0].split('=').slice(1).join('=')
}

/** One hop only — the redirect itself is the observation. */
async function rawGet(cookie, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    redirect: 'manual',
  })
  return { status: res.status, location: res.headers.get('location') }
}

/**
 * Follow the whole redirect chain by hand, with a cap.
 *
 * Following it is the point. A previous session's worst defect reported a pass
 * by observing "307 to /login" and never following it into an endless loop. The
 * cap turns a loop into a failure rather than a hang.
 */
async function followChain(cookie, path, cap = 6) {
  const hops = []
  let current = path
  for (let i = 0; i < cap; i++) {
    const res = await fetch(`${BASE_URL}${current}`, {
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
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

async function callAddress(cookie, { method, path, body }) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookie}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.status
}

async function saveProfile(cookie, body) {
  const res = await fetch(`${BASE_URL}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${cookie}` },
    body: JSON.stringify(body),
  })
  return res.status
}

async function getHtml(cookie, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    redirect: 'manual',
  })
  return { status: res.status, html: res.status === 200 ? await res.text() : '' }
}

// ── the database, for snapshot/restore and the throwaway accounts ────────────

function openDb() {
  return new DatabaseSync(DB_PATH)
}

function snapshot(db, email) {
  const row = db.prepare(
    `SELECT ${REQUIRED_COLUMNS.join(', ')}, solutionsOffering FROM User WHERE email = ?`,
  ).get(email)
  if (!row) throw new Error(`no User row for ${email} — cannot snapshot`)
  return row
}

function restore(db, email, snap) {
  const cols = [...REQUIRED_COLUMNS, 'solutionsOffering']
  db.prepare(
    `UPDATE User SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE email = ?`,
  ).run(...cols.map(c => snap[c] ?? null), email)
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

async function createAccount(db, account, profile) {
  // Reuse the scrypt hasher the app itself uses, so the password is valid by
  // construction rather than by a copied hash that could go stale.
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  db.prepare('DELETE FROM User WHERE id = ? OR email = ?').run(account.id, account.email)
  db.prepare(`
    INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(account.id, account.email, account.name, account.role, hash)
  if (profile) setColumns(db, account.email, profile)
}

function deleteAccount(db, account) {
  return db.prepare('DELETE FROM User WHERE id = ? OR email = ?')
    .run(account.id, account.email).changes
}

// ── the run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Phase 1 — meetings portal onboarding gate`)
  console.log(`Portal:   ${BASE_URL}`)
  console.log(`Database: ${DB_PATH}`)

  const db = openDb()
  const demoSnapshot = snapshot(db, DEMO_EMAIL)
  console.log(`Snapshotted ${DEMO_EMAIL}: solutionsSeeking=${JSON.stringify(demoSnapshot.solutionsSeeking)}`)

  try {
    // The demonstration account must start blocked, whatever an earlier
    // rehearsal left behind. Asserting the starting state rather than assuming
    // it: a completed profile here would make every "blocked" check below pass
    // for the wrong reason, or fail confusingly.
    setColumns(db, DEMO_EMAIL, { solutionsSeeking: JSON.stringify([]) })

    await createAccount(db, THROWAWAY_STAFF, null)     // no profile at all: incomplete by construction
    await createAccount(db, THROWAWAY_DELEGATE, COMPLETE_PROFILE)

    const demoCookie = await signIn(DEMO_EMAIL)
    const staffCookie = await signIn(THROWAWAY_STAFF.email)
    const delegateCookie = await signIn(THROWAWAY_DELEGATE.email)

    // ── AC-1, AC-6: the checklist is where a blocked delegate lands, and it
    //    does not redirect to itself ────────────────────────────────────────
    step('AC-1, AC-6 — the blocked delegate lands on the checklist, which is reachable')
    {
      const { status, html } = await getHtml(demoCookie, CHECKLIST)
      if (status === 200) ok(`GET ${CHECKLIST} answers 200 while blocked (it does not redirect to itself)`)
      else fail(`GET ${CHECKLIST} answers ${status} while blocked — expected 200`)

      if (html.includes('data-testid="onboarding-checklist"')) ok('the checklist screen renders')
      else fail('the checklist screen did not render')

      // The one field this account is short of, named by the shared policy.
      if (html.includes('data-testid="onboarding-missing-solutionsSeeking"')) {
        ok('the checklist names solutionsSeeking as missing')
      } else {
        fail('the checklist did not name solutionsSeeking as missing')
      }
      // And nothing else, because this account holds the other five.
      const otherFields = ['name', 'jobTitle', 'company', 'companySize', 'annualRevenue']
      const wronglyNamed = otherFields.filter(f => html.includes(`data-testid="onboarding-missing-${f}"`))
      if (wronglyNamed.length === 0) ok('the checklist names no field the account already holds')
      else fail(`the checklist wrongly names ${wronglyNamed.join(', ')} as missing`)
    }

    // ── AC-4: both route groups are gated ──────────────────────────────────
    step('AC-4 — both authenticated route groups turn the blocked delegate away')
    for (const screen of PORTAL_SCREENS) {
      const chain = await followChain(demoCookie, screen)
      if (chain.looped) {
        fail(`${screen} never settled — chain: ${chain.hops.join(' | ')}`)
      } else if (chain.finalPath === CHECKLIST && chain.finalStatus === 200) {
        ok(`${screen} ends at the checklist (200)`)
      } else {
        fail(`${screen} ended at ${chain.finalPath} (${chain.finalStatus}) — expected ${CHECKLIST} 200`)
      }
    }
    {
      const chain = await followChain(demoCookie, STAFF_SCREEN)
      if (chain.looped) {
        fail(`${STAFF_SCREEN} never settled — chain: ${chain.hops.join(' | ')}`)
      } else if (chain.finalPath === CHECKLIST && chain.finalStatus === 200) {
        ok(`${STAFF_SCREEN} ends at the checklist (200) — the second route group is gated`)
      } else {
        fail(`${STAFF_SCREEN} ended at ${chain.finalPath} (${chain.finalStatus}) — expected ${CHECKLIST} 200`)
      }
    }

    // ── AC-2: every data address refuses ───────────────────────────────────
    step('AC-2 — every participant-facing data address refuses the blocked delegate')
    for (const address of DATA_ADDRESSES) {
      const status = await callAddress(demoCookie, address)
      if (status === 403) ok(`${address.method} ${address.path} -> 403`)
      else fail(`${address.method} ${address.path} -> ${status} — expected 403`)
    }

    // ── AC-3: the save address accepts, and completing releases ────────────
    step('AC-3 — the profile-save address accepts while blocked, and the last field releases')
    {
      const status = await saveProfile(demoCookie, { solutionsSeeking: ['Email Marketing'] })
      if (status === 200) ok('PATCH /api/profile -> 200 while blocked')
      else fail(`PATCH /api/profile -> ${status} while blocked — expected 200`)

      const stored = readColumn(db, DEMO_EMAIL, 'solutionsSeeking')
      if (stored === JSON.stringify(['Email Marketing'])) ok('the value reached the database')
      else fail(`the database holds ${JSON.stringify(stored)} — expected ["Email Marketing"]`)

      const chain = await followChain(demoCookie, '/')
      if (chain.finalPath === '/' && chain.finalStatus === 200) ok('/ answers 200 — the account is released')
      else fail(`/ ended at ${chain.finalPath} (${chain.finalStatus}) — expected / 200`)

      // Every address, not one of them: releasing a person must open all of what
      // the gate closed, and a single sample would not notice one left refusing.
      for (const address of DATA_ADDRESSES) {
        const status = await callAddress(demoCookie, address)
        if (status === address.released) ok(`${address.method} ${address.path} -> ${status} once released`)
        else fail(`${address.method} ${address.path} -> ${status} once released — expected ${address.released}`)
      }

      // Back to blocked, so the account is a demonstration prop again and the
      // rest of this run starts from a known state.
      setColumns(db, DEMO_EMAIL, { solutionsSeeking: JSON.stringify([]) })
      const chainAgain = await followChain(demoCookie, '/')
      if (chainAgain.finalPath === CHECKLIST) ok('clearing the field blocks the same session again')
      else fail(`after clearing, / ended at ${chainAgain.finalPath} — expected ${CHECKLIST}`)
    }

    // ── AC-5, AC-7: a WBR-side account passes everywhere ───────────────────
    step('AC-5, AC-7 — a STAFF account with no profile at all reaches everything')
    for (const screen of [...PORTAL_SCREENS, STAFF_SCREEN]) {
      const { status, location } = await rawGet(staffCookie, screen)
      if (status === 200) ok(`${screen} answers 200 for the exempt account`)
      else fail(`${screen} answers ${status}${location ? ` -> ${location}` : ''} for the exempt account — expected 200`)
    }
    for (const address of DATA_ADDRESSES) {
      const status = await callAddress(staffCookie, address)
      if (status === address.released) ok(`${address.method} ${address.path} -> ${status}`)
      else fail(`${address.method} ${address.path} -> ${status} — expected ${address.released}`)
    }
    {
      const { status, location } = await rawGet(staffCookie, CHECKLIST)
      if (status >= 300 && status < 400 && (location ?? '').endsWith('/')) {
        ok('the checklist redirects the exempt account away rather than showing it a delegate form')
      } else {
        fail(`${CHECKLIST} answered ${status}${location ? ` -> ${location}` : ''} for the exempt account — expected a redirect to /`)
      }
    }

    // ── AC-8: the gate reads the set, not a stored marker ──────────────────
    step('AC-8 — the gate re-blocks when a required field is cleared afterwards')
    {
      const before = await followChain(delegateCookie, '/')
      if (before.finalPath === '/' && before.finalStatus === 200) ok('a complete delegate reaches the portal')
      else fail(`a complete delegate ended at ${before.finalPath} (${before.finalStatus}) — expected / 200`)

      setColumns(db, THROWAWAY_DELEGATE.email, { annualRevenue: null })
      const after = await followChain(delegateCookie, '/')
      if (after.finalPath === CHECKLIST) ok('clearing annualRevenue blocks the same account again')
      else fail(`after clearing annualRevenue, / ended at ${after.finalPath} — expected ${CHECKLIST}`)

      setColumns(db, THROWAWAY_DELEGATE.email, { annualRevenue: COMPLETE_PROFILE.annualRevenue })
    }

    // ── AC-9: the save address stores a name ───────────────────────────────
    step('AC-9 — the profile-save address stores a name (UF-30)')
    {
      const probeName = 'Phase 1 Probe Name'
      const status = await saveProfile(delegateCookie, { name: probeName })
      if (status === 200) ok('PATCH /api/profile with a name -> 200')
      else fail(`PATCH /api/profile with a name -> ${status} — expected 200`)

      const stored = readColumn(db, THROWAWAY_DELEGATE.email, 'name')
      if (stored === probeName) ok('the name reached the database')
      else fail(`the database holds ${JSON.stringify(stored)} — expected ${JSON.stringify(probeName)}`)
    }

    // ── AC-11: a revoked role is refused at once, not at next sign-in ──────
    step('AC-11 — the staff addresses and screen read the role from the database (UF-31)')
    {
      // The working-state probe is the one staff address that takes no
      // identifier and so has one right answer: 200. The others would need an
      // invented sponsor or meeting id, and "some status that is not a refusal"
      // is the kind of check that passes for a 500 — which is the weakness this
      // very run was reviewed for. They are probed below instead, in the revoked
      // state, where the right answer is exactly 403 for every one of them.
      const WORKING_PROBE = { method: 'GET', path: '/api/staff/companies' }

      const before = await callAddress(staffCookie, WORKING_PROBE)
      if (before === 200) ok(`${WORKING_PROBE.path} -> 200 for a real staff account`)
      else fail(`${WORKING_PROBE.path} -> ${before} for a real staff account — expected 200`)

      // Demote in the database while the session stays live, and give the
      // account a COMPLETE delegate profile at the same time. Completeness
      // matters: without it the onboarding gate would refuse this account and
      // the refusal below would prove nothing about the role check.
      setColumns(db, THROWAWAY_STAFF.email, { role: 'ATTENDEE', ...COMPLETE_PROFILE })

      // ALL NINE, not a sample. The claim is that the console's addresses read
      // the role from the database, and one address answering correctly says
      // nothing about the other eight — any of which could still be reading the
      // token, or could have been added later without the check at all.
      for (const address of STAFF_ADDRESSES) {
        const status = await callAddress(staffCookie, address)
        if (status === 403) ok(`${address.method} ${address.path} -> 403 once the role is revoked`)
        else fail(`${address.method} ${address.path} -> ${status} once the role is revoked — expected 403`)
      }

      // ── WHY THIS ONE NEEDS A BROWSER ──────────────────────────────────────
      //
      // The refusal on this screen comes from the PAGE, and the staff route has
      // a loading.tsx. That creates a suspense boundary, so the response starts
      // streaming before the page component finishes and the redirect is
      // delivered inside a 200 rather than as a 307. Measured both ways during
      // this phase: with loading.tsx present, GET /staff answers 200 for a
      // revoked account, carrying a NEXT_REDIRECT to /browse and none of the
      // console's content; with loading.tsx moved aside, the same request
      // answers 307 /browse.
      //
      // So an HTTP-level assertion here would report a screen "reached" that a
      // person never sees. A browser is the honest observer. Note the contrast
      // with the AC-4 assertions above, which are HTTP-level and correct: those
      // redirects come from a LAYOUT, which runs before the boundary exists.
      {
        const { chromium } = await import('playwright')
        const browser = await chromium.launch()
        try {
          const ctx = await browser.newContext()
          await ctx.addCookies([{
            name: COOKIE_NAME, value: staffCookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax',
          }])
          const page = await ctx.newPage()
          await page.goto(`${BASE_URL}${STAFF_SCREEN}`, { waitUntil: 'networkidle' })
          const landed = new URL(page.url()).pathname
          if (landed === '/browse') ok('/staff sends the revoked account to /browse on the same session')
          else fail(`/staff left the browser on ${landed} for the revoked account — expected /browse`)
        } finally {
          await browser.close()
        }
      }

      setColumns(db, THROWAWAY_STAFF.email, {
        role: 'STAFF', name: THROWAWAY_STAFF.name, jobTitle: null, company: null,
        companySize: null, annualRevenue: null, solutionsSeeking: null,
      })
      const restored = await callAddress(staffCookie, WORKING_PROBE)
      if (restored === 200) ok(`${WORKING_PROBE.path} -> 200 again once the role is restored`)
      else fail(`${WORKING_PROBE.path} -> ${restored} once the role is restored — expected 200`)
    }

    // ── AC-10: an omitted field is left alone ──────────────────────────────
    step('AC-10 — a save that omits a field does not empty it (UF-30)')
    {
      const offering = JSON.stringify(['Loyalty & Rewards'])
      setColumns(db, THROWAWAY_DELEGATE.email, { solutionsOffering: offering })

      // Exactly what the checklist sends: the six required fields, nothing else.
      const status = await saveProfile(delegateCookie, {
        name: COMPLETE_PROFILE.name,
        jobTitle: COMPLETE_PROFILE.jobTitle,
        company: COMPLETE_PROFILE.company,
        companySize: COMPLETE_PROFILE.companySize,
        annualRevenue: COMPLETE_PROFILE.annualRevenue,
        solutionsSeeking: ['Email Marketing'],
      })
      if (status === 200) ok('a checklist-shaped save -> 200')
      else fail(`a checklist-shaped save -> ${status} — expected 200`)

      const after = readColumn(db, THROWAWAY_DELEGATE.email, 'solutionsOffering')
      if (after === offering) ok('solutionsOffering survived a save that did not mention it')
      else fail(`solutionsOffering is now ${JSON.stringify(after)} — expected ${offering}`)
    }

    // ── AC-13: the one open address refuses what it cannot store ───────────
    step('AC-13 — the save address refuses malformed bodies rather than answering 500 or a hollow 200 (UF-33)')
    {
      const raw = async (payload) => {
        const res = await fetch(`${BASE_URL}/api/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_NAME}=${delegateCookie}` },
          body: payload,
        })
        return res.status
      }

      for (const [label, payload] of [
        ['a JSON null', 'null'],
        ['a bare number', '12'],
        ['a bare string', '"hello"'],
        ['an array', '[1,2,3]'],
        ['unparseable text', 'not json at all'],
      ]) {
        const status = await raw(payload)
        if (status === 400) ok(`${label} -> 400`)
        else fail(`${label} -> ${status} — expected 400`)
      }

      // Stored as sent, this answers 200 while the gate goes on reporting the
      // field missing — a save that appears to work and releases nobody.
      const listStatus = await saveProfile(delegateCookie, { solutionsSeeking: [123] })
      if (listStatus === 400) ok('a solutions list holding a number -> 400')
      else fail(`a solutions list holding a number -> ${listStatus} — expected 400`)

      const overlong = await saveProfile(delegateCookie, { company: 'x'.repeat(1001) })
      if (overlong === 400) ok('a 1001-character company -> 400')
      else fail(`a 1001-character company -> ${overlong} — expected 400`)

      // And the round trip still works for a well-formed body, so none of the
      // refusals above is refusing everything.
      const good = await saveProfile(delegateCookie, { company: COMPLETE_PROFILE.company })
      if (good === 200) ok('a well-formed body still answers 200')
      else fail(`a well-formed body -> ${good} — expected 200`)
    }

    // ── AC-12: emptying a required field on the profile screen re-blocks ────
    //
    // The only check here that needs a real browser. The defect is a screen
    // staying usable after the person made themselves incomplete, and the fix
    // is a client-side refresh — neither is observable from a plain request.
    step('AC-12 — emptying a required field on the profile screen sends the person to the checklist (UF-32)')
    {
      setColumns(db, THROWAWAY_DELEGATE.email, COMPLETE_PROFILE)
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const ctx = await browser.newContext()
        await ctx.addCookies([{
          name: COOKIE_NAME, value: delegateCookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax',
        }])
        const page = await ctx.newPage()

        await page.goto(`${BASE_URL}/profile`, { waitUntil: 'networkidle' })
        if (new URL(page.url()).pathname === '/profile') ok('a complete delegate opens /profile')
        else fail(`/profile landed on ${new URL(page.url()).pathname} for a complete delegate`)

        // Company is a required field, and a text box is a steadier target than
        // a chip with no test marker on it.
        //
        // WAIT FOR THE FIELD TO STAY EMPTY BEFORE PRESSING SAVE. This is a form
        // whose state lives in React, and filling a box before hydration
        // finishes writes into the DOM only — React then re-renders from its own
        // state and the typing is silently discarded, so the save sends the
        // ORIGINAL value and the assertion fails for a reason that has nothing
        // to do with the gate. That happened here: the check passed until eight
        // requests were added ahead of it and the timing changed. Polling the
        // field's value removes the race rather than hiding it behind a pause.
        const companyBox = page.getByPlaceholder('Your company name')
        await companyBox.waitFor({ state: 'visible' })
        let emptied = false
        for (let i = 0; i < 25; i++) {
          await companyBox.fill('')
          if ((await companyBox.inputValue()) === '') {
            await page.waitForTimeout(200)
            if ((await companyBox.inputValue()) === '') { emptied = true; break }
          }
          await page.waitForTimeout(200)
        }
        if (emptied) ok('the company box is empty and stays empty, so the form state took the change')
        else fail('the company box would not stay empty — the form never took the change')

        await page.getByRole('button', { name: 'Save All Changes' }).click()

        try {
          await page.waitForURL(url => new URL(url).pathname === CHECKLIST, { timeout: 15_000 })
          ok('the screen moves to the checklist after the save, with no manual reload')
        } catch {
          fail(`the browser stayed on ${new URL(page.url()).pathname} after emptying a required field`)
        }

        const stored = readColumn(db, THROWAWAY_DELEGATE.email, 'company')
        if (stored === null || stored === '') ok('the emptied field reached the database')
        else fail(`company is still ${JSON.stringify(stored)} — the save did not land`)

        // The checklist is where this person now is. Its three text boxes must
        // not accept a value the save address will refuse for length (UF-33).
        const limits = await page.evaluate(() =>
          ['name', 'jobTitle', 'company'].map(k => {
            const el = document.querySelector(`[data-testid="onboarding-input-${k}"]`)
            return [k, el ? el.getAttribute('maxlength') : 'no such box']
          }),
        )
        const wrong = limits.filter(([, v]) => v !== '1000')
        if (wrong.length === 0) ok('all three checklist text boxes stop at 1000 characters')
        else fail(`checklist boxes with the wrong limit: ${wrong.map(([k, v]) => `${k}=${v}`).join(', ')}`)
      } finally {
        await browser.close()
      }
    }
  } finally {
    step('Cleanup')
    restore(db, DEMO_EMAIL, demoSnapshot)
    const restored = readColumn(db, DEMO_EMAIL, 'solutionsSeeking')
    console.log(`  restored ${DEMO_EMAIL}: solutionsSeeking=${JSON.stringify(restored)}`)
    console.log(`  deleted throwaway staff rows: ${deleteAccount(db, THROWAWAY_STAFF)}`)
    console.log(`  deleted throwaway delegate rows: ${deleteAccount(db, THROWAWAY_DELEGATE)}`)
    db.close()
  }

  console.log(`\n${passCount} passed, ${failCount} failed`)
  process.exit(failCount === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('\nRUN FAILED:', err.message)
  process.exit(1)
})
