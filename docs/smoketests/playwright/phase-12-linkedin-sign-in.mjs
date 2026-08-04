#!/usr/bin/env node
/**
 * Phase 12 verification: "Sign in with LinkedIn" on the participant app.
 *
 * Contract checks per docs/smoketests/CONTRACT.md §1.1 — every criterion below
 * is a binary observable: a provider is registered or it is not, a button is on
 * screen or it is not, a redirect carries a parameter or it does not, a field
 * holds a value or it is empty.
 *
 * NAME CLASH, STATED SO IT IS NOT MISTAKEN FOR A DUPLICATE. This directory
 * already holds phase-12a-sponsor-ai-intro.mjs and phase-12b-ai-controls.mjs
 * from the June sprint. They are unrelated work that happens to share a phase
 * number with this one. Nothing here supersedes them.
 *
 * ── What is covered, and what is deliberately not ───────────────────────────
 *
 *   AC-1a  With the credentials set, the LinkedIn provider is registered and the
 *          button is on the login screen.
 *   AC-1b  Pressing it builds a correct authorization redirect: LinkedIn's own
 *          authorization address, scope "openid profile email", response_type
 *          code, the return address this app owns, a state value, and no PKCE
 *          challenge (LinkedIn offers none).
 *   AC-1c  A person carrying a name and photo sees both on the checklist.
 *   AC-2   After a name-and-photo pre-fill, job title and company are still
 *          empty, still listed as outstanding, and the gate still holds the
 *          person on the checklist.
 *   AC-3a  With the credentials blank, the provider is absent and the button is
 *          not drawn.
 *   AC-3b  With the credentials blank, email-and-password sign-in still reaches
 *          the app, and the Google button is still drawn.
 *   AC-3c  With the credentials blank, initiating a LinkedIn sign-in does not
 *          redirect to LinkedIn.
 *   F-25   A LinkedIn arrival with no email address is refused, and the login
 *          screen names the cause.
 *   F-26   The rules module's own branches, including the ones a browser cannot
 *          reach.
 *
 * NOT COVERED, AND NOT CLAIMED — READ THIS BEFORE CITING A PASS AS EVIDENCE.
 *
 * NO assertion in this file executes apps/attendee/lib/auth.ts. Completing a real
 * LinkedIn sign-in requires typing an account password, which this project's rules
 * forbid, so nothing here drives LinkedIn's token exchange, its userinfo reply, or
 * the sign-in callback itself.
 *
 * What that leaves unmeasured, named individually rather than as a caveat:
 *   - that the callback refuses an arrival with no email address (F-25)
 *   - that it refuses an unverified address at an existing row (F-27)
 *   - that it writes nothing on any refusing path (F-28)
 *   - that it creates a row, joins a row, records a login, or attaches the role
 *     and company link to the session
 *
 * The C group asserts the RULES those behaviours are built from — the decision
 * functions in lib/linkedin-identity.ts — and the D group asserts what the screen
 * does with a person already carrying a name and photo. Those are **rule-level
 * surrogates**, not callback evidence. The callback is covered by the named human
 * step in docs/smoketests/phase-12-linkedin-sign-in.md and by nothing here.
 *
 * A pass is evidence about the assertions listed above and about nothing else.
 *
 * ── Prerequisites ───────────────────────────────────────────────────────────
 *
 *   - Nothing else listening on the port (default 3001). This script starts and
 *     stops the app itself, twice, because the third criterion is about a
 *     configuration difference and a run that cannot change the configuration
 *     cannot measure it.
 *   - A production build present: pnpm exec turbo build --filter=attendee
 *   - apps/attendee/.env.local carrying DATABASE_URL, NEXTAUTH_SECRET,
 *     NEXTAUTH_URL, and both LINKEDIN_ values. The blank-credentials half of the
 *     run overrides the two LinkedIn values with empty strings; it does not edit
 *     the file.
 *   - The canonical demo attendee (stephcurry@test.com / password123).
 *   - Playwright + chromium installed.
 *
 * THE LOCAL DATABASE ONLY. This script writes to the person row it borrows and
 * restores it afterwards. Point it at a deployed app and those writes land in
 * the production database, which previews share. It refuses a base address that
 * is not localhost for that reason.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-12-linkedin-sign-in.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../..')
const APP_DIR = join(REPO, 'apps/attendee')
const DB_PATH = join(REPO, 'packages/db/prisma/dev.db')
const RULES = join(APP_DIR, 'lib/linkedin-identity.ts')

const PORT = Number(process.env.ATTENDEE_PORT ?? 3001)
const BASE_URL = `http://localhost:${PORT}`
const EMAIL = process.env.ATTENDEE_EMAIL ?? 'stephcurry@test.com'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'
const COOKIE_NAME = 'next-auth.session-token'

/** LinkedIn's own sample userinfo reply, copied from its documentation page so
 *  the rules are checked against the shape LinkedIn publishes rather than one
 *  invented here. */
const LINKEDIN_SAMPLE = {
  sub: '782bbtaQ',
  name: 'Jordan Vale',
  given_name: 'Jordan',
  family_name: 'Vale',
  picture: 'https://media.licdn-ei.com/dms/image/C5F03AQHqK8v7tB1HCQ/profile-displayphoto-shrink_100_100/0/',
  locale: 'en-US',
  email: 'Jordan.Vale@Example.com',
  email_verified: true,
}

let passCount = 0
let failCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }
function section(title) { console.log(`\n${title}\n${'─'.repeat(title.length)}`) }

function eq(actual, expected, msg) {
  if (actual === expected) ok(msg)
  else fail(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

/**
 * Readers that answer `null` for an element that is not there, instead of
 * throwing.
 *
 * This matters for more than tidiness. A negative control breaks one behaviour
 * and requires the suite to go red by a predicted number of assertions. If
 * removing an element makes the script throw instead, the run ends early with a
 * fatal error and NO counted failures — the control cannot be scored, and the
 * assertions after it never run at all. Phase 13 recorded controls that silently
 * stopped applying; this is the same class of fault reached from the other side.
 */
async function attrOf(locator, name) {
  if ((await locator.count()) === 0) return null
  return await locator.first().getAttribute(name)
}
async function valueOf(locator) {
  if ((await locator.count()) === 0) return null
  return await locator.first().inputValue()
}
async function textOf(locator) {
  if ((await locator.count()) === 0) return null
  return (await locator.first().innerText()).trim()
}
async function visible(locator) {
  if ((await locator.count()) === 0) return false
  return await locator.first().isVisible()
}
/** Wait up to `ms` for `check()` to hold. Returns whether it did, rather than
 *  throwing, so a broken behaviour is a counted failure. */
async function waitUntil(check, ms) {
  const deadline = Date.now() + ms
  for (;;) {
    if (await check()) return true
    if (Date.now() > deadline) return false
    await new Promise(r => setTimeout(r, 200))
  }
}

/**
 * Non-throwing versions of the four remaining shapes that could abort a run.
 *
 * Round 2 of the review found these: a waitForSelector timeout, `new URL()` on an
 * empty redirect, a provider-list fetch against a server that answered badly, and
 * `innerText()` on a body that never loaded. Each of them ends the process with no
 * counted failure, which means a negative control breaking that behaviour cannot
 * be scored and every assertion after it never runs.
 */
async function present(page, selector, ms = 15_000) {
  return await waitUntil(async () => (await page.locator(selector).count()) > 0, ms)
}
async function bodyText(page) {
  try {
    return await page.locator('body').innerText()
  } catch {
    return ''
  }
}
async function jsonAt(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
/** Parse a URL, or null. Used so a missing redirect is a failing assertion rather
 *  than a thrown TypeError. */
function parseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

// ── the app, started and stopped by this script ─────────────────────────────

/**
 * Start `next start` on PORT with the given extra environment, and wait until it
 * answers. Returns a handle whose stop() resolves once the port is free again.
 *
 * The two LinkedIn variables are always set explicitly — to their real values or
 * to empty strings — so the configuration under test never depends on what
 * happens to be in the environment file. A run that inherited them would report
 * whichever state the machine was already in.
 */
async function startApp(label, linkedInCredentials) {
  const env = {
    ...process.env,
    PORT: String(PORT),
    NEXTAUTH_URL: BASE_URL,
    LINKEDIN_CLIENT_ID: linkedInCredentials.id,
    LINKEDIN_CLIENT_SECRET: linkedInCredentials.secret,
  }
  const child = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: APP_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  let exited = false
  child.stdout.on('data', d => { log += d.toString() })
  child.stderr.on('data', d => { log += d.toString() })
  child.on('exit', () => { exited = true })

  const deadline = Date.now() + 60_000
  for (;;) {
    // THE CHILD MUST BE THE THING ANSWERING. Without this, a child that dies of
    // "address already in use" leaves the PREVIOUS configuration answering on the
    // port, and the run happily probes it — which would make the on/off
    // comparison the phase exists to prove into two probes of one server.
    if (exited) {
      throw new Error(
        `[${label}] the app process exited before it answered. This usually means the port ` +
        `was still held. Output:\n${log}`,
      )
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL')
      throw new Error(`[${label}] app did not answer within 60s. Output:\n${log}`)
    }
    try {
      const res = await fetch(`${BASE_URL}/login`, { redirect: 'manual' })
      if (res.status < 500) break
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 500))
  }

  // NO PROVIDER PRECONDITION HERE, AND THE REASON IS WORTH THE SPACE.
  //
  // The first version of this fix checked the provider list on startup and ended
  // the run if it did not match the configuration this group asked for. That check
  // cannot tell the two situations apart: "a stale server is answering" and "the
  // code registers the provider when it should not". The second is a product
  // defect, and it is exactly what negative control NC-2 breaks on purpose — so
  // the check would have aborted that control's run with no counted failures,
  // making it unscoreable and reporting a real defect as a harness problem.
  //
  // Cross-configuration contamination is instead closed by two checks that cannot
  // be confused with app behaviour: the child exiting before it answers (above),
  // and stop() refusing to return while the port is still answering (below). What
  // the provider list says is then a measurement, asserted as A1 and B1.

  return {
    label,
    log: () => log,
    async stop() {
      child.kill('SIGTERM')
      const gone = Date.now() + 15_000
      for (;;) {
        if (Date.now() > gone) { child.kill('SIGKILL'); break }
        if (child.exitCode !== null || child.signalCode !== null) break
        await new Promise(r => setTimeout(r, 200))
      }
      // The socket must actually free. Giving up quietly here is what allowed the
      // next start to race a dying server; now it ends the run instead.
      const free = Date.now() + 20_000
      for (;;) {
        if (await portFree()) return
        if (Date.now() > free) {
          throw new Error(
            `[${label}] port ${PORT} is still answering 20s after the app was stopped. ` +
            `Refusing to start the next configuration against it.`,
          )
        }
        await new Promise(r => setTimeout(r, 250))
      }
    },
  }
}

async function portFree() {
  try {
    await fetch(`${BASE_URL}/login`, { redirect: 'manual' })
    return false
  } catch {
    return true
  }
}

/**
 * Read `NAME="value"` lines out of an environment file.
 *
 * Used only to find the LinkedIn credentials so the configured half of the run
 * uses the real ones rather than stand-ins. Nothing read here is printed. The
 * file is never written to.
 */
function readEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

async function portInUse() {
  return !(await portFree())
}

// ── the borrowed person ─────────────────────────────────────────────────────

function db() {
  if (!existsSync(DB_PATH)) throw new Error(`local database not found at ${DB_PATH}`)
  return new DatabaseSync(DB_PATH)
}

const BORROWED_COLUMNS = ['name', 'image', 'jobTitle', 'company', 'companySize', 'annualRevenue', 'solutionsSeeking']

function readPerson() {
  const conn = db()
  try {
    const row = conn
      .prepare(`SELECT ${BORROWED_COLUMNS.map(c => `"${c}"`).join(', ')} FROM User WHERE email = ?`)
      .get(EMAIL)
    if (!row) throw new Error(`${EMAIL} not found in ${DB_PATH}`)
    return row
  } finally {
    conn.close()
  }
}

function writePerson(values) {
  const conn = db()
  try {
    const cols = Object.keys(values)
    conn
      .prepare(`UPDATE User SET ${cols.map(c => `"${c}" = ?`).join(', ')} WHERE email = ?`)
      .run(...cols.map(c => values[c]), EMAIL)
  } finally {
    conn.close()
  }
}

async function signInWithPassword() {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  if (!csrfRes.ok) throw new Error(`GET /api/auth/csrf -> ${csrfRes.status}`)
  const { csrfToken } = await csrfRes.json()
  const cookies = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, json: 'true' }),
    redirect: 'manual',
  })
  const raw = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) throw new Error(`credentials sign-in did not set ${COOKIE_NAME} (HTTP ${res.status})`)
  return raw.split(';')[0].split('=').slice(1).join('=')
}

/** Ask the app to start a LinkedIn sign-in and hand back the redirect it built,
 *  without following it. Nothing is sent to LinkedIn. */
async function initiateLinkedIn() {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  const cookies = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
  const res = await fetch(`${BASE_URL}/api/auth/signin/linkedin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${BASE_URL}/home` }),
    redirect: 'manual',
  })
  return { status: res.status, location: res.headers.get('location') ?? '' }
}

// ── the run ─────────────────────────────────────────────────────────────────

async function main() {
  if (!BASE_URL.startsWith('http://localhost')) {
    throw new Error('This script writes to a person row. It runs against localhost only.')
  }
  if (!existsSync(join(APP_DIR, '.next/BUILD_ID'))) {
    throw new Error('No build found. Run: pnpm exec turbo build --filter=attendee')
  }
  if (await portInUse()) {
    throw new Error(
      `Something is already listening on ${BASE_URL}. This script starts the app itself in two ` +
      `configurations; stop the existing server first.`,
    )
  }

  const rules = await import(RULES)
  const original = readPerson()
  let app = null
  const browser = await chromium.launch()

  try {
    // ── Group C: the rules, checked directly ────────────────────────────────
    section('C. The rules module, checked without a browser')

    const identity = rules.linkedInIdentity(LINKEDIN_SAMPLE)
    eq(identity.id, '782bbtaQ', 'C1 identity keeps LinkedIn\'s subject identifier')
    eq(identity.name, 'Jordan Vale', 'C2 identity takes the full name when LinkedIn sends one')
    eq(identity.email, 'jordan.vale@example.com', 'C3 identity lowercases the email address')
    eq(identity.image, LINKEDIN_SAMPLE.picture, 'C4 identity keeps the picture address unchanged')

    const noName = rules.linkedInIdentity({ ...LINKEDIN_SAMPLE, name: undefined })
    eq(noName.name, 'Jordan Vale', 'C5 name is assembled from the two parts when the full name is absent')

    const firstOnly = rules.linkedInIdentity({ sub: 'x', given_name: 'Jordan' })
    eq(firstOnly.name, 'Jordan', 'C6 a first name alone is accepted rather than discarded')

    const blankName = rules.linkedInIdentity({ sub: 'x', name: '   ' })
    eq(blankName.name, null, 'C7 a whitespace-only name counts as no name')

    eq(rules.linkedInIdentity({ name: 'No Subject' }), null, 'C8 a reply with no subject identifier is rejected')

    const noEmail = rules.linkedInIdentity({ ...LINKEDIN_SAMPLE, email: undefined, email_verified: undefined })
    eq(noEmail.email, null, 'C9 LinkedIn omitting the email leaves it null rather than undefined (F-25)')
    eq(noEmail.name, 'Jordan Vale', 'C10 the rest of the reply survives a missing email')

    const unverified = rules.linkedInIdentity({ ...LINKEDIN_SAMPLE, email_verified: false })
    eq(unverified.email, 'jordan.vale@example.com', 'C11 an unverified email is accepted, as the other sign-in paths do')

    // the pre-fill rule
    const ontoBlank = rules.prefillFields({ name: null, image: null }, { name: 'Jordan Vale', image: 'pic' })
    eq(JSON.stringify(ontoBlank), JSON.stringify({ name: 'Jordan Vale', image: 'pic' }), 'C12 both fields written onto a blank person')

    const ontoFilled = rules.prefillFields({ name: 'Edited Name', image: 'own.png' }, { name: 'Jordan Vale', image: 'pic' })
    eq(JSON.stringify(ontoFilled), '{}', 'C13 nothing written over a person who has both already')

    const ontoEmptyString = rules.prefillFields({ name: '', image: '   ' }, { name: 'Jordan Vale', image: 'pic' })
    eq(JSON.stringify(ontoEmptyString), JSON.stringify({ name: 'Jordan Vale', image: 'pic' }), 'C14 the empty string and whitespace count as blank (the F-22 mistake)')

    const halfFilled = rules.prefillFields({ name: 'Edited Name', image: null }, { name: 'Jordan Vale', image: 'pic' })
    eq(JSON.stringify(halfFilled), JSON.stringify({ image: 'pic' }), 'C15 only the blank half is written')

    const nothingIncoming = rules.prefillFields({ name: null, image: null }, { name: null, image: null })
    eq(JSON.stringify(nothingIncoming), '{}', 'C16 nothing to write when LinkedIn supplied neither')

    // configured-ness
    eq(rules.isLinkedInConfigured({ LINKEDIN_CLIENT_ID: 'a', LINKEDIN_CLIENT_SECRET: 'b' }), true, 'C17 both set counts as configured')
    eq(rules.isLinkedInConfigured({ LINKEDIN_CLIENT_ID: 'a' }), false, 'C18 identifier alone is not configured')
    eq(rules.isLinkedInConfigured({ LINKEDIN_CLIENT_SECRET: 'b' }), false, 'C19 secret alone is not configured')
    eq(rules.isLinkedInConfigured({ LINKEDIN_CLIENT_ID: '', LINKEDIN_CLIENT_SECRET: '' }), false, 'C20 empty strings are not configured')
    eq(rules.isLinkedInConfigured({ LINKEDIN_CLIENT_ID: '  ', LINKEDIN_CLIENT_SECRET: '  ' }), false, 'C21 whitespace is not configured')
    eq(rules.isLinkedInConfigured({}), false, 'C22 nothing set is not configured')

    // the refusal decision (F-25)
    const refused = rules.linkedInSignInDecision({ email: null })
    eq(refused.allowed, false, 'C23 no email address is refused')
    eq(refused.redirectTo, '/login?error=LinkedInNoEmail', 'C24 the refusal names the cause in the address')
    eq(rules.linkedInSignInDecision(null).allowed, false, 'C25 an unreadable reply is refused')
    eq(rules.linkedInSignInDecision({ email: '   ' }).allowed, false, 'C26 a whitespace email is refused')
    const allowed = rules.linkedInSignInDecision({ email: '  Jordan.Vale@Example.com ' })
    eq(allowed.allowed, true, 'C27 an email address is allowed')
    eq(allowed.email, 'jordan.vale@example.com', 'C28 the allowed address is trimmed and lowercased')

    // F-27 — whether LinkedIn vouched for the address, and which account that
    // permits. The four cases are asserted individually, because the rule's whole
    // content is that they differ.
    /**
     * F-29. THESE ASSERTIONS WERE WRONG AND A REAL SIGN-IN PROVED IT.
     *
     * LinkedIn's documentation types email_verified as Boolean. LinkedIn sends the
     * STRING "true" — measured from the sign-in callback on 2026-08-04. C37 used
     * to assert that the string was NOT a verification claim, which pinned a defect
     * in place: the check read a real verification as none, and the binding rule
     * then refused every returning delegate.
     *
     * Both shapes are now accepted and the truthiness of the value is NOT what is
     * checked, because the string "false" is truthy — see C37c.
     */
    eq(rules.linkedInEmailVerified(LINKEDIN_SAMPLE), true, 'C34 the boolean true is a verification claim')
    eq(rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: false }), false, 'C35 the boolean false is not')
    eq(rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: undefined }), false, 'C36 an omitted claim is not')
    eq(rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: 'true' }), true, 'C37 the string "true" IS a verification claim — this is what LinkedIn actually sends (F-29)')
    eq(rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: ' TRUE ' }), true, 'C37a padding and capitals in that string are tolerated')
    eq(rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: 'false' }), false, 'C37b the string "false" is NOT a verification claim')
    eq(rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: 'FALSE' }), false, 'C37c nor is it in capitals — and it is TRUTHY, which is why truthiness is not what is checked')
    eq(rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: 'yes' }), false, 'C37d nor is any other string LinkedIn does not document')
    eq(rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: 1 }), false, 'C38 the number 1 is not a verification claim')
    eq(rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: null }), false, 'C38a nor is null')

    // The returning-delegate journey F-29 broke, as one sequence: a real LinkedIn
    // reply, a row that already exists, and a sign-in that must be allowed.
    const returning = rules.linkedInAction({
      email: 'a@b.com',
      emailVerified: rules.linkedInEmailVerified({ ...LINKEDIN_SAMPLE, email_verified: 'true' }),
      existing: { role: 'ATTENDEE', name: 'Their Own Edit', image: 'their-own.png' },
      incoming: { name: 'From LinkedIn', image: 'from-linkedin.png' },
      roleAdmitted: () => true,
    })
    eq(returning.kind, 'join', 'C38b a returning delegate whose LinkedIn sends the string "true" is admitted, not refused (F-29)')
    eq(JSON.stringify(returning.update), '{}', 'C38c and their own edits are left alone')

    const joinVerified = rules.linkedInBindingDecision({ emailVerified: true, personExists: true })
    eq(joinVerified.allowed, true, 'C39 a verified address may join an account that exists')
    eq(joinVerified.mode, 'join', 'C40 and does so by joining rather than creating')

    const createVerified = rules.linkedInBindingDecision({ emailVerified: true, personExists: false })
    eq(createVerified.allowed, true, 'C41 a verified address with no account creates one')
    eq(createVerified.mode, 'create', 'C42 and does so by creating')

    const createUnverified = rules.linkedInBindingDecision({ emailVerified: false, personExists: false })
    eq(createUnverified.allowed, true, 'C43 an UNVERIFIED address with no account may still create one')
    eq(createUnverified.mode, 'create', 'C44 and gains nothing but its own new row')

    const joinUnverified = rules.linkedInBindingDecision({ emailVerified: false, personExists: true })
    eq(joinUnverified.allowed, false, 'C45 an UNVERIFIED address may NOT join an account that exists (F-27)')
    eq(joinUnverified.redirectTo, '/login?error=LinkedInUnverifiedEmail', 'C46 that refusal names its own cause, distinct from the no-email one')

    // F-28 — the whole action, decided in one place. The property being asserted
    // is that a REFUSING outcome carries no write: not that two statements sit in
    // a particular order, which nothing could observe, but that the value handed
    // back to the caller contains nothing to write.
    const admits = role => ['ATTENDEE', 'BRAND', 'SPEAKER', 'ORGANIZER', 'ADMIN', 'STAFF'].includes(role)
    const refusesAll = () => false
    const filled = { name: 'From LinkedIn', image: 'from-linkedin.png' }

    const noAddress = rules.linkedInAction({
      email: null, emailVerified: true, existing: null, incoming: filled, roleAdmitted: admits,
    })
    eq(noAddress.kind, 'refuse', 'C47 no address refuses')
    eq(noAddress.redirectTo, '/login?error=LinkedInNoEmail', 'C48 and names that cause')
    eq('update' in noAddress || 'email' in noAddress, false, 'C49 and carries nothing to write')

    const unverifiedJoin = rules.linkedInAction({
      email: 'a@b.com', emailVerified: false,
      existing: { role: 'ORGANIZER', name: null, image: null },
      incoming: filled, roleAdmitted: admits,
    })
    eq(unverifiedJoin.kind, 'refuse', 'C50 an unverified address at an ORGANIZER row refuses (F-27)')
    eq(unverifiedJoin.redirectTo, '/login?error=LinkedInUnverifiedEmail', 'C51 and names that cause')
    eq('update' in unverifiedJoin, false, 'C52 and carries nothing to write, so the organizer row is untouched')

    // The F-28 case exactly: a role this app does not admit, a row with blank
    // fields, and values arriving that would have filled them.
    const roleRefused = rules.linkedInAction({
      email: 'a@b.com', emailVerified: true,
      existing: { role: 'SPONSOR', name: null, image: null },
      incoming: filled, roleAdmitted: admits,
    })
    eq(roleRefused.kind, 'refuse', 'C53 a role this app does not admit refuses')
    eq(roleRefused.redirectTo, null, 'C54 with no cause named, which produces the generic refusal')
    eq('update' in roleRefused, false, 'C55 AND CARRIES NOTHING TO WRITE — the row is not filled on the way out (F-28)')

    const joinBlank = rules.linkedInAction({
      email: 'a@b.com', emailVerified: true,
      existing: { role: 'ATTENDEE', name: null, image: null },
      incoming: filled, roleAdmitted: admits,
    })
    eq(joinBlank.kind, 'join', 'C56 an admitted role with blank fields joins')
    eq(JSON.stringify(joinBlank.update), JSON.stringify({ name: 'From LinkedIn', image: 'from-linkedin.png' }), 'C57 and writes both blank fields')

    const joinFilled = rules.linkedInAction({
      email: 'a@b.com', emailVerified: true,
      existing: { role: 'ATTENDEE', name: 'Their Own Edit', image: 'their-own.png' },
      incoming: filled, roleAdmitted: admits,
    })
    eq(JSON.stringify(joinFilled.update), '{}', 'C58 and writes nothing over fields the person filled in')

    const createsNew = rules.linkedInAction({
      email: '  A@B.com ', emailVerified: false, existing: null, incoming: filled, roleAdmitted: admits,
    })
    eq(createsNew.kind, 'create', 'C59 an unverified address with no row still creates one')
    eq(createsNew.email, 'a@b.com', 'C60 under the trimmed, lowercased address')

    // Order matters between the refusals: a reply with no address and an
    // unadmitted row must report the address, not the role, because the address is
    // the thing the person can act on.
    const bothWrong = rules.linkedInAction({
      email: null, emailVerified: false,
      existing: { role: 'SPONSOR', name: null, image: null },
      incoming: filled, roleAdmitted: refusesAll,
    })
    eq(bothWrong.redirectTo, '/login?error=LinkedInNoEmail', 'C61 the missing address is reported ahead of the role')

    // A role set that admits nobody must still refuse rather than write.
    const nothingAdmitted = rules.linkedInAction({
      email: 'a@b.com', emailVerified: true,
      existing: { role: 'ATTENDEE', name: null, image: null },
      incoming: filled, roleAdmitted: refusesAll,
    })
    eq(nothingAdmitted.kind, 'refuse', 'C62 an admitted-set that refuses everything refuses, rather than writing')

    /**
     * PINNED VALUES, NOT LIVE CORRECTNESS. Stated plainly because the first
     * wording of these five claimed they "match the live discovery document" and
     * they do not check that: they compare a constant in this file to a constant
     * in the module. Nothing here reads LinkedIn.
     *
     * They are still worth their place, and the reason is specific: one of them,
     * C31, is what went red when a negative control reverted the member-details
     * address to the retired /v2/me — the exact mistake the library's own provider
     * makes and the one a future edit is most likely to reintroduce. They are
     * tripwires on five values that were verified once, by hand, against
     *   curl -s https://www.linkedin.com/oauth/.well-known/openid-configuration
     * on 2026-08-04, with the output recorded in the smoketest document. Fetching
     * that document from here would make the suite fail when LinkedIn is
     * unreachable, which the contract forbids for a contract check.
     */
    eq(rules.LINKEDIN_AUTHORIZATION, 'https://www.linkedin.com/oauth/v2/authorization', 'C29 authorization address is unchanged from the value verified on 2026-08-04')
    eq(rules.LINKEDIN_TOKEN, 'https://www.linkedin.com/oauth/v2/accessToken', 'C30 token address is unchanged from the value verified on 2026-08-04')
    eq(rules.LINKEDIN_USERINFO, 'https://api.linkedin.com/v2/userinfo', 'C31 member-details address is still the OpenID Connect one, not the retired /v2/me')
    eq(rules.LINKEDIN_ISSUER, 'https://www.linkedin.com/oauth', 'C32 issuer is still the live document\'s value, not the documentation page\'s')
    eq(rules.LINKEDIN_SCOPES, 'openid profile email', 'C33 scopes are still the three Open Permissions')

    // ── Group A: credentials set ────────────────────────────────────────────
    section('A. With the credentials set')

    const fromFile = readEnvFile(join(APP_DIR, '.env.local'))
    const realId = process.env.LINKEDIN_CLIENT_ID ?? fromFile.LINKEDIN_CLIENT_ID ?? ''
    const realSecret = process.env.LINKEDIN_CLIENT_SECRET ?? fromFile.LINKEDIN_CLIENT_SECRET ?? ''
    // Values from the environment file are loaded by the app itself; this run
    // only needs them non-blank so the provider registers. A stand-in is used
    // when the real ones are absent from this shell, and the run says so.
    const usingStandIn = realId.trim() === '' || realSecret.trim() === ''
    if (usingStandIn) {
      console.log('  [note] LINKEDIN_CLIENT_ID/SECRET not in this shell; using stand-in values.')
      console.log('         The redirect assertions still hold — they do not contact LinkedIn.')
    }
    app = await startApp('configured', {
      id: usingStandIn ? 'stand-in-client-id' : realId,
      secret: usingStandIn ? 'stand-in-client-secret' : realSecret,
    })

    const providersOn = (await jsonAt(`${BASE_URL}/api/auth/providers`)) ?? {}
    eq('linkedin' in providersOn, true, 'A1 the LinkedIn provider is registered')
    eq(providersOn.linkedin?.callbackUrl, `${BASE_URL}/api/auth/callback/linkedin`, 'A2 its return address is this app\'s own callback path (that LinkedIn has this address registered is not checked here — it cannot be, from outside LinkedIn)')
    eq('google' in providersOn, true, 'A3 Google is still registered')
    eq('credentials' in providersOn, true, 'A4 email and password are still registered')

    const redirect = await initiateLinkedIn()
    eq(redirect.status, 302, 'A5 starting a LinkedIn sign-in answers with a redirect')
    const target = parseUrl(redirect.location) ?? new URL('http://unparsed.invalid/')
    eq(target.hostname !== 'unparsed.invalid', true, 'A5a the redirect it answered with is a usable address')
    eq(`${target.origin}${target.pathname}`, 'https://www.linkedin.com/oauth/v2/authorization', 'A6 it points at LinkedIn\'s authorization address')
    eq(target.searchParams.get('scope'), 'openid profile email', 'A7 it asks for the three scopes')
    eq(target.searchParams.get('response_type'), 'code', 'A8 it asks for an authorization code')
    eq(target.searchParams.get('redirect_uri'), `${BASE_URL}/api/auth/callback/linkedin`, 'A9 it names this app\'s return address')
    eq((target.searchParams.get('state') ?? '').length > 16, true, 'A10 it carries a state value')
    eq(target.searchParams.has('code_challenge'), false, 'A11 it sends no PKCE challenge, which LinkedIn does not offer')
    eq((target.searchParams.get('client_id') ?? '').length > 0, true, `A12 it carries a client identifier${usingStandIn ? ' (STAND-IN value this run — that it is the real application\'s identifier is NOT established)' : ''}`)

    // the button, in a real browser
    const pageOn = await browser.newPage()
    await pageOn.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    const appearedAt = Date.now()
    const shown = await waitUntil(() => visible(pageOn.locator('[data-testid="signin-linkedin"]')), 15_000)
    const appearMs = Date.now() - appearedAt
    eq(shown, true, `A13 the LinkedIn button is on the login screen (settled after ${appearMs} ms)`)
    eq(await textOf(pageOn.locator('[data-testid="signin-linkedin"]')), 'Sign in with LinkedIn', 'A14 it reads "Sign in with LinkedIn"')
    eq(await visible(pageOn.locator('[data-testid="signin-google"]')), true, 'A15 the Google button is there too')
    await pageOn.close()

    // ── Group D: the pre-fill, as seen on the checklist ─────────────────────
    section('D. A pre-filled name and photo on the checklist')

    // The state a LinkedIn sign-in leaves behind: a name and a photo, and
    // nothing else. Everything the gate requires beyond those is cleared, which
    // is exactly the situation the second criterion is about.
    const PREFILLED_NAME = 'Jordan Vale'
    const PREFILLED_IMAGE = 'https://media.licdn-ei.com/dms/image/phase12-check/'
    writePerson({
      name: PREFILLED_NAME,
      image: PREFILLED_IMAGE,
      jobTitle: null,
      company: null,
      companySize: null,
      annualRevenue: null,
      solutionsSeeking: null,
    })

    const cookie = await signInWithPassword()
    const ctx = await browser.newContext()
    await ctx.addCookies([{ name: COOKIE_NAME, value: cookie, domain: 'localhost', path: '/' }])
    const page = await ctx.newPage()

    // The gate must send an incomplete person to the checklist from any section.
    const homeRes = await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' })
    eq(parseUrl(page.url())?.pathname, '/onboarding', 'D1 the gate still holds a name-and-photo-only person on the checklist')
    eq(homeRes.status() < 400, true, 'D2 that redirect is a normal response, not an error')

    eq(await present(page, '[data-testid="onboarding-checklist"]'), true, 'D2a the checklist renders')
    eq(await visible(page.locator('[data-testid="onboarding-photo-image"]')), true, 'D3 the photo is shown at the top of the checklist')
    eq(await attrOf(page.locator('[data-testid="onboarding-photo-image"]'), 'src'), PREFILLED_IMAGE, 'D4 it is the photo the sign-in supplied')
    eq(await page.locator('[data-testid="onboarding-photo-initials"]').count(), 0, 'D5 the initials stand-in is not drawn beside a real photo')
    eq(await valueOf(page.locator('[data-testid="onboarding-input-name"]')), PREFILLED_NAME, 'D6 the name field is pre-filled')

    // Criterion 2: the two LinkedIn cannot supply are still demanded.
    eq(await valueOf(page.locator('[data-testid="onboarding-input-jobTitle"]')), '', 'D7 job title is still empty')
    eq(await valueOf(page.locator('[data-testid="onboarding-input-company"]')), '', 'D8 company is still empty')
    eq(await page.locator('[data-testid="onboarding-missing-jobTitle"]').count(), 1, 'D9 job title is listed as still needed')
    eq(await page.locator('[data-testid="onboarding-missing-company"]').count(), 1, 'D10 company is listed as still needed')
    eq(await page.locator('[data-testid="onboarding-missing-name"]').count(), 0, 'D11 the pre-filled name is NOT listed as still needed')

    // The stand-in, when there is no photo. Asserted in the same run so the two
    // branches are shown to be exclusive rather than assumed to be.
    writePerson({ image: null })
    await page.reload({ waitUntil: 'domcontentloaded' })
    eq(await present(page, '[data-testid="onboarding-checklist"]'), true, 'D11a the checklist renders again after the photo is cleared')
    eq(await visible(page.locator('[data-testid="onboarding-photo-initials"]')), true, 'D12 the initials stand-in is drawn when there is no photo')
    eq(await page.locator('[data-testid="onboarding-photo-image"]').count(), 0, 'D13 no photo element is drawn beside the stand-in')
    eq(await textOf(page.locator('[data-testid="onboarding-photo-initials"]')), 'JV', 'D14 the stand-in shows the initials of the pre-filled name')

    // ── Group E: the refusal message (F-25) ─────────────────────────────────
    section('E. The refusal a LinkedIn sign-in with no email produces')

    const plain = await browser.newPage()
    await plain.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    eq(await present(plain, '[data-testid="signin-google"]'), true, 'E0 the login screen renders')
    const cleanText = await bodyText(plain)
    eq(cleanText.includes("LinkedIn didn't share an email address"), false, 'E1 a plain login screen shows no refusal message')

    await plain.goto(`${BASE_URL}/login?error=LinkedInNoEmail`, { waitUntil: 'domcontentloaded' })
    const named = await waitUntil(
      async () => (await bodyText(plain)).includes("LinkedIn didn't share an email address"),
      15_000,
    )
    eq(named, true, 'E2 the refusal marker produces a sentence naming the cause')
    const errText = await bodyText(plain)
    eq(errText.includes('Use your email and password, or Google.'), true, 'E3 it says what to do instead')

    await plain.goto(`${BASE_URL}/login?error=LinkedInUnverifiedEmail`, { waitUntil: 'domcontentloaded' })
    const unverifiedNamed = await waitUntil(
      async () => (await bodyText(plain)).includes("LinkedIn hasn't confirmed that email address"),
      15_000,
    )
    eq(unverifiedNamed, true, 'E5 the unverified-address refusal produces its own sentence (F-27)')
    const unverifiedText = await bodyText(plain)
    eq(unverifiedText.includes("didn't share an email address"), false, 'E6 it is not the no-email message wearing a different marker')
    // Deliberately asserted: the message must not confirm whether an account
    // exists for that address, since it is shown to whoever pressed the button.
    eq(/already (has|have) an account|account exists|registered/i.test(unverifiedText), false, 'E7 it does not disclose whether an account exists for that address')

    await plain.goto(`${BASE_URL}/login?error=NotAMarkerWeKnow`, { waitUntil: 'domcontentloaded' })
    eq(await present(plain, '[data-testid="signin-google"]'), true, 'E3a the login screen renders with an unrecognised marker')
    const unknownText = await bodyText(plain)
    eq(unknownText.includes("LinkedIn didn't share an email address"), false, 'E4 an unrecognised marker does not produce the LinkedIn message')
    await plain.close()

    await ctx.close()
    await app.stop()
    app = null

    // ── Group B: credentials blank ──────────────────────────────────────────
    section('B. With the credentials blank')

    // B8 needs an incomplete person, and it used to get one by accident: group D
     // had blanked the required fields earlier in the run. That made the result
     // depend on group order without saying so, and B8 would have passed for the
     // wrong reason — or failed — if B ran first. Set the state B needs explicitly.
    writePerson({
      name: 'Jordan Vale',
      image: null,
      jobTitle: null,
      company: null,
      companySize: null,
      annualRevenue: null,
      solutionsSeeking: null,
    })

    app = await startApp('blank', { id: '', secret: '' })

    const providersOff = (await jsonAt(`${BASE_URL}/api/auth/providers`)) ?? {}
    eq('linkedin' in providersOff, false, 'B1 the LinkedIn provider is not registered')
    eq('google' in providersOff, true, 'B2 Google is still registered')
    eq('credentials' in providersOff, true, 'B3 email and password are still registered')

    const blocked = await initiateLinkedIn()
    eq(blocked.location.startsWith('https://www.linkedin.com'), false, 'B4 starting a LinkedIn sign-in does not reach LinkedIn')

    const pageOff = await browser.newPage()

    /**
     * WAIT FOR THE CAUSE, NOT FOR A DURATION.
     *
     * The button is absent until the page's own request for the provider list comes
     * back. An earlier version of B5 waited four times as long as the button had
     * taken to appear in the OTHER server configuration and then concluded absence.
     * That is not sound and the review said so: a slower or failed provider request
     * on this page would produce the same "no button" the fix is supposed to
     * produce, so the assertion could pass while measuring nothing.
     *
     * So the listener is attached BEFORE navigating, and the run waits for that
     * exact response, reads it, and only then looks for the button. Absence now
     * means "the page asked, was told LinkedIn is not registered, and drew
     * nothing" rather than "nothing had happened yet".
     */
    const providersReply = pageOff
      .waitForResponse(r => r.url().includes('/api/auth/providers'), { timeout: 20_000 })
      .catch(() => null)
    await pageOff.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    const reply = await providersReply
    eq(reply !== null, true, 'B4a the login screen asks the server which providers are registered')
    const replyBody = reply ? await reply.json().catch(() => null) : null
    eq(replyBody !== null && !('linkedin' in replyBody), true, 'B4b and is told LinkedIn is not among them')
    // Wait long enough that absence means absence. The button took `appearMs` to
    // appear in the configured run; this waits several times that, and at least
    // three seconds, before concluding it is not coming. Without this the
    // assertion would pass on a page that simply had not finished loading —
    // which is the same result the button starts in.
    await waitUntil(() => visible(pageOff.locator('[data-testid="signin-google"]')), 15_000)
    // One further settle after the reply, so the render that follows it has run.
    // Small and bounded, and it is no longer what the conclusion rests on.
    await pageOff.waitForTimeout(500)
    eq(await pageOff.locator('[data-testid="signin-linkedin"]').count(), 0, 'B5 the LinkedIn button is not drawn, after the provider reply saying so has arrived')
    eq(await visible(pageOff.locator('[data-testid="signin-google"]')), true, 'B6 the Google button IS drawn at that same moment, so the screen and the selector both work')

    // Email and password still completes onboarding.
    const loginStatus = await (async () => {
      try {
        const r = await pageOff.request.post(`${BASE_URL}/api/login`, { data: { email: EMAIL, password: PASSWORD } })
        return r.status()
      } catch (err) {
        return `threw: ${err?.message ?? err}`
      }
    })()
    eq(loginStatus, 200, 'B7 email-and-password sign-in still succeeds')
    await pageOff.close()

    const cookieOff = await signInWithPassword()
    const ctxOff = await browser.newContext()
    await ctxOff.addCookies([{ name: COOKIE_NAME, value: cookieOff, domain: 'localhost', path: '/' }])
    const appOff = await ctxOff.newPage()
    await appOff.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' })
    eq(parseUrl(appOff.url())?.pathname, '/onboarding', 'B8 the gate still routes an incomplete person to the checklist with no social login configured')
    await ctxOff.close()
  } finally {
    await browser.close().catch(() => {})
    if (app) await app.stop().catch(() => {})
    /**
     * A FAILED RESTORE IS A FAILING RUN.
     *
     * This printed a warning and let the run exit 0. That is the worst available
     * outcome: the borrowed account is one of the three demo accounts printed on
     * the login screen, so leaving it blanked breaks a demonstration while the
     * suite reports success. It now counts a failure, and it prints the exact
     * values needed to put the row back by hand, because a restore that failed
     * once will not necessarily succeed on a retry.
     *
     * Still true and not fixed here: a crash between the blanking write and this
     * block leaves the row blanked. Removing that entirely means borrowing a
     * throwaway account rather than a demo one, which needs a password hash and is
     * recorded as a residual instead.
     */
    try {
      writePerson(original)
      const after = readPerson()
      const drifted = BORROWED_COLUMNS.filter(c => after[c] !== original[c])
      if (drifted.length === 0) {
        console.log(`\n  ${EMAIL} restored to its pre-run values`)
      } else {
        fail(`${EMAIL} did NOT restore cleanly — these columns differ: ${drifted.join(', ')}`)
        console.log(`  restore by hand with these values:\n${JSON.stringify(original, null, 2)}`)
      }
    } catch (err) {
      fail(`could not restore ${EMAIL}: ${err?.message ?? err}`)
      console.log(`  restore by hand with these values:\n${JSON.stringify(original, null, 2)}`)
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
