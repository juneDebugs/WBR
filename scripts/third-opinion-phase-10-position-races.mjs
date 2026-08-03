#!/usr/bin/env node
/**
 * Third opinion on Phase 10 findings 3 and 6 — the two position-allocation races.
 *
 *   node scripts/third-opinion-phase-10-position-races.mjs
 *   ROUNDS=8 CONCURRENCY=5 node scripts/third-opinion-phase-10-position-races.mjs
 *
 * Needs the admin app on 3000, production mode, build matching source.
 *
 * ── The two findings ─────────────────────────────────────────────────────────
 *
 * FINDING 3 (round 1). A new map goes on the END of the switch order, which
 * means reading the highest position and then inserting one past it — two
 * statements. Two uploads at once both read the same maximum and both insert it.
 * The unique constraint on (conferenceId, position) rejects one, which protects
 * the order and THROWS AWAY a legitimate upload, answering with an unhandled
 * error rather than anything a person could act on. Fixed by retrying: each
 * attempt re-reads, so the second organizer lands one place further along.
 *
 * FINDING 6 (round 2), and quieter. A DELETE committing between the read and the
 * insert renumbers the remaining maps DOWNWARD, so the insert uses a maximum
 * that no longer exists. Positions 1,2,3 become 1,2 after a delete, and the
 * insert still writes 4. NO CONSTRAINT IS VIOLATED, so no retry fires, and the
 * order carries a permanent hole that every later upload builds on. Retrying
 * cannot answer this because nothing failed. Fixed by doing the create and a
 * full renumber in ONE transaction.
 *
 * ── Why this repeats ─────────────────────────────────────────────────────────
 *
 * A race reproduced once is not measured. This project's own record: its
 * teammate-attach race took 15 of 15 attempts to establish after a single
 * attempt failed to reproduce it. So every round below is counted and a ratio is
 * reported. A single clean round is not evidence.
 *
 * ── What "correct" means here ────────────────────────────────────────────────
 *
 * Two invariants, checked after every round:
 *   1. NO UPLOAD IS LOST — every request answered 201 has a row.
 *   2. THE ORDER IS EXACTLY 1..n — no gap, no duplicate.
 *
 * Invariant 2 is the one finding 6 breaks silently, and the one a passing
 * response code cannot tell you about.
 */

import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')

const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const ADMIN_BASE = process.env.WEB_BASE_URL ?? 'http://localhost:3000'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'
const ROUNDS = Number(process.env.ROUNDS ?? 8)
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5)
const P = 'thirdop10d'

let pass = 0, fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`) }
const yes = (c, m, d = '') => (c ? ok(m) : no(m, d))
const section = t => console.log(`\n── ${t} ──`)

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)
const DATA_URL = `data:image/png;base64,${PNG_1X1.toString('base64')}`
const NAME_PREFIX = 'Third Opinion Race'

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA busy_timeout = 15000')

const active = db.prepare(`SELECT id FROM Conference WHERE active = 1`).get()
if (!active) { console.error('No active conference. Refusing to run.'); process.exit(2) }

function clearRaceMaps() {
  db.prepare(`DELETE FROM VenueMap WHERE name LIKE '${NAME_PREFIX}%'`).run()
}
function cleanupAll() {
  clearRaceMaps()
  db.prepare(`DELETE FROM User WHERE id LIKE '${P}%' OR email LIKE '${P}%'`).run()
}

/** Positions of every map on the active conference, ascending. */
function positions() {
  return db.prepare(`SELECT id, position, name FROM VenueMap WHERE conferenceId = ? ORDER BY position ASC`)
    .all(active.id)
}

/** Is the order exactly 1..n with no gap and no duplicate? */
function orderIsContiguous() {
  const rows = positions()
  const ps = rows.map(r => r.position)
  const wanted = ps.map((_, i) => i + 1)
  const dupes = ps.length !== new Set(ps).size
  return { good: !dupes && JSON.stringify(ps) === JSON.stringify(wanted), ps, dupes, rows }
}

console.log('\n════════════════════════════════════════════════════════════')
console.log('  Third opinion — Phase 10 findings 3 and 6, position races')
console.log(`  ${ROUNDS} rounds, ${CONCURRENCY} concurrent operations each`)
console.log('════════════════════════════════════════════════════════════')

cleanupAll()
const baseline = orderIsContiguous()
console.log(`\n  baseline: ${baseline.ps.length} maps at positions [${baseline.ps.join(', ')}]`)
if (!baseline.good) {
  console.error('  The order is ALREADY not contiguous before this script ran. Refusing to attribute anything.')
  process.exit(2)
}
const baseCount = baseline.ps.length

const now = Date.now()
const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
const hash = await hashPassword(PASSWORD)
const ORG_EMAIL = `${P}-organizer@wbr.invalid`
db.prepare(`INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
            VALUES (?, ?, 'TO-D Organizer', 'ORGANIZER', ?, ?, ?)`)
  .run(`${P}-organizer`, ORG_EMAIL, hash, now, now)

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()

// Per-finding tallies. A ratio, not a verdict from one attempt.
let f3Rounds = 0, f3Clean = 0, f3LostTotal = 0
const f3Detail = []
let f6Rounds = 0, f6Clean = 0
const f6Detail = []

try {
  await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(ORG_EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60_000 })

  const upload = name => page.request.post(`${ADMIN_BASE}/api/floor-plan/maps`, {
    data: { name, imageDataUrl: DATA_URL }, failOnStatusCode: false,
  })
  const remove = id => page.request.delete(`${ADMIN_BASE}/api/floor-plan/maps/${id}`, { failOnStatusCode: false })

  // ── FINDING 3 — simultaneous uploads ────────────────────────────────────────
  section(`FINDING 3 — ${CONCURRENCY} simultaneous uploads, ${ROUNDS} times`)

  for (let r = 1; r <= ROUNDS; r++) {
    clearRaceMaps()
    const names = Array.from({ length: CONCURRENCY }, (_, i) => `${NAME_PREFIX} R${r}-${i}`)
    const results = await Promise.all(names.map(n => upload(n)))
    const statuses = results.map(x => x.status())
    const created = statuses.filter(s => s === 201).length

    const rowsFor = names.filter(n =>
      db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE name = ?`).get(n).n === 1).length
    const lost = CONCURRENCY - created
    f3LostTotal += lost

    const ord = orderIsContiguous()
    const clean = created === CONCURRENCY && rowsFor === CONCURRENCY && ord.good
    f3Rounds++
    if (clean) f3Clean++
    else f3Detail.push(`round ${r}: statuses [${statuses.join(',')}], ${rowsFor} rows, positions [${ord.ps.join(',')}]${ord.dupes ? ' DUPLICATES' : ''}`)
    process.stdout.write(clean ? '.' : 'X')
  }
  console.log('')
  yes(f3Clean === f3Rounds,
    `all ${CONCURRENCY} uploads survived in ${f3Clean}/${f3Rounds} rounds, order contiguous every time`,
    f3Detail.slice(0, 4).join(' | '))
  yes(f3LostTotal === 0,
    'no upload was thrown away across every round',
    `${f3LostTotal} upload(s) lost — the retry loop is what prevents this`)

  // ── FINDING 6 — a delete committing while uploads are in flight ─────────────
  section(`FINDING 6 — deletes racing uploads, ${ROUNDS} times`)

  for (let r = 1; r <= ROUNDS; r++) {
    clearRaceMaps()
    const seedNames = Array.from({ length: 3 }, (_, i) => `${NAME_PREFIX} S${r}-${i}`)
    for (const n of seedNames) await upload(n)
    const seeded = db.prepare(`SELECT id FROM VenueMap WHERE name LIKE '${NAME_PREFIX} S${r}-%'`).all().map(x => x.id)

    // Fire deletes and uploads together, so a delete commits between another
    // request's read of the maximum and its insert. This is the interleaving
    // that produced a permanent hole, and it violates no constraint.
    const newNames = Array.from({ length: CONCURRENCY }, (_, i) => `${NAME_PREFIX} N${r}-${i}`)
    const ops = [
      ...seeded.slice(0, 2).map(id => () => remove(id)),
      ...newNames.map(n => () => upload(n)),
    ]
    const results = await Promise.all(ops.map(f => f()))
    const statuses = results.map(x => x.status())

    const ord = orderIsContiguous()
    const created = newNames.filter(n =>
      db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE name = ?`).get(n).n === 1).length
    const reported201 = statuses.filter(s => s === 201).length

    const clean = ord.good && created === reported201
    f6Rounds++
    if (clean) f6Clean++
    else f6Detail.push(`round ${r}: positions [${ord.ps.join(',')}]${ord.dupes ? ' DUPLICATES' : ''}, ${created} rows vs ${reported201} reported 201`)
    process.stdout.write(clean ? '.' : 'X')
  }
  console.log('')
  yes(f6Clean === f6Rounds,
    `the order stayed exactly 1..n in ${f6Clean}/${f6Rounds} rounds of deletes racing uploads`,
    f6Detail.slice(0, 4).join(' | '))

  // ── The constraint this all rests on is real, not assumed ───────────────────
  section('The premise behind both fixes')
  clearRaceMaps()
  let refused = false, msg = ''
  const rowsNow = positions()
  try {
    if (rowsNow.length >= 2) {
      db.prepare(`UPDATE VenueMap SET position = ? WHERE id = ?`).run(rowsNow[0].position, rowsNow[1].id)
    }
  } catch (err) {
    refused = true
    msg = String(err?.message ?? err).split('\n')[0]
  }
  yes(refused, 'the database really does refuse two maps at the same position',
    refused ? '' : 'IT DID NOT REFUSE — the unique constraint both fixes rely on is absent')
  if (refused) console.log(`      refusal: ${msg}`)
} catch (err) {
  no('the script ran to completion', String(err?.message ?? err).split('\n')[0])
} finally {
  section('Cleanup')
  clearRaceMaps()
  // Renumber whatever remains to 1..n, so a deleted fixture cannot leave the
  // seeded maps holding a gap. Two passes, for the same constraint reason the
  // product's own reorder uses two.
  const rows = positions()
  for (let i = 0; i < rows.length; i++) {
    db.prepare(`UPDATE VenueMap SET position = ? WHERE id = ?`).run(-(i + 1), rows[i].id)
  }
  for (let i = 0; i < rows.length; i++) {
    db.prepare(`UPDATE VenueMap SET position = ? WHERE id = ?`).run(i + 1, rows[i].id)
  }
  cleanupAll()
  const final = orderIsContiguous()
  yes(final.ps.length === baseCount && final.good,
    'the conference is back to its baseline order',
    `${final.ps.length} maps at [${final.ps.join(',')}], baseline was ${baseCount} at [${baseline.ps.join(',')}]`)
  const leftUsers = db.prepare(`SELECT COUNT(*) AS n FROM User WHERE id LIKE '${P}%'`).get().n
  yes(leftUsers === 0, 'the disposable organizer was removed', `${leftUsers} left`)

  await ctx.close()
  await browser.close()
  db.close()
  console.log('\n────────────────────────────────────────────────────────────')
  console.log(`  Results: ${pass} passed, ${fail} failed`)
  console.log(`  finding 3: ${f3Clean}/${f3Rounds} clean rounds, ${f3LostTotal} uploads lost`)
  console.log(`  finding 6: ${f6Clean}/${f6Rounds} clean rounds`)
  console.log('────────────────────────────────────────────────────────────')
  console.log(`
  A ratio, not a verdict from one attempt. If either ratio is short of its
  total, the detail above names the round and the observed positions.

  Clean rounds alone do NOT prove the fixes work — they are also consistent with
  the race never having been triggered. The two negative controls run separately
  establish that this probe can see the defect: break the retry loop and finding
  3 loses uploads; take the renumber out of the create transaction and finding 6
  leaves a hole.
`)
  process.exit(fail === 0 ? 0 : 1)
}
