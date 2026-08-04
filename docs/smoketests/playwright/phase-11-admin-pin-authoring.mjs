#!/usr/bin/env node
// Phase 11 — the organizer places markers on a map, checked in a real browser.
//
//   node docs/smoketests/playwright/phase-11-admin-pin-authoring.mjs
//
// Needs the admin app on 3000 and the participant app on 3001. Exits non-zero on
// any failure. Nothing here is skipped: a group of assertions that cannot run is
// reported as FAILURES with the reason, because a group that silently does not run
// reads as "nothing wrong here" at the moment the most is wrong.
//
// ── What this phase added, and the one thing that had to be built first ───────
//
// User stories FP 25 to 28 and 30: the organizer taps a spot on a map, assigns the
// exhibiting company for a booth marker or types a name for a room, moves or
// deletes a marker, and a saved marker reaches the delegate at the placed spot.
//
// Finding F-19, found before any of that was written: the admin app could display
// no map picture at all. The list screen computed a thumbnail address and never
// rendered it; a seeded map's picture is committed under apps/attendee/public,
// which only the participant app serves; and an uploaded map's picture is
// deliberately withheld from the page because carrying it there is what F-14
// exists to prevent. So Phase 11 begins with an address of its own for the
// picture, and section 2 is about that.
//
// ── Three rules this file follows, each of them bought with a real failure ────
//
// EVERY REFUSAL IS PAIRED WITH A POSITIVE COUNTERPART. An address that refused
// every request would satisfy every scoping and permission assertion in this phase
// while being useless. The independent pass on 2026-08-03 hit exactly that: a
// delegate fixture was built with the wrong fields, was refused everything, and the
// scoping assertion still passed because a refusal is what it looks for.
//
// NOTHING DESTRUCTIVE TOUCHES A ROW THIS FILE DID NOT CREATE. Phase 10's first
// attempt aimed a delete at the first seeded map on the assumption a guard would
// refuse it. The guard did not, and the exhibit hall and its ten markers were
// destroyed — twice, because it was re-run before being fixed. A check that damages
// real data when the thing it checks is broken does the most harm in exactly the
// case it exists to detect.
//
// THE DELEGATE CACHE IS PRIMED BEFORE ANY WRITE THAT IS MEASURED. The participant
// map read is cached for 300 seconds under the tag 'floor-plan'. Placing a marker
// and then seeing it appear proves nothing unless the cache was populated first —
// otherwise it appears because the cache happened to be empty.

import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const ATTENDEE_BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const ADMIN_BASE = process.env.WEB_BASE_URL ?? 'http://localhost:3000'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'

const ORGANIZER_ID = 'phase11-organizer'
const ORGANIZER_EMAIL = 'phase11-organizer@wbr.invalid'
const STAFF_ID = 'phase11-staff'
const STAFF_EMAIL = 'phase11-staff@wbr.invalid'
const DELEGATE_ID = 'phase11-delegate'
const DELEGATE_EMAIL = 'phase11-delegate@wbr.invalid'

const MAP_ID = 'phase11-map'
const MAP_NAME = 'Phase 11 Authoring Map'
// A second map, kept empty until section 12 needs it. That section places markers by
// clicking empty space, and by the time it runs the first map is covered in markers
// from earlier sections — including two with 60-character names, which are wide. A
// click intended for bare picture landed on a marker's name instead, so the section
// selected a marker rather than starting a new one and then waited 30 seconds for a
// form that was never going to open.
const MAP_B_ID = 'phase11-map-b'
const MAP_B_NAME = 'Phase 11 Reconciliation Map'
const OTHER_CONF_ID = 'phase11-other-conference'
const OTHER_MAP_ID = 'phase11-other-map'
const OTHER_SPONSOR_ID = 'phase11-other-sponsor'
// An exhibiting company in the ACTIVE conference whose booth number this suite owns
// and rewrites. Section 7c needs to see the same marker drawn for a booth number that
// is null, then an empty string, then whitespace, and the only rows it may rewrite are
// rows it created. Every seeded company is somebody else's.
const BLANK_SPONSOR_ID = 'phase11-blank-booth-sponsor'
const BLANK_SPONSOR_NAME = 'Phase 11 Blank Booth Company'

let pass = 0
let fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, detail = '') => { fail++; console.log(`  ✗ ${m}${detail ? ` — ${detail}` : ''}`) }
const yes = (c, m, detail = '') => (c ? ok(m) : no(m, detail))
const section = t => console.log(`\n── ${t} ──`)
const notRun = (labels, why) => labels.forEach(l => no(l, `NOT RUN — ${why}`))

const db = new DatabaseSync(DB_PATH)
// All four apps read and write this one SQLite file, and its journal mode is
// `delete` rather than write-ahead logging, so a write throws "database is locked"
// instead of waiting. Wait rather than fail on something unrelated to the product.
db.exec('PRAGMA busy_timeout = 15000')

const conference = db.prepare(`SELECT id FROM Conference WHERE active = 1`).get()
if (!conference) {
  console.error('No active conference; refusing to report on state that does not exist.')
  process.exit(2)
}

// ── What is expected, read from the database rather than written in here ──────

const seededMaps = db
  .prepare(`SELECT id, name, imageUrl, position FROM VenueMap WHERE conferenceId = ? AND id NOT LIKE 'phase11-%' ORDER BY position ASC`)
  .all(conference.id)
// ── The seeded markers as ROWS, not as a total ────────────────────────────────
//
// Raised by adversarial review round 2. This used to be a single COUNT(*) across
// every map not belonging to this suite, compared against the same total at the end.
// A defect that deleted one seeded marker and added another somewhere else would
// pass, because the total is unchanged. The count was also not limited to the active
// conference, unlike the seeded-map snapshot beside it, so an unrelated map could
// make up the difference.
//
// The whole row set is captured instead, ordered, so a change to any field of any
// marker is visible. This is the assertion that stands between this suite and the
// mistake that destroyed real data twice in the previous phase.
const seededPinRows = db
  .prepare(
    `SELECT p.id, p.venueMapId, p.type, p.x, p.y, p.sponsorId, p.label
       FROM Pin p
       JOIN VenueMap m ON m.id = p.venueMapId
      WHERE m.conferenceId = ?
        AND m.id NOT LIKE 'phase11-%'
      ORDER BY p.id ASC`,
  )
  .all(conference.id)
const seededPinCount = seededPinRows.length
const seededPinFingerprint = JSON.stringify(seededPinRows)
const seededPictureMap = seededMaps.find(m => !m.imageUrl.startsWith('data:'))
const sponsorWithBooth = db
  .prepare(`SELECT id, name, boothNumber FROM Sponsor WHERE conferenceId = ? AND boothNumber IS NOT NULL AND boothNumber != '' ORDER BY name ASC LIMIT 1`)
  .get(conference.id)
const sponsorWithoutBooth = db
  .prepare(`SELECT id, name FROM Sponsor WHERE conferenceId = ? AND (boothNumber IS NULL OR boothNumber = '') ORDER BY name ASC LIMIT 1`)
  .get(conference.id)

if (seededMaps.length === 0 || !seededPictureMap || !sponsorWithBooth) {
  console.error('Missing seeded maps or an exhibiting company with a booth number; refusing to report on state that does not exist.')
  process.exit(2)
}

// A real picture, so bytes served back can be compared to bytes on disk rather
// than to something this file made up.
const SOURCE_PICTURE = join(ROOT, 'apps/attendee/public/maps/exhibit-hall.png')
const pictureBytes = readFileSync(SOURCE_PICTURE)
const FIXTURE_DATA_URL = `data:image/png;base64,${pictureBytes.toString('base64')}`

// The committed copy the admin picture address reads for a seeded map. Compared
// byte for byte, so a truncated or missing copy is a failure rather than a 200 that
// happens to return something.
const ADMIN_COPY = join(ROOT, 'apps/web/assets', seededPictureMap.imageUrl)
let adminCopyBytes = null
try {
  adminCopyBytes = readFileSync(ADMIN_COPY)
} catch {
  adminCopyBytes = null
}

const MAX_LABEL_LENGTH = 60

/** Ids of markers created through the addresses during this run. */
const createdPinIds = []

// ── Every fixture row this file owns, named explicitly ───────────────────────
//
// Raised by adversarial review round 2. cleanup() used to include
// `DELETE FROM VenueMap WHERE name LIKE 'Phase 11 %'`, which would delete a real
// map whose name happened to start that way — and the cleanup assertion then
// repeated the same broad condition after the deletion, so it could not tell that
// it had just destroyed something. That directly contradicts this file's own rule
// that nothing destructive touches a row it did not create, which is the rule that
// exists because Phase 10 destroyed the seeded exhibit hall and its ten markers.
//
// The name-based delete was copied from Phase 10's suite, where it is needed because
// that phase creates maps through the upload handler and their ids are generated.
// This phase creates every map with an id it chose, so nothing here needs it.
const FIXTURE_MAP_IDS = [MAP_ID, MAP_B_ID, OTHER_MAP_ID]
const FIXTURE_USER_IDS = [ORGANIZER_ID, STAFF_ID, DELEGATE_ID]

function cleanup() {
  const mapPlaceholders = FIXTURE_MAP_IDS.map(() => '?').join(',')
  db.prepare(`DELETE FROM Pin WHERE venueMapId IN (${mapPlaceholders})`).run(...FIXTURE_MAP_IDS)
  if (createdPinIds.length > 0) {
    db.prepare(`DELETE FROM Pin WHERE id IN (${createdPinIds.map(() => '?').join(',')})`).run(...createdPinIds)
  }
  db.prepare(`DELETE FROM VenueMap WHERE id IN (${mapPlaceholders})`).run(...FIXTURE_MAP_IDS)
  db.prepare(`DELETE FROM Sponsor WHERE id IN (?, ?)`).run(OTHER_SPONSOR_ID, BLANK_SPONSOR_ID)
  db.prepare(`DELETE FROM Conference WHERE id = ?`).run(OTHER_CONF_ID)
  db.prepare(`DELETE FROM User WHERE id IN (${FIXTURE_USER_IDS.map(() => '?').join(',')})`).run(...FIXTURE_USER_IDS)
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

// ── The STAFF role configuration, captured exactly as it is ───────────────────
//
// Raised by adversarial review round 2 as one of two high findings, and it is the
// more dangerous of the two because it damages state OTHER suites read.
//
// This used to be a boolean, `hadStaffRoleRow`, and the restore was "delete the row
// if there wasn't one before", asserted as `hadStaffRoleRow || rowsLeft === 0`. When
// a STAFF row DID exist, that expression is true no matter what — so the suite could
// revoke the floor-plan permission for staff, never put it back, and report
// `the revoked-permission row was removed again` as a pass. On this machine the table
// is empty so the old code happened to work; on any machine where somebody has saved
// role permissions on the Access screen it would silently leave staff locked out of
// the floor plan, and finding F-18 records that there is no way to notice from
// inside the app.
//
// The row's own fields are captured instead, restored in a finally that always runs,
// and the assertion compares the restored state to this snapshot rather than to a
// condition that cannot fail.
//
// The same defect is present in Phase 10's suite, at
// docs/smoketests/playwright/phase-10-admin-map-upload.mjs:1706, which is where this
// pattern was copied from. That file is merged and is not changed here; the finding
// is recorded in docs/codex-reviews/phase-11-admin-pin-authoring.md.
const staffRoleSnapshot = db
  .prepare(`SELECT role, description, permissions FROM RolePermission WHERE role = 'STAFF'`)
  .get() ?? null

/** The STAFF defaults, from apps/web/lib/permissions.ts DEFAULT_PERMISSIONS. */
const STAFF_DEFAULT_PERMISSIONS = [
  'calendar', 'agenda', 'speakers', 'floorPlan', 'meetings', 'timeBlocks',
  'attendees', 'staff', 'sponsors', 'chat', 'email',
]

/**
 * Put the STAFF role configuration back, THROUGH THE APP.
 *
 * ── Why this cannot be a database write, found by adversarial review round 3 ──
 *
 * The first version of this restore wrote the RolePermission row directly with
 * SQLite. That is the exact mistake this project has already paid for once: role
 * permissions resolve through a cache that only the app's save path clears, so a row
 * written behind the app's back leaves it serving the configuration it last saw.
 * Section 9 revokes the permission through PUT /api/roles and then makes STAFF
 * requests, which loads the REVOKED configuration into that cache. A direct write
 * afterwards updates the row and leaves the running app still refusing staff — and
 * the assertion, which only read the row, would call that restored.
 *
 * Phase 10's log records the same mistake made in the other direction: the revoke was
 * written directly, the app kept serving the permissive answer, and the delete aimed
 * at a seeded map destroyed the exhibit hall and its ten markers. Twice.
 *
 * So the restore goes through PUT /api/roles, the path a person uses, which clears the
 * cache as a side effect.
 *
 * The no-row case needs both halves. There is no row to write, and the API only
 * creates one — so the defaults are saved through the API to clear the cache and make
 * the running app correct, and the row is then deleted to leave the table as it was.
 * The cached configuration and "no row at all" resolve to the same answer, because
 * what the API was given IS the default set.
 */
async function restoreStaffRole(page) {
  if (staffRoleSnapshot) {
    let permissions
    try {
      permissions = JSON.parse(staffRoleSnapshot.permissions)
    } catch {
      permissions = STAFF_DEFAULT_PERMISSIONS
    }
    const res = await page.request.put(`${ADMIN_BASE}/api/roles`, {
      data: { role: 'STAFF', description: staffRoleSnapshot.description, permissions },
      failOnStatusCode: false,
    })
    return res.status() === 200
  }

  const res = await page.request.put(`${ADMIN_BASE}/api/roles`, {
    data: {
      role: 'STAFF',
      description: 'Phase 11 restore: staff defaults, row removed afterwards',
      permissions: STAFF_DEFAULT_PERMISSIONS,
    },
    failOnStatusCode: false,
  })
  db.prepare(`DELETE FROM RolePermission WHERE role = 'STAFF'`).run()
  return res.status() === 200
}

/**
 * True when the STAFF configuration matches the snapshot in the fields this suite
 * changed: role, description and permissions.
 *
 * `updatedAt` is deliberately not compared. Saving through the app sets it to now,
 * which is correct behaviour and not something to restore. Round 3 pointed out that
 * the earlier assertion claimed an exact restore while rewriting that column, so the
 * assertion text now says which fields it checks.
 */
function staffRoleMatchesSnapshot() {
  const now = db
    .prepare(`SELECT role, description, permissions FROM RolePermission WHERE role = 'STAFF'`)
    .get() ?? null
  if (staffRoleSnapshot === null) return now === null
  if (now === null) return false
  return (
    now.role === staffRoleSnapshot.role &&
    now.description === staffRoleSnapshot.description &&
    now.permissions === staffRoleSnapshot.permissions
  )
}

{
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  cleanup()
  const now = Date.now()

  // A delegate satisfying every item of the required set, so the onboarding gate
  // lets them reach the map at all. Built with the SIX required fields: the
  // independent pass on 2026-08-03 lost an hour to a delegate missing some of
  // them, which was refused everything while a refusal assertion still passed.
  db.prepare(
    `INSERT INTO User (id, email, name, role, password, jobTitle, company, companySize,
                       annualRevenue, solutionsSeeking, createdAt, updatedAt)
     VALUES (?, ?, 'Phase 11 Delegate', 'ATTENDEE', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    DELEGATE_ID, DELEGATE_EMAIL, hash,
    'Head of Retail', 'Phase 11 Retail Co', 'MIDMARKET', '10M-50M',
    JSON.stringify(['Order Management']), now, now,
  )

  // Throwaway elevated accounts rather than the shared wbr@test.com, so this file
  // never depends on a shared account's password staying what it is.
  db.prepare(
    `INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
     VALUES (?, ?, 'Phase 11 Organizer', 'ORGANIZER', ?, ?, ?)`,
  ).run(ORGANIZER_ID, ORGANIZER_EMAIL, hash, now, now)
  db.prepare(
    `INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
     VALUES (?, ?, 'Phase 11 Staff', 'STAFF', ?, ?, ?)`,
  ).run(STAFF_ID, STAFF_EMAIL, hash, now, now)

  // A map standing in for one an organizer uploaded: the picture is in the column
  // as a base64 data URL, which is what the upload path writes.
  const maxPosition = db
    .prepare(`SELECT COALESCE(MAX(position), 0) AS m FROM VenueMap WHERE conferenceId = ?`)
    .get(conference.id).m
  db.prepare(
    `INSERT INTO VenueMap (id, conferenceId, name, imageUrl, position, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(MAP_ID, conference.id, MAP_NAME, FIXTURE_DATA_URL, maxPosition + 1, now)
  db.prepare(
    `INSERT INTO VenueMap (id, conferenceId, name, imageUrl, position, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(MAP_B_ID, conference.id, MAP_B_NAME, FIXTURE_DATA_URL, maxPosition + 2, now)

  // A second conference, NOT active, with a map and an exhibiting company of its
  // own. Every scoping assertion in section 9 needs a real row on the wrong side of
  // the boundary; without one the assertions would be about a missing id instead,
  // which any handler refuses for the wrong reason.
  db.prepare(
    `INSERT INTO Conference (id, name, startDate, endDate, active, createdAt) VALUES (?, 'Phase 11 Other Conference', ?, ?, 0, ?)`,
  ).run(OTHER_CONF_ID, now, now + 86_400_000, now)
  db.prepare(
    `INSERT INTO VenueMap (id, conferenceId, name, imageUrl, position, createdAt) VALUES (?, ?, 'Phase 11 Other Map', ?, 1, ?)`,
  ).run(OTHER_MAP_ID, OTHER_CONF_ID, FIXTURE_DATA_URL, now)
  db.prepare(
    `INSERT INTO Sponsor (id, conferenceId, name, tier, boothNumber, createdAt) VALUES (?, ?, 'Phase 11 Other Company', 'GOLD', 'X-99', ?)`,
  ).run(OTHER_SPONSOR_ID, OTHER_CONF_ID, now)

  // Created with boothNumber NULL. Section 7c rewrites it to '' and then to
  // whitespace and reads the marker each time, which is why it must be a row this
  // suite owns rather than one of the ten seeded companies that have no booth number.
  db.prepare(
    `INSERT INTO Sponsor (id, conferenceId, name, tier, boothNumber, createdAt) VALUES (?, ?, ?, 'GOLD', NULL, ?)`,
  ).run(BLANK_SPONSOR_ID, conference.id, BLANK_SPONSOR_NAME, now)

  const built = db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE id IN (?, ?)`).get(MAP_ID, OTHER_MAP_ID).n +
    db.prepare(`SELECT COUNT(*) AS n FROM Sponsor WHERE id = ?`).get(BLANK_SPONSOR_ID).n
  if (built !== 3) {
    console.error('Fixtures were not created; refusing to report on state that does not exist.')
    cleanup()
    process.exit(2)
  }
}

const browser = await chromium.launch()

async function signIn(page, email, base) {
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
      await page.locator('input[type="email"], input[name="email"]').first().fill(email)
      await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
      await page.locator('button[type="submit"]').first().click()
      await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60_000 })
      return
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

/**
 * Wait until the organizer's screen has settled to exactly ONE copy of itself.
 *
 * Measured 2026-08-03: on a first load this app's dashboard screens briefly render
 * twice. /dashboard/speakers showed two headings and two main elements from load
 * through about 250 ms, /dashboard/staff showed the same at load, and the
 * floor-plan screen showed it for roughly 100 to 500 ms in one run. It is
 * pre-existing — those two screens are untouched by Phase 11 — and it settles on
 * its own. scripts/third-opinion-phase-11-hydration-doubling.mjs reproduces it.
 *
 * It matters here because during that window every count is doubled. Reaching for
 * the first of two matches would hide it and let assertions pass while measuring a
 * duplicate. So this waits for one copy and section 1 asserts that it arrived.
 */
async function settled(page, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    try {
      last = await page.evaluate(() => ({
        roots: document.querySelectorAll('[data-testid="floor-plan-admin"]').length,
        rows: document.querySelectorAll('[data-testid="map-row"]').length,
      }))
      if (last.roots === 1 && last.rows > 0) {
        // Confirm it STAYS at one. The doubling appears after the first paint, so a
        // single reading of 1 can be the moment before it doubles.
        await page.waitForTimeout(250)
        const again = await page.evaluate(() => ({
          roots: document.querySelectorAll('[data-testid="floor-plan-admin"]').length,
          rows: document.querySelectorAll('[data-testid="map-row"]').length,
        }))
        if (again.roots === 1 && again.rows === last.rows) return again
        last = again
      }
    } catch {
      // The document was replaced mid-read during navigation. Try again.
    }
    await page.waitForTimeout(100)
  }
  return last
}

/** Read the participant map as a signed-in delegate, over HTTP, through the app. */
async function delegateMap(page) {
  return page.evaluate(async () => {
    const r = await fetch('/api/data/map')
    return { status: r.status, body: r.ok ? await r.json() : null }
  })
}

const PINS_URL = id => `${ADMIN_BASE}/api/floor-plan/maps/${id}/pins`
const PIN_URL = (mapId, pinId) => `${ADMIN_BASE}/api/floor-plan/maps/${mapId}/pins/${pinId}`
const IMAGE_URL = id => `${ADMIN_BASE}/api/floor-plan/maps/${id}/image`

console.log('\n════════════════════════════════════════════════════════════')
console.log('  Phase 11 — the organizer places markers on a map')
console.log('════════════════════════════════════════════════════════════')

const orgCtx = await browser.newContext()
const org = await orgCtx.newPage()
const orgErrors = []
org.on('pageerror', e => orgErrors.push(String(e)))

const delCtx = await browser.newContext()
const del = await delCtx.newPage()

let orgReady = true
let delReady = true
try {
  await signIn(org, ORGANIZER_EMAIL, ADMIN_BASE)
} catch (err) {
  orgReady = false
  console.error(`Could not sign in as the organizer fixture: ${String(err?.message ?? err).split('\n')[0]}`)
}
try {
  await signIn(del, DELEGATE_EMAIL, ATTENDEE_BASE)
} catch (err) {
  delReady = false
  console.error(`Could not sign in as the delegate fixture: ${String(err?.message ?? err).split('\n')[0]}`)
}

// createdPinIds is declared beside cleanup(), which needs it.

try {
  // ═══ 1. The screen renders once, and the fixture map is on it ═══════════════
  section('1. The organizer screen settles to one copy')

  if (!orgReady) {
    notRun(
      ['the screen settles to exactly one copy', 'the fixture map has exactly one row', 'the marker editor opens'],
      'could not sign in as the organizer',
    )
  } else {
    await org.goto(`${ADMIN_BASE}/dashboard/floor-plan`, { waitUntil: 'domcontentloaded' })
    const state = await settled(org)
    yes(state?.roots === 1, 'the screen settles to exactly one copy',
      `roots=${state?.roots}, rows=${state?.rows} — see scripts/third-opinion-phase-11-hydration-doubling.mjs`)

    const rowCount = await org.locator(`[data-testid="map-row"][data-map-id="${MAP_ID}"]`).count()
    yes(rowCount === 1, 'the fixture map has exactly one row', `got ${rowCount}`)
  }

  const row = org.locator(`[data-testid="map-row"][data-map-id="${MAP_ID}"]`)
  const editor = org.locator(`[data-testid="marker-editor"][data-map-id="${MAP_ID}"]`)
  let editorOpen = false

  if (orgReady) {
    // ── The button's WORDING is asserted, not just its behaviour ───────────────
    //
    // Every other reference to this button in this file uses its test id, so the
    // visible text could change to anything at all and nothing here would notice.
    // That matters more than it looks: there is no picture on the Floor Plan screen
    // itself, so this button is the only route to one, and a reader who does not
    // understand the label never finds the map.
    //
    // The label was `Markers` until 2026-08-04, when it was replaced: it named a
    // task rather than an action, and a reader who does not recognise it never
    // reaches a map at all, because there is no picture anywhere else on the screen.
    //
    // The accessible name is asserted alongside the visible text because they have
    // to agree. Someone driving the screen by voice says the words they can see, so
    // an accessible name that did not contain them would respond to neither.
    const trigger = row.locator('[data-testid="edit-markers"]')
    const triggerText = ((await trigger.textContent()) ?? '').trim()
    const triggerName = (await trigger.getAttribute('aria-label')) ?? ''
    yes(triggerText === 'Show map' && triggerName.includes('Show map'),
      'the button that reveals the map says "Show map", and its accessible name agrees',
      `the button read ${JSON.stringify(triggerText)} with accessible name ${JSON.stringify(triggerName)}`)

    await trigger.click()
    editorOpen = (await editor.count()) === 1
    yes(editorOpen, 'the marker editor opens', `editors on screen: ${await editor.count()}`)

    // The open state is the other half of a matched pair, "Show map" and "Hide map".
    // A button stuck on one word is a different defect from a button with the wrong
    // word, so both states are read. It said "Done" until 2026-08-04, which described
    // finishing rather than what the press does. Both halves of one button now name
    // the same action in opposite directions.
    const openText = ((await trigger.textContent()) ?? '').trim()
    const openName = (await trigger.getAttribute('aria-label')) ?? ''
    yes(openText === 'Hide map' && openName.includes('Hide map'),
      'and says "Hide map" while the map is open, accessible name agreeing',
      `the button read ${JSON.stringify(openText)} with accessible name ${JSON.stringify(openName)}`)
  }

  // ═══ 2. The picture address, F-19 ══════════════════════════════════════════
  section('2. The admin picture address (F-19)')

  const IMAGE_LABELS = [
    'an uploaded map answers 200 to the organizer',
    'and returns exactly the bytes that were stored',
    'a seeded map answers 200 to the organizer',
    'and returns the committed copy byte for byte',
    'a request with NO session is refused 401',
    'a map from another conference answers 404',
    // The fourth guard on this address — the floorPlan permission key — is asserted
    // in section 9 rather than here, because revoking a permission needs the staff
    // fixture and the app's own save path. It was declared in this list and never
    // asserted, which is a criterion with no assertion behind it; found while
    // preparing the negative controls.
  ]

  if (!orgReady) {
    notRun(IMAGE_LABELS, 'could not sign in as the organizer')
  } else {
    const uploaded = await org.request.get(IMAGE_URL(MAP_ID), { failOnStatusCode: false })
    yes(uploaded.status() === 200, IMAGE_LABELS[0], `got HTTP ${uploaded.status()}`)
    const uploadedBody = uploaded.status() === 200 ? Buffer.from(await uploaded.body()) : Buffer.alloc(0)
    yes(uploadedBody.equals(pictureBytes), IMAGE_LABELS[1],
      `got ${uploadedBody.length} bytes, stored picture is ${pictureBytes.length}`)

    const seeded = await org.request.get(IMAGE_URL(seededPictureMap.id), { failOnStatusCode: false })
    yes(seeded.status() === 200, IMAGE_LABELS[2], `got HTTP ${seeded.status()} for ${seededPictureMap.imageUrl}`)
    if (adminCopyBytes === null) {
      no(IMAGE_LABELS[3], `the committed copy is missing at apps/web/assets${seededPictureMap.imageUrl} — without it the picture works nowhere`)
    } else {
      const seededBody = seeded.status() === 200 ? Buffer.from(await seeded.body()) : Buffer.alloc(0)
      yes(seededBody.equals(adminCopyBytes), IMAGE_LABELS[3],
        `got ${seededBody.length} bytes, committed copy is ${adminCopyBytes.length}`)
    }

    // The refusal, and its positive counterpart is the 200 above — the same address,
    // the same map, differing only by who is asking.
    const anonCtx = await browser.newContext()
    const anon = await anonCtx.newPage()
    const anonRes = await anon.request.get(IMAGE_URL(MAP_ID), { failOnStatusCode: false })
    yes(anonRes.status() === 401, IMAGE_LABELS[4], `got HTTP ${anonRes.status()}`)
    await anonCtx.close()

    const otherConf = await org.request.get(IMAGE_URL(OTHER_MAP_ID), { failOnStatusCode: false })
    yes(otherConf.status() === 404, IMAGE_LABELS[5],
      `got HTTP ${otherConf.status()} — a map outside the active conference must answer as one that does not exist`)
  }

  // ═══ 3. Placing a booth marker by clicking the picture ═════════════════════
  section('3. Placing a booth marker by clicking the picture')

  const PLACE_LABELS = [
    'the picture has real size on the organizer screen',
    'clicking the picture starts a marker where the click landed',
    'saving a booth with no company is refused, naming what is missing',
    'and nothing was written',
    'choosing a company and saving stores exactly one marker',
    'stored as a booth marker linked to the chosen company',
    'stored at the clicked position, as percentages',
    // Added 2026-08-03. The wording used to be chosen from whether ATTENDEE_APP_URL
    // was set, not from whether the notification arrived — so a timed-out call still
    // told the organizer delegates could see the change. Here the participant app IS
    // reachable, so the truthful wording is the confident one.
    'the organizer is told delegates can see it, and that is true',
    // ── Added while designing the negative controls ──────────────────────────
    //
    // The refusal above is driven through the screen, and the screen checks this
    // rule in the browser before it sends anything. So removing the rule from the
    // handler would not have been caught by any assertion: the browser would still
    // refuse and the message would still mention a company. The rule lives in the
    // handler, so it has to be asserted there.
    'a booth with neither a company nor a name is refused at the address too',
  ]

  let canvasBox = null
  let boothPinId = null

  if (!orgReady || !editorOpen) {
    notRun(PLACE_LABELS, orgReady ? 'the marker editor did not open' : 'could not sign in as the organizer')
  } else {
    const canvas = editor.locator('[data-testid="marker-canvas"]')
    canvasBox = await canvas.boundingBox()
    yes(canvasBox !== null && canvasBox.width > 100 && canvasBox.height > 100, PLACE_LABELS[0],
      `box ${JSON.stringify(canvasBox)} — a zero-size picture would make every position assertion meaningless`)

    if (!canvasBox) {
      notRun(PLACE_LABELS.slice(1), 'the picture had no size to click on')
    } else {
      await canvas.click({ position: { x: Math.round(canvasBox.width * 0.3), y: Math.round(canvasBox.height * 0.4) } })
      yes(await editor.locator('[data-testid="draft-pin"]').count() === 1, PLACE_LABELS[1])

      // Refused first, so the message a person reads is asserted rather than only
      // the absence of a row.
      await editor.locator('[data-testid="draft-save"]').click()
      const refusal = (await editor.locator('[data-testid="pin-error"]').textContent().catch(() => '')) ?? ''
      yes(/company/i.test(refusal), PLACE_LABELS[2], `message was ${JSON.stringify(refusal)}`)
      yes(db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE venueMapId = ?`).get(MAP_ID).n === 0, PLACE_LABELS[3])

      await editor.locator('[data-testid="draft-sponsor"]').selectOption(sponsorWithBooth.id)
      await editor.locator('[data-testid="draft-save"]').click()
      await org.waitForFunction(
        () => document.querySelectorAll('[data-testid="admin-pin"]').length === 1,
        null,
        { timeout: 15_000 },
      ).catch(() => {})

      const stored = db.prepare(`SELECT id, type, x, y, sponsorId, label FROM Pin WHERE venueMapId = ?`).all(MAP_ID)
      yes(stored.length === 1, PLACE_LABELS[4], `got ${stored.length}`)
      if (stored.length === 1) {
        boothPinId = stored[0].id
        createdPinIds.push(stored[0].id)
        yes(stored[0].type === 'BOOTH' && stored[0].sponsorId === sponsorWithBooth.id, PLACE_LABELS[5],
          `type=${stored[0].type} sponsorId=${stored[0].sponsorId}`)
        // Three percentage points of tolerance: the click lands on a pixel and the
        // stored value is a percentage rounded to two places, so exact equality
        // would be asserting arithmetic rather than behaviour.
        yes(Math.abs(stored[0].x - 30) <= 3 && Math.abs(stored[0].y - 40) <= 3, PLACE_LABELS[6],
          `stored x=${stored[0].x} y=${stored[0].y}, clicked 30/40`)
      } else {
        notRun(PLACE_LABELS.slice(5, 8), 'the marker was not stored')
      }

      const notice = ((await org.locator('[data-testid="upload-notice"]').first().textContent().catch(() => '')) ?? '').trim()
      yes(/Delegates can see the change now/i.test(notice), PLACE_LABELS[7],
        `the notice read ${JSON.stringify(notice)} — "within a few minutes" here would mean the notification did not arrive`)

      // The same rule, at the address, where it actually lives.
      const boothNeither = await org.request.post(PINS_URL(MAP_ID), {
        data: { type: 'BOOTH', x: 20, y: 20 },
        failOnStatusCode: false,
      })
      const boothNeitherBody = await boothNeither.text()
      yes(boothNeither.status() === 400 && /company/i.test(boothNeitherBody), PLACE_LABELS[8],
        `HTTP ${boothNeither.status()}, body ${JSON.stringify(boothNeitherBody.slice(0, 160))}`)
    }
  }

  // ═══ 4. The company list surfaces booth numbers ════════════════════════════
  section('4. The company list surfaces booth numbers (FP 26)')

  if (!orgReady || !editorOpen || !canvasBox) {
    notRun(['the company list shows the booth number', 'a company with no booth number is still listed, and says so'],
      'the marker editor was not usable')
  } else {
    // ── The list only exists while a marker is being filled in ────────────────
    //
    // The first version of this read the company list with nothing on screen to
    // read it from: section 3 finishes by saving, which closes the form, and no
    // marker is selected at this point. Both assertions reported the entry as null
    // and failed — correctly, and the fault was in this file rather than the
    // product.
    //
    // A fresh form is opened, read, and cancelled. Cancelled rather than left open
    // because section 6 asserts that clicking a marker SELECTS it, and a marker left
    // selected here would be deselected by that click instead.
    const canvas = editor.locator('[data-testid="marker-canvas"]')
    await canvas.click({ position: { x: Math.round(canvasBox.width * 0.45), y: Math.round(canvasBox.height * 0.5) } })
    const listPresent = await editor.locator('[data-testid="draft-sponsor"]').count()
    yes(listPresent === 1, 'the company list is on screen while a booth marker is being filled in',
      `found ${listPresent} lists`)

    const optionTexts = await editor.locator('[data-testid="draft-sponsor"] option')
      .allTextContents()
      .catch(() => [])
    const withBooth = optionTexts.find(t => t.includes(sponsorWithBooth.name))
    yes(Boolean(withBooth) && withBooth.includes(sponsorWithBooth.boothNumber),
      'the company list shows the booth number',
      `entry for ${sponsorWithBooth.name} was ${JSON.stringify(withBooth ?? null)}, booth is ${sponsorWithBooth.boothNumber}`)

    if (!sponsorWithoutBooth) {
      no('a company with no booth number is still listed, and says so',
        'NOT RUN — the seeded data has no exhibiting company without a booth number')
    } else {
      const without = optionTexts.find(t => t.includes(sponsorWithoutBooth.name))
      yes(Boolean(without) && /no booth number/i.test(without),
        'a company with no booth number is still listed, and says so',
        `entry was ${JSON.stringify(without ?? null)}`)
    }

    // Leave the screen as section 5 expects to find it: no form, no selection.
    await editor.locator('[data-testid="draft-cancel"]').click()
    const draftsLeft = await editor.locator('[data-testid="draft-pin"]').count()
    yes(draftsLeft === 0, 'cancelling the form leaves no marker behind', `${draftsLeft} draft(s) still shown`)
  }

  // ═══ 5. A room marker with a typed name ═══════════════════════════════════
  section('5. A room marker with a typed name (FP 27)')

  const ROOM_LABELS = [
    'a room marker stores the typed name',
    'and links to no company',
    'a room with an empty name is refused at the address',
    'and the refusal names what is missing',
    'a room cannot be linked to a company',
  ]
  let roomPinId = null

  if (!orgReady || !editorOpen || !canvasBox) {
    notRun(ROOM_LABELS, 'the marker editor was not usable')
  } else {
    const canvas = editor.locator('[data-testid="marker-canvas"]')
    await canvas.click({ position: { x: Math.round(canvasBox.width * 0.2), y: Math.round(canvasBox.height * 0.8) } })
    await editor.locator('[data-testid="draft-type-room"]').click()
    await editor.locator('[data-testid="draft-label"]').fill('Ballroom A')
    await editor.locator('[data-testid="draft-save"]').click()
    await org.waitForFunction(
      () => document.querySelectorAll('[data-testid="admin-pin"][data-pin-type="ROOM"]').length === 1,
      null,
      { timeout: 15_000 },
    ).catch(() => {})

    const room = db.prepare(`SELECT id, type, label, sponsorId FROM Pin WHERE venueMapId = ? AND type = 'ROOM'`).get(MAP_ID)
    yes(room?.label === 'Ballroom A', ROOM_LABELS[0], `got ${JSON.stringify(room ?? null)}`)
    yes(room ? room.sponsorId === null : false, ROOM_LABELS[1], `sponsorId=${room?.sponsorId}`)
    if (room) {
      roomPinId = room.id
      createdPinIds.push(room.id)
    }

    // At the address, because the screen is not where the rule lives. A request that
    // did not come from the screen has to be refused too.
    const emptyRoom = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'ROOM', x: 10, y: 10, label: '   ' },
      failOnStatusCode: false,
    })
    yes(emptyRoom.status() === 400, ROOM_LABELS[2], `got HTTP ${emptyRoom.status()}`)
    const emptyRoomBody = await emptyRoom.text()
    yes(/room/i.test(emptyRoomBody) && /name/i.test(emptyRoomBody), ROOM_LABELS[3],
      `body was ${JSON.stringify(emptyRoomBody.slice(0, 160))}`)

    const roomWithCompany = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'ROOM', x: 10, y: 10, label: 'Should Not Exist', sponsorId: sponsorWithBooth.id },
      failOnStatusCode: false,
    })
    yes(roomWithCompany.status() === 400, ROOM_LABELS[4], `got HTTP ${roomWithCompany.status()}`)
  }

  // ═══ 6. Moving a marker: select, then click the destination ════════════════
  section('6. Moving a marker by selecting it and clicking elsewhere (FP 28)')

  const MOVE_LABELS = [
    'clicking a marker selects it',
    'clicking the picture then moves the selected marker there',
    'and the other marker did not move',
    'with nothing selected, clicking the picture starts a NEW marker instead of moving one',
  ]

  if (!orgReady || !editorOpen || !canvasBox || !boothPinId || !roomPinId) {
    notRun(MOVE_LABELS, 'both a booth and a room marker were needed and not both exist')
  } else {
    const canvas = editor.locator('[data-testid="marker-canvas"]')
    const roomBefore = db.prepare(`SELECT x, y FROM Pin WHERE id = ?`).get(roomPinId)

    const booth = editor.locator(`[data-testid="admin-pin"][data-pin-id="${boothPinId}"]`)
    await booth.click()
    yes(await booth.getAttribute('data-pin-selected') === 'true', MOVE_LABELS[0])

    await canvas.click({ position: { x: Math.round(canvasBox.width * 0.7), y: Math.round(canvasBox.height * 0.65) } })
    await org.waitForFunction(
      id => {
        const el = document.querySelector(`[data-testid="admin-pin"][data-pin-id="${id}"]`)
        return el && Math.abs(Number(el.getAttribute('data-pin-x')) - 70) <= 3
      },
      boothPinId,
      { timeout: 15_000 },
    ).catch(() => {})

    const moved = db.prepare(`SELECT x, y FROM Pin WHERE id = ?`).get(boothPinId)
    yes(Math.abs(moved.x - 70) <= 3 && Math.abs(moved.y - 65) <= 3, MOVE_LABELS[1],
      `stored x=${moved.x} y=${moved.y}, clicked 70/65`)

    // The counterpart: a move that moved everything would satisfy the assertion
    // above just as well.
    const roomAfter = db.prepare(`SELECT x, y FROM Pin WHERE id = ?`).get(roomPinId)
    yes(roomAfter.x === roomBefore.x && roomAfter.y === roomBefore.y, MOVE_LABELS[2],
      `room went from ${roomBefore.x}/${roomBefore.y} to ${roomAfter.x}/${roomAfter.y}`)

    // Nothing selected now, because a successful move clears the selection.
    const countBefore = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE venueMapId = ?`).get(MAP_ID).n
    await canvas.click({ position: { x: Math.round(canvasBox.width * 0.5), y: Math.round(canvasBox.height * 0.15) } })
    const draftAppeared = await editor.locator('[data-testid="draft-pin"]').count()
    const countAfter = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE venueMapId = ?`).get(MAP_ID).n
    yes(draftAppeared === 1 && countAfter === countBefore, MOVE_LABELS[3],
      `drafts=${draftAppeared}, stored markers went ${countBefore} -> ${countAfter}`)
    await editor.locator('[data-testid="draft-cancel"]').click()
  }

  // ═══ 7. A saved marker reaches the delegate, cache primed first ════════════
  section('7. A saved marker reaches the delegate with the cache primed (FP 30)')

  const REACH_LABELS = [
    'the delegate can read the map before the write, which primes the cache',
    'a marker placed afterwards reaches the delegate without waiting out the cache',
    'showing the exhibiting company name',
    'and that company booth number',
    'at the placed position',
    'and the response says delegates were notified, so the screen can tell the truth',
  ]

  if (!delReady || !orgReady) {
    notRun(REACH_LABELS, delReady ? 'could not sign in as the organizer' : 'could not sign in as the delegate')
  } else {
    // Priming with the signed-in delegate session, through the same gated path the
    // product uses. A server-to-server read would be refused by middleware.
    const primed = await delegateMap(del)
    yes(primed.status === 200, REACH_LABELS[0], `got HTTP ${primed.status}`)

    const created = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'BOOTH', x: 55.5, y: 44.25, sponsorId: sponsorWithBooth.id },
      failOnStatusCode: false,
    })
    if (created.status() !== 201) {
      notRun(REACH_LABELS.slice(1), `the marker could not be created — HTTP ${created.status()}`)
    } else {
      const createdBody = await created.json()
      const madeId = createdBody.pin.id
      createdPinIds.push(madeId)
      yes(createdBody.delegatesNotified === true, REACH_LABELS[5],
        `delegatesNotified was ${JSON.stringify(createdBody.delegatesNotified)} — the participant app is reachable here, so true is the honest answer`)

      const after = await delegateMap(del)
      const mine = after.body?.maps?.find(m => m.id === MAP_ID)
      const found = mine?.pins?.find(p => p.id === madeId) ?? null
      yes(found !== null, REACH_LABELS[1],
        `the map carried ${mine?.pins?.length ?? 0} markers and none was ${madeId} — if the invalidation did not fire this stays stale for up to 300s`)
      if (found) {
        yes(found.label === sponsorWithBooth.name, REACH_LABELS[2], `label was ${JSON.stringify(found.label)}`)
        yes(found.sponsor?.boothNumber === sponsorWithBooth.boothNumber, REACH_LABELS[3],
          `booth was ${JSON.stringify(found.sponsor?.boothNumber)}`)
        yes(Math.abs(found.x - 55.5) < 0.01 && Math.abs(found.y - 44.25) < 0.01, REACH_LABELS[4],
          `delegate saw x=${found.x} y=${found.y}`)
      } else {
        notRun(REACH_LABELS.slice(2), 'the marker never reached the delegate')
      }
    }
  }

  // ═══ 7b. A booth marker is never an unlabelled dot ════════════════════════
  section('7b. A booth marker with no booth number shows the company name')

  const FALLBACK_LABELS = [
    'a booth marker for a company with no booth number shows the company name',
    'and one for a company WITH a booth number still shows the booth number',
  ]

  // Found on 2026-08-03 by placing a marker for a company that has no booth number
  // and looking at the delegate's screen: the marker was a blank circle, because the
  // marker rendered `boothNumber ?? '•'`. The only way to learn whose booth it was,
  // was to tap it. That is what an organiser produces whenever an exhibitor is
  // placed before booth numbers are assigned.
  //
  // Asserted on the RENDERED marker rather than on the map response, because the
  // response always carried the name — the defect was only in what was drawn.
  if (!orgReady || !delReady) {
    notRun(FALLBACK_LABELS, delReady ? 'could not sign in as the organizer' : 'could not sign in as the delegate')
  } else if (!sponsorWithoutBooth) {
    notRun(FALLBACK_LABELS, 'the seeded data has no exhibiting company without a booth number')
  } else {
    const placed = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'BOOTH', x: 22, y: 66, sponsorId: sponsorWithoutBooth.id },
      failOnStatusCode: false,
    })
    if (placed.status() !== 201) {
      notRun(FALLBACK_LABELS, `could not place a marker for a company with no booth number — HTTP ${placed.status()}`)
    } else {
      createdPinIds.push((await placed.json()).pin.id)
      try {
        await del.goto(`${ATTENDEE_BASE}/map`, { waitUntil: 'domcontentloaded' })
        // The fixture map is not the one shown first, so switch to it by name.
        await del.locator('[data-testid="map-tab"]', { hasText: MAP_NAME }).first().click({ timeout: 15_000 })

        const noBooth = del.locator(`[data-testid="pin"][data-pin-sponsor="${sponsorWithoutBooth.id}"]`).first()
        await noBooth.waitFor({ timeout: 15_000 })
        const noBoothText = ((await noBooth.textContent()) ?? '').trim()
        yes(noBoothText === sponsorWithoutBooth.name, FALLBACK_LABELS[0],
          `the marker read ${JSON.stringify(noBoothText)}, expected ${JSON.stringify(sponsorWithoutBooth.name)} — a bullet means the unfixed rendering`)

        // The counterpart. Replacing every booth number with a company name would
        // satisfy the assertion above and break the map for the ten seeded booths.
        const withBooth = del.locator(`[data-testid="pin"][data-pin-sponsor="${sponsorWithBooth.id}"]`).first()
        await withBooth.waitFor({ timeout: 15_000 })
        const withBoothText = ((await withBooth.textContent()) ?? '').trim()
        yes(withBoothText === sponsorWithBooth.boothNumber, FALLBACK_LABELS[1],
          `the marker read ${JSON.stringify(withBoothText)}, expected ${JSON.stringify(sponsorWithBooth.boothNumber)}`)
      } catch (err) {
        notRun(FALLBACK_LABELS, String(err?.message ?? err).split('\n')[0])
      }
    }
  }

  // ═══ 7c. A BLANK booth number is treated as no booth number ═══════════════
  section('7c. A blank booth number falls back to the company name too')

  const BLANK_LABELS = [
    'a booth marker whose company has a NULL booth number shows the company name',
    'and one whose company has an EMPTY-STRING booth number shows it too',
    'and one whose company has a WHITESPACE-ONLY booth number shows it too',
    'and the same marker still shows a real booth number once one is set',
    // Round 6 found the marker and the CARD disagreeing about the same field. The
    // marker had been fixed and the card still read the raw value, so a whitespace
    // booth number drew the company name on the marker and then a card reading
    // "Stand" with nothing after it. Asserted on the card, which no assertion in
    // this suite had opened for a blank booth number.
    'and tapping a blank-booth marker opens a card with no empty Stand line',
    'while a company WITH a booth number still shows its Stand line on the card',
  ]

  // Raised by adversarial review round 4, and it is a defect in section 7b's own fix.
  //
  // The pill chose its width by truthiness — `boothNumber ? 'min-w-7' : 'max-w-[6.5rem]'`
  // — and its text by nullishness — `boothNumber ?? pin.label`. Those two disagree for
  // the empty string: '' is falsy so the pill took the wide branch, and '' is not
  // nullish so the pill rendered nothing. The result is a blank pill, which is the
  // very thing 7b exists to have removed, reached by a different value.
  //
  // The empty string is not a hypothetical value. `apps/sponsor/components/ProfileEditor.tsx`
  // starts the booth-number field at `sponsor.boothNumber ?? ''` and sends it on every
  // save, and `apps/sponsor/app/api/profile/route.ts` writes a submitted value as-is
  // with no trimming. So a company with no booth number is stored as '' the first time
  // its representative saves their profile for any reason at all — changing a tagline
  // is enough. Ten of the twenty seeded exhibiting companies have no booth number.
  //
  // All four cases are read off the RENDERED marker for the same reason as 7b: the map
  // response always carried the company name, and the defect was only in what was drawn.
  //
  // Rewrites only `BLANK_SPONSOR_ID`, a company this suite created.
  if (!orgReady || !delReady) {
    notRun(BLANK_LABELS, delReady ? 'could not sign in as the organizer' : 'could not sign in as the delegate')
  } else {
    // Placed at y=25, which no case reuses, so the first case's move to y=30 is a
    // real change rather than a write of the value already there.
    const placed = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'BOOTH', x: 78, y: 25, sponsorId: BLANK_SPONSOR_ID },
      failOnStatusCode: false,
    })
    if (placed.status() !== 201) {
      notRun(BLANK_LABELS, `could not place a marker for the fixture company — HTTP ${placed.status()}`)
    } else {
      const blankPinId = (await placed.json()).pin.id
      createdPinIds.push(blankPinId)

      // The fourth case is the counterpart: treating every value as blank would
      // satisfy the first three and break the ten seeded booths.
      //
      // Each case also carries a DIFFERENT y, and the y is what makes the case
      // provable. Adversarial review round 5 raised it as a high finding: the three
      // blank cases all expect the same text, so if the participant app's cache stopped
      // being cleared, cases two and three would re-read case one's render — which
      // shows the same company name — and pass while measuring nothing. The y proves
      // the render is this case's. Reading the same name from a marker at the previous
      // case's position is now a failure.
      const CASES = [
        [null, BLANK_SPONSOR_NAME, BLANK_LABELS[0], 30],
        ['', BLANK_SPONSOR_NAME, BLANK_LABELS[1], 31],
        ['   ', BLANK_SPONSOR_NAME, BLANK_LABELS[2], 32],
        ['Z-42', 'Z-42', BLANK_LABELS[3], 33],
      ]

      for (const [stored, expected, label, y] of CASES) {
        try {
          db.prepare(`UPDATE Sponsor SET boothNumber = ? WHERE id = ?`).run(stored, BLANK_SPONSOR_ID)
          // The participant read is cached under the `floor-plan` tag, so a direct
          // database write to the Sponsor row is invisible to it until something clears
          // the tag. Cleared through the product's own path by moving this suite's own
          // marker, which is the PATCH handler and therefore calls
          // revalidateAttendeeFloorPlan. Chosen over creating a throwaway marker per
          // case so this section adds exactly one row.
          //
          // The move's own answer is checked rather than discarded. An unchecked
          // clearing step is how an assertion comes to pass on stale data.
          const moved = await org.request.patch(PIN_URL(MAP_ID, blankPinId), {
            data: { x: 78, y },
            failOnStatusCode: false,
          })
          if (moved.status() !== 200) {
            no(label, `the cache-clearing move answered HTTP ${moved.status()}, so this case never had fresh data to read`)
            continue
          }
          const movedBody = await moved.json().catch(() => ({}))
          if (movedBody.delegatesNotified !== true) {
            no(label, `the move reported delegatesNotified ${JSON.stringify(movedBody.delegatesNotified)}, so the participant cache was not cleared and a stale render would be read`)
            continue
          }

          await del.goto(`${ATTENDEE_BASE}/map`, { waitUntil: 'domcontentloaded' })
          await del.locator('[data-testid="map-tab"]', { hasText: MAP_NAME }).first().click({ timeout: 15_000 })
          const marker = del.locator(`[data-testid="pin"][data-pin-sponsor="${BLANK_SPONSOR_ID}"]`).first()
          await marker.waitFor({ timeout: 15_000 })
          const drawnY = Number(await marker.getAttribute('data-pin-y'))
          const drawn = ((await marker.textContent()) ?? '').trim()
          yes(drawnY === y && drawn === expected, label,
            `stored ${JSON.stringify(stored)}, the marker read ${JSON.stringify(drawn)} at y=${drawnY}, expected ${JSON.stringify(expected)} at y=${y}` +
            (drawnY !== y ? ' — the wrong y means a stale render, so the text proves nothing' : ''))
        } catch (err) {
          no(label, String(err?.message ?? err).split('\n')[0])
        }
      }

      // ── The CARD is a second reader of the same field, and it disagreed ──────
      //
      // Round 6 of the review found the marker fixed and the card not: the card
      // rendered its Stand line from the raw value, so a whitespace-only booth
      // number is truthy there. The delegate saw the company name on the marker,
      // tapped it, and got a card reading "Stand" with nothing after it.
      //
      // Checked with the company at whitespace, which is the reaching value, and
      // paired with a company that HAS a booth number — because hiding the Stand
      // line for everybody would satisfy the first of these and break the card for
      // the ten seeded booths.
      try {
        db.prepare(`UPDATE Sponsor SET boothNumber = '   ' WHERE id = ?`).run(BLANK_SPONSOR_ID)
        const nudged = await org.request.patch(PIN_URL(MAP_ID, blankPinId), {
          data: { x: 78, y: 34 },
          failOnStatusCode: false,
        })
        const nudgedBody = await nudged.json().catch(() => ({}))
        if (nudged.status() !== 200 || nudgedBody.delegatesNotified !== true) {
          no(BLANK_LABELS[4], `the cache-clearing move answered HTTP ${nudged.status()} with delegatesNotified ${JSON.stringify(nudgedBody.delegatesNotified)}`)
          no(BLANK_LABELS[5], 'NOT RUN — the paired case above could not be measured')
        } else {
          await del.goto(`${ATTENDEE_BASE}/map`, { waitUntil: 'domcontentloaded' })
          await del.locator('[data-testid="map-tab"]', { hasText: MAP_NAME }).first().click({ timeout: 15_000 })

          const blankMarker = del.locator(`[data-testid="pin"][data-pin-sponsor="${BLANK_SPONSOR_ID}"]`).first()
          await blankMarker.waitFor({ timeout: 15_000 })
          const freshY = Number(await blankMarker.getAttribute('data-pin-y'))
          await blankMarker.click()
          await del.locator('[data-testid="booth-card"]').waitFor({ timeout: 15_000 })
          const standCount = await del.locator('[data-testid="booth-card-booth"]').count()
          const standText = standCount > 0
            ? ((await del.locator('[data-testid="booth-card-booth"]').first().textContent()) ?? '').trim()
            : null
          // Absent is the right answer. Present-but-blank is the defect, and
          // present-with-"Stand"-and-nothing-else is how it reads on screen.
          const cardClean = freshY === 34 && (standCount === 0 || /\S/.test(standText.replace(/^Stand\s*/, '')))
          yes(cardClean, BLANK_LABELS[4],
            freshY !== 34
              ? `read a stale card: marker was at y=${freshY}, expected 34`
              : `the card showed a Stand line reading ${JSON.stringify(standText)} for a company whose booth number is whitespace`)

          await del.locator('[data-testid="booth-card-close"]').click()
          await del.locator('[data-testid="booth-card"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})

          const realMarker = del.locator(`[data-testid="pin"][data-pin-sponsor="${sponsorWithBooth.id}"]`).first()
          await realMarker.waitFor({ timeout: 15_000 })
          await realMarker.click()
          await del.locator('[data-testid="booth-card"]').waitFor({ timeout: 15_000 })
          const realStand = ((await del.locator('[data-testid="booth-card-booth"]').first().textContent()) ?? '').trim()
          yes(realStand.includes(sponsorWithBooth.boothNumber), BLANK_LABELS[5],
            `the card read ${JSON.stringify(realStand)}, expected it to name ${JSON.stringify(sponsorWithBooth.boothNumber)}`)
          await del.locator('[data-testid="booth-card-close"]').click().catch(() => {})
        }
      } catch (err) {
        no(BLANK_LABELS[4], String(err?.message ?? err).split('\n')[0])
        no(BLANK_LABELS[5], 'NOT RUN — the paired case above threw')
      }

      // ── Park the fixture in a state no case expects ────────────────────────
      //
      // Found by the negative control for the freshness check above, and it is the
      // reason that control was worth running. With the invalidation reporting
      // success while clearing nothing, three of the four cases failed on the wrong
      // y as predicted — and the FOURTH passed, reading `Z-42` at y=33 from a cache
      // that had not been cleared at all. `Z-42` at y=33 is exactly the state the
      // PREVIOUS run of this suite left behind, because it is the last case's state,
      // and cleanup deletes the rows without clearing the tag the participant app
      // reads. So the counterpart assertion could be satisfied entirely by a stale
      // render from the run before.
      //
      // Parking the company at no booth number and the marker at y=40 means a stale
      // render carries a position no case expects, so every case fails on y rather
      // than one of them passing by coincidence. This costs one request.
      db.prepare(`UPDATE Sponsor SET boothNumber = NULL WHERE id = ?`).run(BLANK_SPONSOR_ID)
      await org.request.patch(PIN_URL(MAP_ID, blankPinId), {
        data: { x: 78, y: 40 },
        failOnStatusCode: false,
      })
    }
  }

  // ═══ 7d. An ALREADY-OPEN delegate screen updates itself ═══════════════════
  section('7d. A marker reaches a screen nobody touches (the live push)')

  const PUSH_LABELS = [
    'the delegate phone opens a connection to be told about changes',
    'a marker placed by an organizer appears on a screen nobody touches',
    'and it arrived by the push rather than by the safety-net timer',
  ]

  // ── What this adds that section 7 does not ─────────────────────────────────
  //
  // Section 7 proves a marker reaches a delegate who LOADS the map screen, past the
  // cache. This proves the harder and more visible case: the delegate already has
  // the map open, an organizer places a marker, and the screen redraws with nobody
  // touching the phone. That is what happens during a demonstration.
  //
  // It was Residual 2 of this phase's smoketest document and was carried unproven
  // on the grounds that the machinery is shared with map changes, which Phase 10
  // measured at 41 ms. Shared machinery is a reason to expect it works; this
  // project's record is that the untested half of a symmetrical pair is exactly
  // where the defects have been — round 1 of this phase's own review found a fix
  // applied to one of two matching write paths, and round 3 found the same again.
  // So it is measured rather than assumed. Added 2026-08-04.
  //
  // Deliberately follows the shape Phase 10 arrived at after getting it wrong once,
  // recorded at docs/smoketests/playwright/phase-10-admin-map-upload.mjs § 12:
  //
  //   1. Arm the wait for the connection BEFORE navigating. Phase 10's first
  //      version waited for the screen's container, which is also present on the
  //      loading and error states, so it wrote the change before the browser had
  //      opened its connection. The push then reached nobody, the screen sat on old
  //      data until the 30-second safety net rescued it, and it read as the push
  //      being broken when the push had never been given anyone to deliver to.
  //   2. Wait for the map switcher, which renders only once map data has arrived,
  //      so the screen is genuinely up rather than still loading.
  //   3. Measure the DELAY, because the 30-second refetch timer would also make the
  //      marker appear eventually. Under 5 seconds is the push; slower is the timer
  //      doing the work while this assertion takes the credit.
  if (!delReady || !orgReady) {
    notRun(PUSH_LABELS, delReady ? 'could not sign in as the organizer' : 'could not sign in as the delegate')
  } else {
    // A fresh delegate browser, so this starts from a screen that has never been
    // interacted with rather than one earlier sections have clicked around.
    const watcherCtx = await browser.newContext()
    const watcher = await watcherCtx.newPage()
    try {
      await signIn(watcher, DELEGATE_EMAIL, ATTENDEE_BASE)

      const streamOpened = watcher
        .waitForRequest(r => r.url().includes('/api/data/map/stream'), { timeout: 30_000 })
        .catch(() => null)

      await watcher.goto(`${ATTENDEE_BASE}/map`, { waitUntil: 'domcontentloaded' })
      await watcher.locator('[data-testid="map-switcher"]').first()
        .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
      const connected = await streamOpened
      yes(!!connected, PUSH_LABELS[0], 'no request to /api/data/map/stream was made')

      // The fixture map has to be the one on screen, since a marker is drawn only on
      // its own map. This is the LAST interaction with this browser.
      await watcher.locator('[data-testid="map-tab"]', { hasText: MAP_NAME }).first()
        .click({ timeout: 15_000 })

      const PUSH_ROOM = 'Phase 11 Live Push Room'
      const drawn = watcher.locator(`[data-testid="pin-label"]`, { hasText: PUSH_ROOM })
      const before = await drawn.count()

      // ── Nothing touches the delegate browser from here on ──────────────────
      const started = Date.now()
      const placed = await org.request.post(PINS_URL(MAP_ID), {
        data: { type: 'ROOM', x: 12, y: 88, label: PUSH_ROOM },
        failOnStatusCode: false,
      })
      if (placed.status() === 201) createdPinIds.push((await placed.json()).pin.id)

      let appeared = false
      let ms = 0
      if (placed.status() === 201) {
        try {
          await drawn.first().waitFor({ state: 'visible', timeout: 20_000 })
          appeared = true
        } catch {
          appeared = false
        }
        ms = Date.now() - started
      }

      yes(before === 0 && placed.status() === 201 && appeared, PUSH_LABELS[1],
        `placing the marker answered HTTP ${placed.status()}; after ${ms}ms the screen ${appeared ? 'showed it' : 'had not changed'}` +
        (before !== 0 ? ` — the name was already on screen ${before} time(s), so this proves nothing` : ''))

      if (appeared) {
        yes(ms < 5_000, PUSH_LABELS[2],
          `took ${ms}ms — over 5s means the push did not fire and the 30s refetch timer did the work`)
        console.log(`    measured: appeared on an untouched screen in ${ms}ms`)
      } else {
        notRun([PUSH_LABELS[2]], 'nothing appeared on the screen, so there is no delay to attribute')
      }
    } catch (err) {
      no(PUSH_LABELS[1], String(err?.message ?? err).split('\n')[0])
    } finally {
      await watcherCtx.close()
    }
  }

  // ═══ 8. Deleting a marker ═════════════════════════════════════════════════
  section('8. Deleting a marker (FP 28)')

  const DELETE_LABELS = [
    'deleting a marker through the screen removes it from the database',
    'and leaves the other markers alone',
    'and the delegate stops seeing it',
  ]

  if (!orgReady || !editorOpen || !roomPinId) {
    notRun(DELETE_LABELS, 'no room marker existed to delete')
  } else {
    const before = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE venueMapId = ?`).get(MAP_ID).n
    await editor.locator(`[data-testid="admin-pin"][data-pin-id="${roomPinId}"]`).click()
    await editor.locator('[data-testid="delete-pin"]').click()
    await editor.locator('[data-testid="delete-pin-confirm"]').click()
    await org.waitForFunction(
      id => !document.querySelector(`[data-testid="admin-pin"][data-pin-id="${id}"]`),
      roomPinId,
      { timeout: 15_000 },
    ).catch(() => {})

    const gone = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE id = ?`).get(roomPinId).n
    yes(gone === 0, DELETE_LABELS[0], `${gone} row(s) still present`)
    const after = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE venueMapId = ?`).get(MAP_ID).n
    yes(after === before - 1, DELETE_LABELS[1], `markers went ${before} -> ${after}, expected ${before - 1}`)

    if (!delReady) {
      no(DELETE_LABELS[2], 'NOT RUN — could not sign in as the delegate')
    } else {
      const seen = await delegateMap(del)
      const mine = seen.body?.maps?.find(m => m.id === MAP_ID)
      yes(!(mine?.pins ?? []).some(p => p.id === roomPinId), DELETE_LABELS[2],
        `the delegate still sees marker ${roomPinId}`)
    }
  }

  // ═══ 9. The permission key, at the address and not only the screen ════════
  section('9. The floor-plan permission is enforced at all three marker addresses')

  // Named rather than positional. Adding the picture assertion to this group made
  // two different checks both claim index 7, which is the kind of mistake a list of
  // strings indexed by number invites. Names cannot collide silently.
  const PERM = {
    revoke: 'the floor-plan permission can be revoked for staff through the app',
    create: 'creating a marker is refused when the permission is revoked',
    move: 'moving a marker is refused when the permission is revoked',
    remove: 'deleting a marker is refused when the permission is revoked',
    picture: 'the map picture is refused when the permission is revoked',
    unchanged: 'the refusals changed nothing',
    positive: 'and the SAME three requests succeed for a role that holds the permission',
    restored: 'the staff role’s description and permissions are restored to what they were',
    behaviour: 'and staff can use the feature again, so the app’s cached permissions were cleared too',
  }
  const PERM_LABELS = Object.values(PERM)
  /** The ones that need a signed-in staff session, so they are named together. */
  const PERM_STAFF_LABELS = [PERM.create, PERM.move, PERM.remove, PERM.picture, PERM.unchanged, PERM.positive]

  if (!orgReady || !boothPinId) {
    notRun(PERM_LABELS, 'needed an organizer session and an existing marker')
  } else try {
    // ── Revoked through the app's own save path, never by writing the row ─────
    //
    // Role permissions resolve through a cache that only the save path clears. Phase
    // 10's first attempt inserted the RolePermission row directly, the app kept
    // serving the previous permissive answer, every refusal assertion "failed", and
    // the delete it had aimed at a seeded map destroyed the exhibit hall and its ten
    // markers. Twice. PUT /api/roles is the path a person uses.
    const withoutFloorPlan = [
      'calendar', 'agenda', 'speakers', 'meetings', 'timeBlocks',
      'attendees', 'staff', 'sponsors', 'chat', 'email',
    ]
    const revoked = await org.request.put(`${ADMIN_BASE}/api/roles`, {
      data: { role: 'STAFF', description: 'Phase 11 check: floor plan revoked', permissions: withoutFloorPlan },
      failOnStatusCode: false,
    })
    yes(revoked.status() === 200, PERM.revoke, `got HTTP ${revoked.status()}`)

    const staffCtx = await browser.newContext()
    const staff = await staffCtx.newPage()
    let staffIn = true
    try {
      await signIn(staff, STAFF_EMAIL, ADMIN_BASE)
    } catch (err) {
      staffIn = false
      notRun(PERM_STAFF_LABELS, `could not sign in as staff — ${String(err?.message ?? err).split('\n')[0]}`)
    }

    if (staffIn) {
      const create = await staff.request.post(PINS_URL(MAP_ID), {
        data: { type: 'BOOTH', x: 5, y: 5, sponsorId: sponsorWithBooth.id },
        failOnStatusCode: false,
      })
      yes(create.status() === 403, PERM.create, `got HTTP ${create.status()}`)

      const patch = await staff.request.patch(PIN_URL(MAP_ID, boothPinId), {
        data: { x: 1, y: 1 },
        failOnStatusCode: false,
      })
      yes(patch.status() === 403, PERM.move, `got HTTP ${patch.status()}`)

      // Aimed at a marker THIS FILE created, never a seeded one.
      const remove = await staff.request.delete(PIN_URL(MAP_ID, boothPinId), { failOnStatusCode: false })
      yes(remove.status() === 403, PERM.remove, `got HTTP ${remove.status()}`)

      // The picture address carries the same permission key as the three marker
      // addresses, and this is where there is a role without it. Its positive
      // counterpart is section 2's 200 for the organizer — the same address, the
      // same map, differing only by who is asking.
      const pic = await staff.request.get(IMAGE_URL(MAP_ID), { failOnStatusCode: false })
      yes(pic.status() === 403, PERM.picture, `got HTTP ${pic.status()}`)

      const survived = db.prepare(`SELECT x, y FROM Pin WHERE id = ?`).get(boothPinId)
      const leaked = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE venueMapId = ? AND x = 5 AND y = 5`).get(MAP_ID).n
      yes(Boolean(survived) && Math.abs(survived.x - 70) <= 3 && leaked === 0, PERM.unchanged,
        `marker ${survived ? `at ${survived.x}/${survived.y}` : 'DELETED'}, ${leaked} leaked row(s)`)

      // ── The positive counterpart ────────────────────────────────────────────
      //
      // Three 403s prove nothing on their own: an address that refused everyone
      // would produce exactly the same three. The organizer holds the permission, so
      // the identical three requests must succeed.
      const okCreate = await org.request.post(PINS_URL(MAP_ID), {
        data: { type: 'BOOTH', x: 6, y: 6, sponsorId: sponsorWithBooth.id },
        failOnStatusCode: false,
      })
      let okPatch = { status: () => 0 }
      let okDelete = { status: () => 0 }
      if (okCreate.status() === 201) {
        const id = (await okCreate.json()).pin.id
        createdPinIds.push(id)
        okPatch = await org.request.patch(PIN_URL(MAP_ID, id), { data: { x: 7, y: 7 }, failOnStatusCode: false })
        okDelete = await org.request.delete(PIN_URL(MAP_ID, id), { failOnStatusCode: false })
      }
      yes(okCreate.status() === 201 && okPatch.status() === 200 && okDelete.status() === 200, PERM.positive,
        `create ${okCreate.status()}, move ${okPatch.status()}, delete ${okDelete.status()}`)
    }

    await staffCtx.close()
  } finally {
    // ── Restored in a finally, and then CHECKED against the snapshot ──────────
    //
    // A finally because an exception anywhere between the revoke and here used to
    // skip the restore entirely, leaving staff without the floor-plan permission for
    // every later suite and for anyone using the app afterwards.
    //
    // Compared to the snapshot rather than to a condition about whether a row
    // existed. The old assertion was true whenever a row had existed beforehand,
    // which is exactly the case where getting the restore wrong does harm.
    const savedThroughApp = await restoreStaffRole(org)
    const restored = staffRoleMatchesSnapshot()
    const now = db.prepare(`SELECT permissions FROM RolePermission WHERE role = 'STAFF'`).get() ?? null
    yes(restored && savedThroughApp, PERM.restored,
      !savedThroughApp
        ? 'the restore did not go through PUT /api/roles, so the app’s cached permissions were not cleared'
        : staffRoleSnapshot === null
          ? `there was no staff row before and there is one now: ${JSON.stringify(now?.permissions ?? null)}`
          : `expected ${JSON.stringify(staffRoleSnapshot.permissions)}, found ${JSON.stringify(now?.permissions ?? null)}`)

    // ── The assertion round 3 asked for: behaviour, not rows ──────────────────
    //
    // A restored row proves nothing about the RUNNING app, which reads permissions
    // through a cache. This signs in as staff again and uses the feature. If the
    // cache still holds the revoked configuration, this is a 403 and the suite says
    // so — which the row check on its own cannot.
    try {
      const afterCtx = await browser.newContext()
      const afterPage = await afterCtx.newPage()
      await signIn(afterPage, STAFF_EMAIL, ADMIN_BASE)
      const afterRes = await afterPage.request.post(PINS_URL(MAP_ID), {
        data: { type: 'ROOM', x: 33, y: 33, label: 'Staff Restored' },
        failOnStatusCode: false,
      })
      if (afterRes.status() === 201) createdPinIds.push((await afterRes.json()).pin.id)
      yes(afterRes.status() === 201, PERM.behaviour,
        `got HTTP ${afterRes.status()} — a 403 means the running app is still enforcing the revoked permission`)
      await afterCtx.close()
    } catch (err) {
      no(PERM.behaviour, String(err?.message ?? err).split('\n')[0])
    }
  }

  // ═══ 10. Conference scoping, on all three addresses ═══════════════════════
  section('10. Every marker address is scoped to the active conference')

  const SCOPE_LABELS = [
    'creating a marker on another conference’s map answers 404',
    'moving a marker on another conference’s map answers 404',
    'deleting a marker on another conference’s map answers 404',
    'and that map still has its marker',
    'a company from another conference cannot be put on a booth marker',
    'while a company from THIS conference can',
    'a marker id belonging to a different map answers 404',
    // ── Added after negative control 4, which predicted 3 failures and caused 2 ──
    //
    // The missing one was a coverage gap rather than a wrong control. With both the
    // resolve() guard and the conditional write removed, the cross-map request below
    // DOES write to the other conference's marker — and then the read-back, which is
    // still scoped to the named map, finds nothing and answers 404. So the response
    // looks exactly correct while another event's marker has already been moved.
    //
    // The check that the other conference's marker is untouched runs earlier in this
    // section, BEFORE the attempt, so nothing looked afterwards. A 404 is not
    // evidence that nothing was written.
    'and the cross-map attempt wrote nothing to the other conference’s marker',
  ]

  if (!orgReady) {
    notRun(SCOPE_LABELS, 'could not sign in as the organizer')
  } else {
    // A marker on the other conference's map, written directly, so there is a real
    // row on the wrong side of the boundary for the move and delete to aim at.
    const otherPinId = 'phase11-other-pin'
    db.prepare(`DELETE FROM Pin WHERE id = ?`).run(otherPinId)
    db.prepare(
      `INSERT INTO Pin (id, venueMapId, type, label, x, y, createdAt) VALUES (?, ?, 'ROOM', 'Other Conference Room', 50, 50, ?)`,
    ).run(otherPinId, OTHER_MAP_ID, Date.now())

    const c = await org.request.post(PINS_URL(OTHER_MAP_ID), {
      data: { type: 'ROOM', x: 20, y: 20, label: 'Should Not Exist' },
      failOnStatusCode: false,
    })
    yes(c.status() === 404, SCOPE_LABELS[0], `got HTTP ${c.status()}`)

    const p = await org.request.patch(PIN_URL(OTHER_MAP_ID, otherPinId), { data: { x: 1, y: 1 }, failOnStatusCode: false })
    yes(p.status() === 404, SCOPE_LABELS[1], `got HTTP ${p.status()}`)

    const d = await org.request.delete(PIN_URL(OTHER_MAP_ID, otherPinId), { failOnStatusCode: false })
    yes(d.status() === 404, SCOPE_LABELS[2], `got HTTP ${d.status()}`)

    const still = db.prepare(`SELECT x, y FROM Pin WHERE id = ?`).get(otherPinId)
    yes(Boolean(still) && still.x === 50 && still.y === 50, SCOPE_LABELS[3],
      `marker ${still ? `at ${still.x}/${still.y}` : 'DELETED — another conference lost a marker'}`)

    const crossCompany = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'BOOTH', x: 15, y: 15, sponsorId: OTHER_SPONSOR_ID },
      failOnStatusCode: false,
    })
    yes(crossCompany.status() === 400, SCOPE_LABELS[4], `got HTTP ${crossCompany.status()}`)

    // The counterpart. Without it, a handler that rejected every company id would
    // pass the assertion above.
    const sameCompany = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'BOOTH', x: 16, y: 16, sponsorId: sponsorWithBooth.id },
      failOnStatusCode: false,
    })
    yes(sameCompany.status() === 201, SCOPE_LABELS[5], `got HTTP ${sameCompany.status()}`)
    if (sameCompany.status() === 201) createdPinIds.push((await sameCompany.json()).pin.id)

    // A marker that exists, named against a map it is not on.
    const wrongMap = await org.request.patch(PIN_URL(MAP_ID, otherPinId), { data: { x: 2, y: 2 }, failOnStatusCode: false })
    yes(wrongMap.status() === 404, SCOPE_LABELS[6], `got HTTP ${wrongMap.status()}`)

    // The refusal above is not enough on its own. Read the row.
    const stillAfter = db.prepare(`SELECT x, y FROM Pin WHERE id = ?`).get(otherPinId)
    yes(Boolean(stillAfter) && stillAfter.x === 50 && stillAfter.y === 50, SCOPE_LABELS[7],
      `marker ${stillAfter ? `at ${stillAfter.x}/${stillAfter.y}` : 'DELETED'} — a 404 answer does not prove nothing was written`)

    db.prepare(`DELETE FROM Pin WHERE id = ?`).run(otherPinId)
  }

  // ═══ 11. Long and unbroken room names ════════════════════════════════════
  section('11. A long or unbroken room name does not cover the map')

  const LABEL_LABELS = [
    `a room name over ${MAX_LABEL_LENGTH} characters is refused, naming the limit`,
    `a room name of exactly ${MAX_LABEL_LENGTH} characters is accepted`,
    'a long room name stays inside the picture',
    'an unbroken 60-character room name stays inside the picture',
  ]

  if (!orgReady || !editorOpen || !canvasBox) {
    notRun(LABEL_LABELS, 'the marker editor was not usable')
  } else {
    const tooLong = 'A'.repeat(MAX_LABEL_LENGTH + 1)
    const over = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'ROOM', x: 30, y: 30, label: tooLong },
      failOnStatusCode: false,
    })
    const overBody = await over.text()
    yes(over.status() === 400 && overBody.includes(String(MAX_LABEL_LENGTH)), LABEL_LABELS[0],
      `HTTP ${over.status()}, body ${JSON.stringify(overBody.slice(0, 160))}`)

    // Two names, both at the limit: one with spaces so it can wrap naturally, one
    // with none so it can only wrap if the markup allows it to.
    const spaced = 'General Session Ballroom Level Two East Wing Room Number 12'.slice(0, MAX_LABEL_LENGTH).padEnd(MAX_LABEL_LENGTH, 'x')
    const unbroken = 'B'.repeat(MAX_LABEL_LENGTH)

    const madeIds = []
    for (const [name, y] of [[spaced, 25], [unbroken, 60]]) {
      const r = await org.request.post(PINS_URL(MAP_ID), {
        data: { type: 'ROOM', x: 50, y, label: name },
        failOnStatusCode: false,
      })
      if (r.status() === 201) {
        const id = (await r.json()).pin.id
        madeIds.push({ id, name })
        createdPinIds.push(id)
      } else {
        no(`a ${MAX_LABEL_LENGTH}-character room name was accepted (${name === unbroken ? 'unbroken' : 'spaced'})`,
          `got HTTP ${r.status()} ${JSON.stringify((await r.text()).slice(0, 120))}`)
      }
    }
    yes(madeIds.length === 2, LABEL_LABELS[1], `${madeIds.length} of 2 were accepted`)

    if (madeIds.length !== 2) {
      notRun(LABEL_LABELS.slice(2), 'the long-name markers were not created')
    } else {
      // Reload so the new markers are drawn from the server rather than from local
      // state, then re-open the editor.
      await org.goto(`${ADMIN_BASE}/dashboard/floor-plan`, { waitUntil: 'domcontentloaded' })
      await settled(org)
      await org.locator(`[data-testid="map-row"][data-map-id="${MAP_ID}"] [data-testid="edit-markers"]`).click()
      const canvas = editor.locator('[data-testid="marker-canvas"]')
      const box = await canvas.boundingBox()

      for (const [i, made] of madeIds.entries()) {
        const el = editor.locator(`[data-testid="admin-pin"][data-pin-id="${made.id}"]`)
        const b = await el.boundingBox()
        const label = i === 0 ? LABEL_LABELS[2] : LABEL_LABELS[3]
        if (!b || !box) {
          no(label, 'the marker or the picture had no measurable box')
          continue
        }
        // Four pixels of tolerance for the marker's own border and shadow.
        const insideRight = b.x + b.width <= box.x + box.width + 4
        const insideLeft = b.x >= box.x - 4
        yes(insideRight && insideLeft, label,
          `marker spans ${Math.round(b.x)}..${Math.round(b.x + b.width)}, picture spans ${Math.round(box.x)}..${Math.round(box.x + box.width)}`)
      }
    }
  }

  // ═══ 12. What adversarial review round 1 found ═══════════════════════════
  section('12. Round 1’s three findings cannot come back')

  const R1_LABELS = [
    'a position sent as null is refused rather than saved as 0',
    'a position sent as an empty list, a boolean, or spaces is refused',
    'and a position sent as a real number is still accepted',
    'nothing was written by any of the refused positions',
    'deleting the same marker twice answers 404, not a server error',
    'moving a marker that has been deleted answers 404, not a server error',
    'a marker another organizer adds appears on a screen that has local edits',
  ]

  if (!orgReady) {
    notRun(R1_LABELS, 'could not sign in as the organizer')
  } else {
    // ── Round 1, medium: readPercent coerced anything Number() would take ────
    //
    // {"x": null} stored 0, so a marker landed in the top-left corner of the map at
    // a position nobody chose, and both the organizer and every delegate drew it
    // there. Nothing failed and nothing was logged.
    const beforeCount = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE venueMapId = ?`).get(MAP_ID).n

    const nullPos = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'ROOM', x: null, y: 10, label: 'Null Position' },
      failOnStatusCode: false,
    })
    yes(nullPos.status() === 400, R1_LABELS[0], `got HTTP ${nullPos.status()}`)

    const coercions = [
      { label: 'empty list', body: { type: 'ROOM', x: [], y: 10, label: 'Coerced A' } },
      { label: 'boolean', body: { type: 'ROOM', x: true, y: 10, label: 'Coerced B' } },
      { label: 'spaces', body: { type: 'ROOM', x: '  ', y: 10, label: 'Coerced C' } },
      { label: 'numeric string', body: { type: 'ROOM', x: '50', y: 10, label: 'Coerced D' } },
      { label: 'single-element list', body: { type: 'ROOM', x: [50], y: 10, label: 'Coerced E' } },
    ]
    const coercionResults = []
    for (const c of coercions) {
      const r = await org.request.post(PINS_URL(MAP_ID), { data: c.body, failOnStatusCode: false })
      coercionResults.push(`${c.label}=${r.status()}`)
    }
    yes(coercionResults.every(r => r.endsWith('=400')), R1_LABELS[1], coercionResults.join(' '))

    // The counterpart. Refusing every position would satisfy all of the above.
    const realNumber = await org.request.post(PINS_URL(MAP_ID), {
      data: { type: 'ROOM', x: 12.5, y: 87.5, label: 'A Real Position' },
      failOnStatusCode: false,
    })
    yes(realNumber.status() === 201, R1_LABELS[2], `got HTTP ${realNumber.status()}`)
    let realNumberId = null
    if (realNumber.status() === 201) {
      realNumberId = (await realNumber.json()).pin.id
      createdPinIds.push(realNumberId)
    }

    const afterCount = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE venueMapId = ?`).get(MAP_ID).n
    yes(afterCount === beforeCount + (realNumberId ? 1 : 0), R1_LABELS[3],
      `markers went ${beforeCount} -> ${afterCount}, only the accepted one should have been added`)

    // ── Round 1, medium: the write assumed the row still existed ─────────────
    //
    // The concurrent version of this is unreachable on this machine, because SQLite
    // here permits one writer at a time. The SEQUENTIAL version is reachable and is
    // the same defect: prisma.pin.delete on a row that has gone throws P2025 and
    // answered 500. Two deletes, one after the other, is all it takes.
    if (!realNumberId) {
      notRun(R1_LABELS.slice(4, 6), 'no disposable marker to delete twice')
    } else {
      const first = await org.request.delete(PIN_URL(MAP_ID, realNumberId), { failOnStatusCode: false })
      const second = await org.request.delete(PIN_URL(MAP_ID, realNumberId), { failOnStatusCode: false })
      yes(first.status() === 200 && second.status() === 404, R1_LABELS[4],
        `first ${first.status()}, second ${second.status()} — a 500 on the second is the unfixed behaviour`)

      const movedGone = await org.request.patch(PIN_URL(MAP_ID, realNumberId), {
        data: { x: 5, y: 5 },
        failOnStatusCode: false,
      })
      yes(movedGone.status() === 404, R1_LABELS[5],
        `got HTTP ${movedGone.status()} — a 500 here is the unfixed behaviour`)
    }

    // ── Round 1, high: local edits shadowed the server permanently ───────────
    //
    // Driven in the page WITHOUT a reload, on purpose. A reload mounts the component
    // fresh with no local edits, so it would pass whether or not the defect is
    // present — the assertion has to exercise the reconciliation, not bypass it.
    //
    // Sequence: place a marker through the screen, which creates a local override.
    // Insert a second marker the way another organizer would. Then place a third
    // through the screen, which triggers the refresh. With the fix, the refreshed
    // server data replaces the override and the second marker appears. Without it,
    // the override wins forever and the second marker is never drawn.
    // Run on the second fixture map, which is empty, so every click lands on bare
    // picture. Wrapped so a failure here is a named failure rather than an exception
    // that abandons the sections after it.
    try {
      await org.goto(`${ADMIN_BASE}/dashboard/floor-plan`, { waitUntil: 'domcontentloaded' })
      await settled(org)
      const rowB = org.locator(`[data-testid="map-row"][data-map-id="${MAP_B_ID}"]`)
      await rowB.locator('[data-testid="edit-markers"]').click()
      const editorB = org.locator(`[data-testid="marker-editor"][data-map-id="${MAP_B_ID}"]`)
      const canvasB = editorB.locator('[data-testid="marker-canvas"]')
      const boxB = await canvasB.boundingBox()
      if (!boxB) throw new Error('the second map had no measurable picture')

      const placeRoom = async (name, fx, fy) => {
        await canvasB.click({ position: { x: Math.round(boxB.width * fx), y: Math.round(boxB.height * fy) } })
        await editorB.locator('[data-testid="draft-type-room"]').click()
        await editorB.locator('[data-testid="draft-label"]').fill(name)
        await editorB.locator('[data-testid="draft-save"]').click()
        await org.waitForFunction(
          n => Array.from(document.querySelectorAll('[data-testid="admin-pin"]'))
            .some(el => el.getAttribute('data-pin-label') === n),
          name,
          { timeout: 15_000 },
        ).catch(() => {})
      }

      // One local edit, which is what creates the override.
      await placeRoom('Local Edit One', 0.2, 0.2)

      // A marker arriving the way another organizer's would: written to the database
      // with this browser never told about it.
      const OTHER_ORGANIZER_PIN = 'phase11-elsewhere-pin'
      db.prepare(`DELETE FROM Pin WHERE id = ?`).run(OTHER_ORGANIZER_PIN)
      db.prepare(
        `INSERT INTO Pin (id, venueMapId, type, label, x, y, createdAt) VALUES (?, ?, 'ROOM', 'Placed Elsewhere', 80, 80, ?)`,
      ).run(OTHER_ORGANIZER_PIN, MAP_B_ID, Date.now())
      createdPinIds.push(OTHER_ORGANIZER_PIN)

      // A second local edit, whose success triggers the refresh that has to win.
      await placeRoom('Local Edit Two', 0.45, 0.2)

      const appeared = await org.waitForFunction(
        () => Array.from(document.querySelectorAll('[data-testid="admin-pin"]'))
          .some(el => el.getAttribute('data-pin-label') === 'Placed Elsewhere'),
        null,
        { timeout: 15_000 },
      ).then(() => true).catch(() => false)

      const drawn = await editorB.locator('[data-testid="admin-pin"]').evaluateAll(
        els => els.map(e => e.getAttribute('data-pin-label')),
      )
      yes(appeared, R1_LABELS[6],
        `markers drawn were ${JSON.stringify(drawn)} — "Placed Elsewhere" missing means local edits are still shadowing the server`)
    } catch (err) {
      no(R1_LABELS[6], String(err?.message ?? err).split('\n')[0])
    }
  }

  // ═══ 13. Nothing seeded was disturbed ════════════════════════════════════
  section('13. The seeded floor plan is exactly as it was')

  const nowSeededPinRows = db
    .prepare(
      `SELECT p.id, p.venueMapId, p.type, p.x, p.y, p.sponsorId, p.label
         FROM Pin p
         JOIN VenueMap m ON m.id = p.venueMapId
        WHERE m.conferenceId = ?
          AND m.id NOT LIKE 'phase11-%'
        ORDER BY p.id ASC`,
    )
    .all(conference.id)
  const nowFingerprint = JSON.stringify(nowSeededPinRows)
  // Every field of every seeded marker, not a total. A total cannot tell the
  // difference between "unchanged" and "one deleted, one added elsewhere".
  yes(nowFingerprint === seededPinFingerprint,
    `all ${seededPinCount} seeded markers are unchanged, field by field`,
    nowSeededPinRows.length !== seededPinCount
      ? `count went ${seededPinCount} -> ${nowSeededPinRows.length}`
      : `same count, different contents — compare ${seededPinFingerprint.slice(0, 200)} with ${nowFingerprint.slice(0, 200)}`)

  const nowSeededMaps = db
    .prepare(`SELECT id, name, imageUrl, position FROM VenueMap WHERE conferenceId = ? AND id NOT LIKE 'phase11-%' ORDER BY position ASC`)
    .all(conference.id)
  const samePositions = nowSeededMaps.length === seededMaps.length &&
    nowSeededMaps.every((m, i) => m.id === seededMaps[i].id && m.position === seededMaps[i].position && m.imageUrl === seededMaps[i].imageUrl)
  yes(samePositions, 'every seeded map keeps its switch position and its stored picture path',
    `before ${JSON.stringify(seededMaps.map(m => [m.name, m.position]))}, after ${JSON.stringify(nowSeededMaps.map(m => [m.name, m.position]))}`)

  yes(orgErrors.length === 0, 'the organizer screen threw nothing', orgErrors.slice(0, 2).join(' | '))
} catch (err) {
  no('the suite ran to completion', String(err?.message ?? err).split('\n')[0])
} finally {
  // ── Cleanup, and it is asserted rather than assumed ────────────────────────
  section('Cleanup')
  cleanup()
  // Checked against the explicit fixture ids, matching what cleanup() deletes. The
  // earlier version asked `name LIKE 'Phase 11 %'` — the same broad condition the
  // delete used — so it could not have noticed the delete removing something it did
  // not own. Round 2 named that.
  const usersLeft = db
    .prepare(`SELECT COUNT(*) AS n FROM User WHERE id IN (${FIXTURE_USER_IDS.map(() => '?').join(',')})`)
    .get(...FIXTURE_USER_IDS).n
  const mapsLeft = db
    .prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE id IN (${FIXTURE_MAP_IDS.map(() => '?').join(',')})`)
    .get(...FIXTURE_MAP_IDS).n
  const confLeft = db.prepare(`SELECT COUNT(*) AS n FROM Conference WHERE id = ?`).get(OTHER_CONF_ID).n
  const pinsLeft = createdPinIds.length === 0
    ? 0
    : db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE id IN (${createdPinIds.map(() => '?').join(',')})`).get(...createdPinIds).n
  // The two fixture companies are counted here too. Adversarial review round 5 raised
  // their absence: this assertion checked users, maps, the other conference and
  // markers, so a cleanup that stopped removing the companies would still have printed
  // that every fixture row was removed. BLANK_SPONSOR_ID sits in the ACTIVE conference
  // and section 7c rewrites its booth number, so a leftover copy is a row every other
  // suite reads — and finding F-20's own assertions pick a company by whether it has a
  // booth number, which a leftover fixture could win.
  const sponsorsLeft = db
    .prepare(`SELECT COUNT(*) AS n FROM Sponsor WHERE id IN (?, ?)`)
    .get(OTHER_SPONSOR_ID, BLANK_SPONSOR_ID).n
  yes(usersLeft === 0 && mapsLeft === 0 && confLeft === 0 && pinsLeft === 0 && sponsorsLeft === 0,
    'every fixture row this suite created was removed',
    `${usersLeft} user(s), ${mapsLeft} map(s), ${confLeft} conference(s), ${pinsLeft} marker(s), ${sponsorsLeft} company(ies) left`)

  await browser.close()
}

console.log('\n────────────────────────────────────────────────────────────')
console.log(`  Results: ${pass} passed, ${fail} failed`)
console.log('────────────────────────────────────────────────────────────\n')
console.log('  Green here is evidence about the assertions listed above and')
console.log('  nothing wider. In particular it says nothing about how markers')
console.log('  behave when two organizers place them at the same moment: this')
console.log('  machine\'s database permits one writer at a time, so a race is')
console.log('  unreachable here and real in the deployed environment.\n')

process.exit(fail === 0 ? 0 : 1)
