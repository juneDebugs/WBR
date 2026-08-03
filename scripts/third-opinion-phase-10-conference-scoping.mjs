#!/usr/bin/env node
/**
 * Third opinion on Phase 10 findings 1 and 7 — conference scoping.
 *
 *   node scripts/third-opinion-phase-10-conference-scoping.mjs
 *
 * Needs the admin app on 3000 and the participant app on 3001, both in
 * production mode from a build that matches the source.
 *
 * ── Why this exists separately from the Phase 10 suite ───────────────────────
 *
 * The Phase 10 suite already asserts both of these. This script exists because
 * the suite is as much under suspicion as the code: it shares its fixtures, its
 * helpers and its author's assumptions with the thing it measures, so if the
 * blind spot is in the assumption rather than the code, the suite inherits it.
 *
 * Nothing here is shared with that suite. Its own conference, its own map, its
 * own markers, its own accounts, its own sign-in. The two agreeing is evidence;
 * the two disagreeing means the suite measures something other than it claims.
 *
 * ── The two findings ─────────────────────────────────────────────────────────
 *
 * FINDING 1 (round 1): the picture address served any conference's map. An
 * organizer holding an id from another conference could read its picture.
 *
 * FINDING 7 (round 3): the DELETE was not conference-scoped. Round 1 fixed the
 * equivalent READ and left the WRITE — which is why this pair is checked
 * together and why finding 7 is the one to distrust most. A fix applied to one
 * of two symmetrical paths is the shape of error that repeats.
 *
 * The write matters more than the read: markers cascade with their map, so an
 * unscoped delete destroys data rather than merely disclosing it.
 */

import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
// Playwright is CommonJS, so a default import is required.
const { chromium } = require('playwright')

const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const ADMIN_BASE = process.env.WEB_BASE_URL ?? 'http://localhost:3000'
const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'

// Everything this script creates carries this prefix, so cleanup is total and
// nothing seeded can be caught by it.
const P = 'thirdop10'

let pass = 0
let fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`) }
const yes = (c, m, d = '') => (c ? ok(m) : no(m, d))
const notRun = (labels, why) => labels.forEach(l => no(l, `NOT RUN — ${why}`))
const section = t => console.log(`\n── ${t} ──`)

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA busy_timeout = 15000')

// A 1x1 PNG. Small on purpose: this script is about who may reach the bytes,
// not about what the bytes are.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)
const DATA_URL = `data:image/png;base64,${PNG_1X1.toString('base64')}`

function cleanup() {
  db.prepare(`DELETE FROM Pin WHERE id LIKE '${P}%'`).run()
  db.prepare(`DELETE FROM VenueMap WHERE id LIKE '${P}%'`).run()
  db.prepare(`DELETE FROM User WHERE id LIKE '${P}%' OR email LIKE '${P}%'`).run()
  db.prepare(`DELETE FROM Conference WHERE id LIKE '${P}%'`).run()
}

console.log('\n════════════════════════════════════════════════════════════')
console.log('  Third opinion — Phase 10 findings 1 and 7, conference scoping')
console.log('════════════════════════════════════════════════════════════')

// Refuse to report on state that does not exist.
const active = db.prepare(`SELECT id FROM Conference WHERE active = 1`).get()
if (!active) {
  console.error('No active conference. Refusing to run.')
  process.exit(2)
}

cleanup()

// ── Baselines captured BEFORE any fixture is created ─────────────────────────
//
// The first version of this script captured them AFTER inserting its three
// markers, so the "nothing changed" check at the end compared 25 against a
// baseline of 28 and reported a correct database as damaged. A baseline taken
// after the thing it is a baseline for is not a baseline.
const seededMapCount = db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE conferenceId = ?`).get(active.id).n
const seededPinCount = db.prepare(`SELECT COUNT(*) AS n FROM Pin`).get().n
console.log(`\n  baseline before any fixture: ${seededMapCount} maps on the active conference, ${seededPinCount} markers total`)

const now = Date.now()
const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
const hash = await hashPassword(PASSWORD)

// ── The other conference, which must be INACTIVE ─────────────────────────────
const OTHER_CONF = `${P}-conf`
db.prepare(
  `INSERT INTO Conference (id, name, startDate, endDate, active, createdAt)
   VALUES (?, 'Third Opinion Other Conference', ?, ?, 0, ?)`,
).run(OTHER_CONF, now, now, now)

const activeCheck = db.prepare(`SELECT active FROM Conference WHERE id = ?`).get(OTHER_CONF).active
if (activeCheck !== 0) {
  console.error(`Setup failed: the other conference is active=${activeCheck}. Refusing to run.`)
  cleanup()
  process.exit(2)
}

// A map on that other conference, with markers, stored as an uploaded picture
// would be — a data URL, so the image address is the only way to read it.
const OTHER_MAP = `${P}-map`
db.prepare(
  `INSERT INTO VenueMap (id, conferenceId, name, imageUrl, position) VALUES (?, ?, 'Other Conference Hall', ?, 1)`,
).run(OTHER_MAP, OTHER_CONF, DATA_URL)
for (let i = 1; i <= 3; i++) {
  db.prepare(
    `INSERT INTO Pin (id, venueMapId, type, x, y, label, createdAt) VALUES (?, ?, 'ROOM', ?, ?, ?, ?)`,
  ).run(`${P}-pin-${i}`, OTHER_MAP, 10 * i, 10 * i, `Other Room ${i}`, now)
}

// Accounts: an organizer for the admin app, a complete delegate for the
// participant app. Both disposable.
const ORG_ID = `${P}-organizer`
const ORG_EMAIL = `${P}-organizer@wbr.invalid`
db.prepare(
  `INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
   VALUES (?, ?, 'Third Opinion Organizer', 'ORGANIZER', ?, ?, ?)`,
).run(ORG_ID, ORG_EMAIL, hash, now, now)

// ── The delegate must satisfy the onboarding required set, or every read is 403
//
// Read from DELEGATE_REQUIRED_FIELDS rather than guessed: name, jobTitle,
// company, companySize, annualRevenue, solutionsSeeking. The first version of
// this script supplied bio, image and a LinkedIn address instead — none of which
// are required — and the delegate was refused everything with 403. The scoping
// assertion still "passed", because a refusal is what it looks for. That is
// precisely why the positive counterpart is asserted beside it.
const DEL_ID = `${P}-delegate`
const DEL_EMAIL = `${P}-delegate@wbr.invalid`
db.prepare(
  `INSERT INTO User (id, email, name, role, password, jobTitle, company, companySize,
                     annualRevenue, solutionsSeeking, createdAt, updatedAt)
   VALUES (?, ?, 'Third Opinion Delegate', 'ATTENDEE', ?, ?, ?, ?, ?, ?, ?, ?)`,
).run(
  DEL_ID, DEL_EMAIL, hash,
  'Verifier', 'Third Opinion Ltd', 'MIDMARKET', '10M-50M',
  JSON.stringify(['Order Management']), now, now,
)

const browser = await chromium.launch()

async function signIn(page, email, base) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60_000 })
}

try {
  // ── FINDING 7 — the DELETE must not reach another conference's map ──────────
  section('FINDING 7 (round 3) — deleting another conference\'s map')

  const orgCtx = await browser.newContext()
  const orgPage = await orgCtx.newPage()
  let orgIn = true
  try {
    await signIn(orgPage, ORG_EMAIL, ADMIN_BASE)
  } catch (err) {
    orgIn = false
    notRun(
      ['an organizer cannot delete a map on another conference',
       'the other conference\'s map survived the attempt',
       'its markers survived too'],
      `could not sign in as organizer — ${String(err?.message ?? err).split('\n')[0]}`,
    )
  }

  if (orgIn) {
    const del = await orgPage.request.delete(`${ADMIN_BASE}/api/floor-plan/maps/${OTHER_MAP}`, {
      failOnStatusCode: false,
    })
    const body = (await del.text()).slice(0, 200)
    yes(del.status() === 404, 'an organizer cannot delete a map on another conference',
      `got HTTP ${del.status()} ${JSON.stringify(body)}`)

    // The status is not the finding. Survival is.
    const survived = db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE id = ?`).get(OTHER_MAP).n
    yes(survived === 1, 'the other conference\'s map survived the attempt',
      survived === 0 ? 'THE MAP WAS DELETED' : `${survived} rows`)

    const pinsLeft = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE venueMapId = ?`).get(OTHER_MAP).n
    yes(pinsLeft === 3, 'its markers survived too',
      `${pinsLeft} of 3 markers remain${pinsLeft < 3 ? ' — CASCADED AWAY' : ''}`)

    // The counterpart: the same organizer CAN delete a map on the active
    // conference. Without this, a handler that refuses everything would pass
    // the three assertions above while being useless.
    const ownMap = `${P}-own`
    db.prepare(
      `INSERT INTO VenueMap (id, conferenceId, name, imageUrl, position) VALUES (?, ?, 'Third Opinion Own Map', ?, ?)`,
    ).run(ownMap, active.id, DATA_URL, seededMapCount + 50)
    const delOwn = await orgPage.request.delete(`${ADMIN_BASE}/api/floor-plan/maps/${ownMap}`, {
      failOnStatusCode: false,
    })
    const ownGone = db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE id = ?`).get(ownMap).n
    yes(delOwn.status() === 200 && ownGone === 0,
      'the same organizer CAN delete a map on the active conference',
      `HTTP ${delOwn.status()}, ${ownGone} rows left — a handler refusing everything would pass the checks above`)
    db.prepare(`DELETE FROM VenueMap WHERE id = ?`).run(ownMap)
  }
  await orgCtx.close()

  // ── FINDING 1 — the picture address must not serve another conference's map ─
  section('FINDING 1 (round 1) — reading another conference\'s picture')

  const delCtx = await browser.newContext()
  const delPage = await delCtx.newPage()
  let delIn = true
  try {
    await signIn(delPage, DEL_EMAIL, BASE)
  } catch (err) {
    delIn = false
    notRun(
      ['the picture address refuses another conference\'s map',
       'the refusal actually withheld the bytes',
       'the same delegate CAN read a picture on the active conference'],
      `could not sign in as delegate — ${String(err?.message ?? err).split('\n')[0]}`,
    )
  }

  if (delIn) {
    const img = await delPage.request.get(`${BASE}/api/data/map/${OTHER_MAP}/image`, {
      failOnStatusCode: false,
    })
    yes(img.status() !== 200, 'the picture address refuses another conference\'s map',
      `got HTTP ${img.status()}`)

    // A non-200 is not proof the bytes were withheld. Check the body.
    const bytes = await img.body()
    const leaked = bytes.length >= PNG_1X1.length && bytes.subarray(0, 8).equals(PNG_1X1.subarray(0, 8))
    yes(!leaked, 'the refusal actually withheld the bytes',
      leaked ? `PNG SIGNATURE PRESENT in a ${bytes.length}-byte body` : `${bytes.length}-byte body, no PNG signature`)

    // The counterpart again: an address refusing everything is not scoping.
    const ownMap2 = `${P}-own2`
    db.prepare(
      `INSERT INTO VenueMap (id, conferenceId, name, imageUrl, position) VALUES (?, ?, 'Third Opinion Readable', ?, ?)`,
    ).run(ownMap2, active.id, DATA_URL, seededMapCount + 60)
    const okImg = await delPage.request.get(`${BASE}/api/data/map/${ownMap2}/image`, { failOnStatusCode: false })
    const okBytes = await okImg.body()
    yes(okImg.status() === 200 && okBytes.subarray(0, 8).equals(PNG_1X1.subarray(0, 8)),
      'the same delegate CAN read a picture on the active conference',
      `HTTP ${okImg.status()}, ${okBytes.length} bytes — an address refusing everything would pass the checks above`)
    db.prepare(`DELETE FROM VenueMap WHERE id = ?`).run(ownMap2)
  }
  await delCtx.close()
} catch (err) {
  no('the script ran to completion', String(err?.message ?? err).split('\n')[0])
} finally {
  section('Cleanup')
  cleanup()
  const left = db.prepare(
    `SELECT (SELECT COUNT(*) FROM VenueMap WHERE id LIKE '${P}%')
          + (SELECT COUNT(*) FROM Pin WHERE id LIKE '${P}%')
          + (SELECT COUNT(*) FROM User WHERE id LIKE '${P}%')
          + (SELECT COUNT(*) FROM Conference WHERE id LIKE '${P}%') AS n`,
  ).get().n
  yes(left === 0, 'everything this script created was removed', `${left} rows left`)

  const mapsNow = db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE conferenceId = ?`).get(active.id).n
  const pinsNow = db.prepare(`SELECT COUNT(*) AS n FROM Pin`).get().n
  yes(mapsNow === seededMapCount && pinsNow === seededPinCount,
    'the active conference is exactly as it was before this ran',
    `maps ${mapsNow} of ${seededMapCount}, markers ${pinsNow} of ${seededPinCount}`)

  await browser.close()
  db.close()

  console.log('\n────────────────────────────────────────────────────────────')
  console.log(`  Results: ${pass} passed, ${fail} failed`)
  console.log('────────────────────────────────────────────────────────────')
  console.log(`
  This script shares no fixture, helper or account with the Phase 10 suite.
  Agreement between the two is evidence about the product. Disagreement means
  the suite measures something other than what it claims.

  Each finding is checked in BOTH directions. A refusal on its own proves
  nothing: a handler that refused every request would satisfy the scoping
  assertions while being useless, so the positive counterpart is asserted
  beside each one.
`)
  process.exit(fail === 0 ? 0 : 1)
}
