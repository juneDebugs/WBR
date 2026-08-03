#!/usr/bin/env node
/**
 * Third opinion on Phase 10 findings 5 and 8.
 *
 *   node scripts/third-opinion-phase-10-permission-and-listeners.mjs
 *
 * Needs the admin app on 3000 and the participant app on 3001, production mode,
 * from a build matching the source.
 *
 * FINDING 5 (round 2): the three floor-plan addresses checked only that the
 * caller was staff, organizer or admin. A role with the floor-plan permission
 * deliberately switched off could still upload, reorder and delete by calling
 * them directly — including deleting a map and cascading away its markers. A
 * hidden screen is not an enforcement boundary.
 *
 * FINDING 8 (round 3): a stream discarded without an abort event left its
 * listener in the register forever.
 *
 * Shares nothing with the Phase 10 suite. Both findings are checked in both
 * directions: a refusal alone would be satisfied by a handler that refuses
 * everything, and an empty register would be satisfied by one that never
 * registers anything.
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
const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'
const P = 'thirdop10b'

let pass = 0, fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`) }
const yes = (c, m, d = '') => (c ? ok(m) : no(m, d))
const notRun = (ls, why) => ls.forEach(l => no(l, `NOT RUN — ${why}`))
const section = t => console.log(`\n── ${t} ──`)

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA busy_timeout = 15000')

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)
const DATA_URL = `data:image/png;base64,${PNG_1X1.toString('base64')}`
const SECRET = (() => {
  const fs = require('fs')
  const txt = fs.readFileSync(join(ROOT, 'apps/attendee/.env.local'), 'utf8')
  const m = txt.match(/^NEXTAUTH_SECRET=(.*)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
})()

const active = db.prepare(`SELECT id FROM Conference WHERE active = 1`).get()
if (!active) { console.error('No active conference. Refusing to run.'); process.exit(2) }
if (!SECRET) { console.error('Could not read NEXTAUTH_SECRET. Refusing to run.'); process.exit(2) }

function cleanup() {
  db.prepare(`DELETE FROM Pin WHERE id LIKE '${P}%'`).run()
  db.prepare(`DELETE FROM VenueMap WHERE id LIKE '${P}%' OR name LIKE 'Third Opinion B%'`).run()
  db.prepare(`DELETE FROM User WHERE id LIKE '${P}%' OR email LIKE '${P}%'`).run()
}

console.log('\n════════════════════════════════════════════════════════════')
console.log('  Third opinion — Phase 10 findings 5 and 8')
console.log('════════════════════════════════════════════════════════════')

cleanup()
const baseMaps = db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE conferenceId = ?`).get(active.id).n
const basePins = db.prepare(`SELECT COUNT(*) AS n FROM Pin`).get().n
const hadStaffRow = db.prepare(`SELECT COUNT(*) AS n FROM RolePermission WHERE role = 'STAFF'`).get().n > 0
console.log(`\n  baseline: ${baseMaps} maps, ${basePins} markers, STAFF permission row present: ${hadStaffRow}`)

const now = Date.now()
const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
const hash = await hashPassword(PASSWORD)

const ORG_EMAIL = `${P}-organizer@wbr.invalid`
db.prepare(`INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
            VALUES (?, ?, 'TO-B Organizer', 'ORGANIZER', ?, ?, ?)`)
  .run(`${P}-organizer`, ORG_EMAIL, hash, now, now)

const STAFF_EMAIL = `${P}-staff@wbr.invalid`
db.prepare(`INSERT INTO User (id, email, name, role, password, createdAt, updatedAt)
            VALUES (?, ?, 'TO-B Staff', 'STAFF', ?, ?, ?)`)
  .run(`${P}-staff`, STAFF_EMAIL, hash, now, now)

const DEL_EMAIL = `${P}-delegate@wbr.invalid`
db.prepare(`INSERT INTO User (id, email, name, role, password, jobTitle, company, companySize,
                              annualRevenue, solutionsSeeking, createdAt, updatedAt)
            VALUES (?, ?, 'TO-B Delegate', 'ATTENDEE', ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run(`${P}-delegate`, DEL_EMAIL, hash, 'Verifier', 'TO-B Ltd', 'MIDMARKET', '10M-50M',
       JSON.stringify(['Order Management']), now, now)

const browser = await chromium.launch()
async function signIn(page, email, base) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60_000 })
}

/** How many connections the participant app holds, read through its own route. */
async function connectionCount() {
  const res = await fetch(`${BASE}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, tags: ['floor-plan'] }),
  })
  const body = await res.json()
  return body.listenersOnThisInstance
}

const ALL_KEYS = ['calendar', 'agenda', 'speakers', 'meetings', 'timeBlocks',
                  'attendees', 'staff', 'sponsors', 'chat', 'email']

try {
  // ── FINDING 5 ───────────────────────────────────────────────────────────────
  section('FINDING 5 (round 2) — the permission key at the address, not the screen')

  const orgCtx = await browser.newContext(); const orgPage = await orgCtx.newPage()
  const stCtx = await browser.newContext(); const stPage = await stCtx.newPage()
  const LABELS_5 = [
    'with the permission GRANTED, staff can upload (the positive counterpart)',
    'with the permission REVOKED, uploading is refused',
    'with the permission REVOKED, reordering is refused',
    'with the permission REVOKED, deleting is refused',
    'the revoked refusals changed nothing in the database',
  ]
  let signedIn = true
  try {
    await signIn(orgPage, ORG_EMAIL, ADMIN_BASE)
    await signIn(stPage, STAFF_EMAIL, ADMIN_BASE)
  } catch (err) {
    signedIn = false
    notRun(LABELS_5, `sign-in failed — ${String(err?.message ?? err).split('\n')[0]}`)
  }

  if (signedIn) {
    // Positive counterpart FIRST. Grant the key through the app's own save path.
    // Writing the row straight to the database does not work — role permissions
    // are read through a cache that only the save path clears — and that is the
    // mistake that destroyed seeded data twice during this phase.
    const granted = await orgPage.request.put(`${ADMIN_BASE}/api/roles`, {
      data: { role: 'STAFF', description: 'TO-B: floor plan granted', permissions: [...ALL_KEYS, 'floorPlan'] },
      failOnStatusCode: false,
    })
    let ownMapId = null
    if (granted.status() === 200) {
      const up = await stPage.request.post(`${ADMIN_BASE}/api/floor-plan/maps`, {
        data: { name: 'Third Opinion B Granted', imageDataUrl: DATA_URL }, failOnStatusCode: false,
      })
      const row = db.prepare(`SELECT id FROM VenueMap WHERE name = 'Third Opinion B Granted'`).get()
      ownMapId = row?.id ?? null
      yes(up.status() === 201 && !!ownMapId, LABELS_5[0], `HTTP ${up.status()}`)
    } else {
      no(LABELS_5[0], `could not grant the permission: HTTP ${granted.status()}`)
    }

    // Now revoke it, through the same save path.
    const revoked = await orgPage.request.put(`${ADMIN_BASE}/api/roles`, {
      data: { role: 'STAFF', description: 'TO-B: floor plan revoked', permissions: ALL_KEYS },
      failOnStatusCode: false,
    })

    if (revoked.status() !== 200) {
      notRun(LABELS_5.slice(1), `could not revoke the permission: HTTP ${revoked.status()}`)
    } else {
      const up2 = await stPage.request.post(`${ADMIN_BASE}/api/floor-plan/maps`, {
        data: { name: 'Third Opinion B Should Not Exist', imageDataUrl: DATA_URL }, failOnStatusCode: false,
      })
      yes(up2.status() === 403, LABELS_5[1], `got HTTP ${up2.status()}`)

      const allIds = db.prepare(`SELECT id FROM VenueMap WHERE conferenceId = ? ORDER BY position ASC`)
        .all(active.id).map(r => r.id)
      const re = await stPage.request.patch(`${ADMIN_BASE}/api/floor-plan/maps`, {
        data: { orderedIds: allIds }, failOnStatusCode: false,
      })
      yes(re.status() === 403, LABELS_5[2], `got HTTP ${re.status()}`)

      // Aimed at a map this script created. Never a seeded one.
      if (ownMapId) {
        const del = await stPage.request.delete(`${ADMIN_BASE}/api/floor-plan/maps/${ownMapId}`, { failOnStatusCode: false })
        yes(del.status() === 403, LABELS_5[3], `got HTTP ${del.status()}`)
        const stillThere = db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE id = ?`).get(ownMapId).n
        const leaked = db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE name = 'Third Opinion B Should Not Exist'`).get().n
        yes(stillThere === 1 && leaked === 0, LABELS_5[4],
          `target ${stillThere ? 'kept' : 'DELETED'}, ${leaked} created`)
      } else {
        notRun([LABELS_5[3], LABELS_5[4]], 'no disposable map to aim the delete at')
      }
    }

    // Restore the permission table to what it was.
    if (!hadStaffRow) {
      await orgPage.request.put(`${ADMIN_BASE}/api/roles`, {
        data: { role: 'STAFF', description: 'TO-B restore', permissions: [...ALL_KEYS, 'floorPlan'] },
        failOnStatusCode: false,
      })
      db.prepare(`DELETE FROM RolePermission WHERE role = 'STAFF'`).run()
    }
    const rowsLeft = db.prepare(`SELECT COUNT(*) AS n FROM RolePermission WHERE role = 'STAFF'`).get().n
    yes(hadStaffRow || rowsLeft === 0, 'the STAFF permission row was removed again', `${rowsLeft} left`)
  }
  await orgCtx.close(); await stCtx.close()

  // ── FINDING 8 ───────────────────────────────────────────────────────────────
  section('FINDING 8 (round 3) — a stream dropped without an abort releases its listener')

  const before = await connectionCount()
  yes(typeof before === 'number', 'the connection count is readable', `got ${JSON.stringify(before)}`)

  const delCtx = await browser.newContext(); const delPage = await delCtx.newPage()
  let delIn = true
  try { await signIn(delPage, DEL_EMAIL, BASE) } catch (err) {
    delIn = false
    notRun(['opening map screens registers connections (the positive counterpart)',
            'dropping them abruptly releases every one'],
      `delegate sign-in failed — ${String(err?.message ?? err).split('\n')[0]}`)
  }

  if (delIn) {
    // Three phones on the map screen.
    const pages = [delPage]
    for (let i = 0; i < 2; i++) pages.push(await delCtx.newPage())
    await Promise.all(pages.map(p => p.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' }).catch(() => {})))

    // Wait for the register to reflect them rather than sleeping a fixed time.
    let peak = before
    for (let i = 0; i < 40 && peak < before + 3; i++) {
      await delPage.waitForTimeout(250)
      peak = await connectionCount()
    }
    yes(peak >= before + 3, 'opening map screens registers connections (the positive counterpart)',
      `count went ${before} → ${peak}, wanted at least ${before + 3}`)

    // Drop them abruptly — closing the context kills the sockets without the
    // client sending anything. This is the case that leaked.
    await delCtx.close()

    let after = peak
    for (let i = 0; i < 60 && after > before; i++) {
      await new Promise(r => setTimeout(r, 250))
      after = await connectionCount()
    }
    yes(after === before, 'dropping them abruptly releases every one',
      `count settled at ${after}, wanted ${before}${after > before ? ' — LISTENERS LEAKED' : ''}`)
  } else {
    await delCtx.close().catch(() => {})
  }
} catch (err) {
  no('the script ran to completion', String(err?.message ?? err).split('\n')[0])
} finally {
  section('Cleanup')
  cleanup()
  const mapsNow = db.prepare(`SELECT COUNT(*) AS n FROM VenueMap WHERE conferenceId = ?`).get(active.id).n
  const pinsNow = db.prepare(`SELECT COUNT(*) AS n FROM Pin`).get().n
  yes(mapsNow === baseMaps && pinsNow === basePins,
    'the database is exactly as it was before this ran',
    `maps ${mapsNow} of ${baseMaps}, markers ${pinsNow} of ${basePins}`)
  await browser.close()
  db.close()
  console.log('\n────────────────────────────────────────────────────────────')
  console.log(`  Results: ${pass} passed, ${fail} failed`)
  console.log('────────────────────────────────────────────────────────────')
  process.exit(fail === 0 ? 0 : 1)
}
