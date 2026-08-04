#!/usr/bin/env node
// Phase 10's outstanding criterion, witnessed rather than read.
//
//   node scripts/phase-10-witness-refusal-log.mjs <path-to-admin-app-log>
//
// The criterion: "the posting helper checks res.ok and logs when a call is
// refused. Proved by pointing it at an address that refuses and asserting a log
// line appears — fetch does not throw on 401, which is how this went unnoticed."
//
// It was recorded as BUILT, NOT VERIFIED AS WRITTEN. Both helpers do test !res.ok
// and log, confirmed by reading the source. Reading is not witnessing, and the
// whole reason this criterion exists is that the previous version of that code
// reported success while doing nothing, for every tag, in every environment —
// because fetch resolves rather than throwing on an HTTP error status.
//
// ── What this needs from the caller ─────────────────────────────────────────
//
// The admin app must be running with ATTENDEE_APP_URL pointed at an address that
// REFUSES, and its output must be going to the log file named on the command
// line. scripts/phase-10-refusing-address.mjs is that address.
//
// ── The pairing, which is the point ─────────────────────────────────────────
//
// Two things must BOTH be true, and either alone is misleading:
//
//   the write still succeeds — the row is saved, so telling the organizer the
//   save failed would be untrue and would push them into repeating it;
//
//   and the refusal is written to the log — because the alternative is not a
//   broken feature, it is a feature that looks fine.
//
// A version that failed the write would satisfy the log assertion. A version that
// logged nothing would satisfy the success assertion. Both are asserted.

import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const ADMIN_BASE = process.env.WEB_BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.ADMIN_EMAIL ?? 'wbr@test.com'
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'password123'

const LOG_PATH = process.argv[2]
if (!LOG_PATH) {
  console.error('Usage: node scripts/phase-10-witness-refusal-log.mjs <path-to-admin-app-log>')
  process.exit(2)
}

let pass = 0
let fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`) }
const yes = (c, m, d = '') => (c ? ok(m) : no(m, d))

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA busy_timeout = 15000')

const conference = db.prepare(`SELECT id FROM Conference WHERE active = 1`).get()
if (!conference) { console.error('No active conference.'); process.exit(2) }

// Every map for the active conference, in the order it already has. Sending the
// EXISTING order on purpose: the handler renumbers to the same values, so the
// stored data is unchanged, and it still calls the posting helper. A reorder that
// actually moved something would be a data change made for the sake of reading a
// log line.
const orderedIds = db
  .prepare(`SELECT id FROM VenueMap WHERE conferenceId = ? ORDER BY position ASC`)
  .all(conference.id)
  .map(r => r.id)

if (orderedIds.length === 0) { console.error('No maps to reorder.'); process.exit(2) }

const before = db
  .prepare(`SELECT id, position FROM VenueMap WHERE conferenceId = ? ORDER BY position ASC`)
  .all(conference.id)

// Only a refusal written from here on counts. Reading the whole file would let a
// refusal logged by some earlier run satisfy this.
//
// ── Why this counts occurrences instead of slicing at a boundary ──────────────
//
// Two earlier versions both tried to mark a position in a file another process is
// appending to, and both marked it in the wrong place.
//
// The first recorded the file's SIZE and sliced from that byte offset. The offset
// landed six characters inside the warning line, so the captured text began
// "-plan/maps PATCH]" and the assertion looking for the label failed while the app
// had written the line correctly. A byte offset into a growing file has no reason to
// fall on a line boundary.
//
// The second counted completed newlines and sliced `lines.slice(linesBefore)`. That
// is correct only when the file ends with a newline. Adversarial review round 5 of
// Phase 11 raised the other case: for a file ending in an UNTERMINATED line, the
// count is one lower, so that last old line is included in the "fresh" text — and if
// it happens to be a refusal from an earlier run, this script reports that the
// refusal was logged when this run logged nothing. Measured directly: with the file
// ending in a newline the old line does not leak; without one, it does.
//
// Counting how many refusals exist before and after removes the boundary from the
// question altogether. A refusal is fresh if there is one MORE of them than there
// was, which no slicing mistake can fake.
const REFUSAL_MARK = 'REFUSED the cache invalidation'
const countRefusals = () => {
  try { return readFileSync(LOG_PATH, 'utf8').split(REFUSAL_MARK).length - 1 } catch { return 0 }
}
const refusalsBefore = countRefusals()

console.log('\n════════════════════════════════════════════════════════════')
console.log('  Phase 10 — witnessing the posting helper\'s refusal log')
console.log('════════════════════════════════════════════════════════════\n')

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

try {
  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60_000 })

  const res = await page.request.patch(`${ADMIN_BASE}/api/floor-plan/maps`, {
    data: { orderedIds },
    failOnStatusCode: false,
  })

  yes(res.status() === 200, 'the write still succeeds while the invalidation is refused',
    `got HTTP ${res.status()} — a failed write would satisfy the log assertion below for the wrong reason`)

  // ── What the organizer is TOLD when the notification does not arrive ────────
  //
  // Added 2026-08-03. This is the case that matters on a stage: the save worked, the
  // phones have not been told, and the question is whether the screen claims they
  // have. It used to, because the wording was chosen from whether ATTENDEE_APP_URL
  // was set rather than from whether the call succeeded. Here the address IS set —
  // to a server that refuses — which is exactly the combination that produced the
  // false claim.
  const body = await res.json().catch(() => ({}))
  yes(body.delegatesNotified === false, 'and the response says delegates were NOT notified',
    `delegatesNotified was ${JSON.stringify(body.delegatesNotified)} — true here would be a claim the screen then repeats to a room`)

  const after = db
    .prepare(`SELECT id, position FROM VenueMap WHERE conferenceId = ? ORDER BY position ASC`)
    .all(conference.id)
  yes(JSON.stringify(after) === JSON.stringify(before), 'and the stored order is unchanged',
    `before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`)

  // The helper is awaited inside the handler, so the line is written before the
  // response arrives. A moment is allowed anyway for the write to reach the file.
  await page.waitForTimeout(1500)

  // One MORE refusal than there was before. See the note beside `refusalsBefore` for
  // why this counts rather than slicing at a remembered position.
  const refusalsAfter = countRefusals()
  const refused = refusalsAfter > refusalsBefore
  yes(refused, 'the refusal is written to the admin app\'s log',
    `the log held ${refusalsBefore} refusal(s) before this write and ${refusalsAfter} after, so this run added none`)

  if (refused) {
    // The LAST one, which is this run's. An earlier one may sit above it.
    const line = readFileSync(LOG_PATH, 'utf8')
      .split('\n')
      .filter(l => l.includes(REFUSAL_MARK))
      .at(-1) ?? ''
    console.log(`\n  the line, as the app wrote it:\n    ${line.trim()}\n`)
    yes(/floor-plan\/maps PATCH/.test(line), 'and it names which write was refused', `line: ${line.trim()}`)
    yes(/HTTP \d{3}/.test(line), 'and the status it was refused with', `line: ${line.trim()}`)
    yes(/floor-plan/.test(line), 'and which tag was not cleared', `line: ${line.trim()}`)
  } else {
    no('and it names which write was refused', 'NOT RUN — no line to read')
    no('and the status it was refused with', 'NOT RUN — no line to read')
    no('and which tag was not cleared', 'NOT RUN — no line to read')
  }
} catch (err) {
  no('the check ran to completion', String(err?.message ?? err).split('\n')[0])
} finally {
  await browser.close()
}

console.log('────────────────────────────────────────────────────────────')
console.log(`  Results: ${pass} passed, ${fail} failed`)
console.log('────────────────────────────────────────────────────────────\n')
process.exit(fail === 0 ? 0 : 1)
