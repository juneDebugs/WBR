#!/usr/bin/env node
/**
 * Phase 7 — INDEPENDENT BROWSER CHECK. A third opinion on the fetch-based suite.
 *
 * WHY THIS EXISTS SEPARATELY. phase-7-no-company-explanation.mjs proves its
 * claims by fetching HTML and matching strings in it. That cannot see:
 *
 *   - whether the page hydrates, or throws in the browser
 *   - whether the text is actually VISIBLE to a person, or present in the markup
 *     but zero-height, transparent, clipped, or behind something
 *   - whether a client-side redirect moves the reader somewhere else after paint
 *   - whether the checklist form appears only after hydration
 *
 * Phase 5 in this repository passed 68 of 68 while the sponsor checklist could
 * not be submitted in a browser at all. That is this exact gap.
 *
 * IT ALSO SIGNS IN DIFFERENTLY, ON PURPOSE. The fetch suite posts to NextAuth's
 * credentials callback directly. This one fills in the real login form and
 * presses the real button, so the two share no sign-in code path. If the form
 * were broken while the address behind it worked, only this one would notice.
 *
 * Fixture: one SPONSOR account with sponsorId NULL, created and removed by this
 * script. Nothing seeded is touched. If the run is killed part-way, the exact
 * cleanup statement is printed on startup.
 *
 * IT MUST BE RUN FROM INSIDE THE REPOSITORY. Node cannot resolve `playwright`
 * from the scratchpad, which sits outside it.
 *
 * Prerequisites: sponsor app on http://localhost:3003, a production build.
 * Usage: node docs/smoketests/playwright/phase-7-browser-check.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE = process.env.SPONSOR_BASE_URL ?? 'http://localhost:3003'
const EMAIL = 'phase7browser-unlinked@wbr.invalid'
const FIXTURE_ID = 'phase7browser-unlinked'
const PASSWORD = process.env.SPONSOR_PASSWORD ?? 'password123'
const SHOTS = process.env.PHASE7_SHOT_DIR ?? '/tmp/phase7-shots'
const CLEANUP_SQL = `DELETE FROM User WHERE id LIKE 'phase7browser-%' OR email LIKE 'phase7browser-%'`

let pass = 0, fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = m => { fail++; console.log(`  ✗ ${m}`) }
const yes = (c, m) => c ? ok(m) : no(m)

mkdirSync(SHOTS, { recursive: true })

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA busy_timeout = 5000')

console.log(`If this run is killed part-way, clean up with:\n  ${CLEANUP_SQL};\n`)

// The fixture is created here rather than assumed, so this script is runnable
// on its own. Same disposable-account pattern as the other suites, and the same
// scrypt hasher the app itself uses, so the password is valid by construction.
{
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  db.prepare(CLEANUP_SQL).run()
  db.prepare(`INSERT INTO User (id, email, name, role, password, sponsorId, createdAt, updatedAt)
              VALUES (?, ?, ?, 'SPONSOR', ?, NULL, datetime('now'), datetime('now'))`)
    .run(FIXTURE_ID, EMAIL, 'Phase 7 Browser Fixture', hash)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

// EVERYTHING THE BROWSER COMPLAINS ABOUT IS COLLECTED. A page that renders the
// right text while throwing during hydration is not a working screen, and the
// fetch suite cannot tell the difference.
const consoleErrors = []
const pageErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', e => pageErrors.push(e.message))

console.log('Phase 7 — independent browser check')
console.log(`  ${BASE}   fixture ${EMAIL}\n`)

try {
  // ── 1. sign in through the REAL form ──────────────────────────────────────
  console.log('1. Sign in through the app\'s own login form')
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })

  const emailBox = page.locator('input[type="email"], input[name="email"]').first()
  const passBox = page.locator('input[type="password"], input[name="password"]').first()
  yes(await emailBox.isVisible(), 'the login form is on screen and its email box is visible')

  await emailBox.fill(EMAIL)
  await passBox.fill(PASSWORD)
  await page.locator('button[type="submit"], button:has-text("Sign in")').first().click()

  // WAIT FOR THE NAVIGATION TO FINISH, NOT FOR THE NETWORK TO GO QUIET.
  //
  // The first version of this script read page.url() straight after
  // networkidle and recorded /login, then two assertions later found the panel
  // rendered at its full size — because Playwright's count() does not wait
  // while boundingBox() does. Four assertions failed against an app that was
  // working: a race in the check, not a defect in the product. Waiting for the
  // URL explicitly is what removes it. Recorded rather than quietly corrected,
  // because a flaky check that fails on good code is as useless as one that
  // passes on bad code.
  // WAIT FOR WHERE THEY COME TO REST, not for the first URL that is not /login.
  //
  // The app sends every successful sign-in to /dashboard, and the gate then
  // moves an unlinked representative on to /onboarding. A second version of this
  // assertion read the URL at the intermediate hop, recorded /dashboard, and
  // failed against an app that was behaving exactly as designed.
  //
  // THE INTERMEDIATE HOP WAS THEN CHECKED RATHER THAN WAVED THROUGH, because
  // "the URL was briefly /dashboard" is worth knowing: measured by hand with
  // curl, GET /dashboard answers 307 to /onboarding and its body is Next.js's
  // redirect envelope. It carries no portal content and no other company's data
  // — the only identifiers in it are the caller's own, with sponsorId null.
  // Asserted below so it stays true.
  await page.waitForURL('**/onboarding', { timeout: 15000 }).catch(() => {})
  const landed = new URL(page.url()).pathname
  yes(landed !== '/login', 'the sign-in succeeded and left the login page')
  yes(landed === '/onboarding', `and comes to rest on the explanation, not the portal (${landed})`)
  await page.screenshot({ path: `${SHOTS}/01-after-signin.png`, fullPage: true })

  // ── 2. the panel is VISIBLE, not merely present ───────────────────────────
  console.log('\n2. The explanation is actually visible to a person')
  const panel = page.locator('[data-testid="sponsor-onboarding-no-company"]')
  await panel.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  yes(await panel.count() === 1, 'the explanation panel is in the document exactly once')
  yes(await panel.isVisible(), 'and it is VISIBLE — not zero-height, hidden or clipped')

  const box = await panel.boundingBox()
  yes(box !== null && box.width > 100 && box.height > 40,
    `it occupies real space on screen (${box ? Math.round(box.width) + '×' + Math.round(box.height) : 'no box'})`)

  // innerText, not innerHTML: this is what a person can actually read. It
  // excludes markup, attributes, and anything display:none.
  const seen = (await panel.innerText()).replace(/\s+/g, ' ').trim()
  console.log(`     the reader sees: "${seen}"`)
  yes(/organi[sz]er/i.test(seen), 'the visible text names the organizer')
  yes(/contact[^.]{0,80}organi[sz]er/i.test(seen), 'and tells the reader to contact them — the next step, in visible text')

  // ── 3. no checklist, and no form at all ───────────────────────────────────
  console.log('\n3. No form the reader could fill in and fail to save')
  yes(await page.locator('[data-testid="sponsor-onboarding-checklist"]').count() === 0, 'the checklist container is absent from the rendered DOM')
  yes(await page.locator('form').count() === 0, 'there is no form element on the page at all')
  yes(await page.locator('input:visible, textarea:visible').count() === 0, 'and no visible input or textarea')

  // ── 4. it stays put ───────────────────────────────────────────────────────
  console.log('\n4. It stays on the explanation after hydration settles')
  await page.waitForTimeout(2500)
  yes(new URL(page.url()).pathname === '/onboarding', `still on the explanation 2.5s after load (${new URL(page.url()).pathname})`)
  yes(await panel.isVisible(), 'and the panel is still visible')

  // ── 5. the portal is genuinely unreachable by typing the address ──────────
  console.log('\n5. Typing a portal address directly does not get them in')
  for (const path of ['/dashboard', '/browse', '/meetings', '/submissions', '/profile']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    const at = new URL(page.url()).pathname
    yes(at === '/onboarding', `${path} → ${at}`)
  }
  await page.screenshot({ path: `${SHOTS}/02-portal-blocked.png`, fullPage: true })

  // ── 5b. the redirect itself discloses nothing ─────────────────────────────
  //
  // The reader's address bar passes through /dashboard on the way to the
  // explanation. That hop must not carry portal content. Checked against the
  // raw response rather than the rendered page, because the rendered page is
  // already the explanation by the time anything can look at it.
  console.log('\n5b. The redirect through /dashboard carries no portal content')
  {
    const cookies = await ctx.cookies()
    const jar = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    const res = await fetch(`${BASE}/dashboard`, { headers: { Cookie: jar }, redirect: 'manual' })
    const body = await res.text()
    yes(res.status === 307 || res.status === 302, `the server redirects rather than rendering (${res.status})`)
    yes(!/Buyer Directory|annualRevenue|contactEmail/i.test(body), 'the redirect body carries no company or buyer data')
    yes(!/"sponsorId":"[^"]+"/.test(body), 'and no company identifier — the caller\'s own sponsorId is null, which is all it holds')
  }

  // ── 6. the browser itself had no complaints ───────────────────────────────
  console.log('\n6. The browser reported no errors')
  yes(pageErrors.length === 0, `no uncaught page errors (${pageErrors.length})`)
  if (pageErrors.length) pageErrors.slice(0, 5).forEach(e => console.log(`       ${e}`))

  // Next.js dev/prod both log a 403 fetch as a console error in some paths; the
  // ones that matter are hydration failures, so those are named explicitly.
  const hydration = consoleErrors.filter(e => /hydrat|Minified React error|Text content does not match/i.test(e))
  yes(hydration.length === 0, `no hydration errors (${hydration.length})`)
  if (hydration.length) hydration.slice(0, 5).forEach(e => console.log(`       ${e}`))
  if (consoleErrors.length) {
    console.log(`     (${consoleErrors.length} other console error(s), listed for the record:)`)
    consoleErrors.slice(0, 6).forEach(e => console.log(`       ${e.slice(0, 160)}`))
  }
} catch (err) {
  no(`the run threw: ${err.message}`)
} finally {
  await browser.close()
}

// ── cleanup, counted rather than assumed ────────────────────────────────────
console.log('\n7. Nothing this run made is left, and nothing seeded was touched')
{
  db.prepare(CLEANUP_SQL).run()
  const left = db.prepare(`SELECT COUNT(*) AS n FROM User WHERE id LIKE 'phase7browser-%' OR email LIKE 'phase7browser-%'`).get().n
  yes(left === 0, `the fixture account is gone (${left} left)`)
  const seeded = db.prepare(`SELECT COUNT(*) AS n FROM User WHERE email IN ('wbr@test.com','sponsor@test.com','stephcurry@test.com','onboarding-demo@test.com')`).get().n
  yes(seeded === 4, `the four canonical demonstration accounts are still present (${seeded})`)
}

console.log(`\n${'─'.repeat(66)}`)
console.log(`Browser check: ${pass} passed, ${fail} failed`)
console.log(`Screenshots in ${SHOTS}`)
process.exit(fail > 0 ? 1 : 0)
