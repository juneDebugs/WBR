// Is the brief double-render on the organizer's floor-plan screen something Phase
// 11 introduced, or something this app already did?
//
// Same sampling, pointed at screens Phase 11 never touched. A duplicate that also
// appears on /dashboard/speakers is not Phase 11's doing.
//
// Each sample takes all three counts in ONE evaluate, so they describe the same
// instant. The first debug attempt took them in separate round trips and produced
// numbers that contradicted each other, which is what made it unreadable.

import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Derived from this file's own location rather than written out, so the script
// works from any checkout and carries nobody's home folder in it.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = new DatabaseSync(join(ROOT, 'packages/db/prisma/dev.db'))
db.exec('PRAGMA busy_timeout = 15000')

const ORG_ID = 'phase11other-organizer'
const ORG_EMAIL = 'phase11other-organizer@wbr.invalid'
db.prepare(`DELETE FROM User WHERE id = ?`).run(ORG_ID)
const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
const hash = await hashPassword('password123')
const now = Date.now()
db.prepare(
  `INSERT INTO User (id, email, name, role, password, createdAt, updatedAt) VALUES (?, ?, 'P11 Other', 'ORGANIZER', ?, ?, ?)`,
).run(ORG_ID, ORG_EMAIL, hash, now, now)

const browser = await chromium.launch()

// A fresh browser context per screen, so each screen gets a genuine FIRST load.
// The doubling only appeared on the first load of a route, so reusing one context
// would measure the second load and report a clean result for the wrong reason.
const SCREENS = [
  { path: '/dashboard/speakers', marker: 'main' },
  { path: '/dashboard/sponsors', marker: 'main' },
  { path: '/dashboard/staff', marker: 'main' },
  { path: '/dashboard/floor-plan', marker: '[data-testid="floor-plan-admin"]' },
]

for (const screen of SCREENS) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(ORG_EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill('password123')
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60_000 })

  console.log(`\n═══ ${screen.path} (first load, fresh context) ═══`)
  await page.goto(`http://localhost:3000${screen.path}`, { waitUntil: 'domcontentloaded' })
  const started = Date.now()
  for (const wait of [0, 50, 100, 150, 250, 400, 600, 1000, 2000]) {
    const remaining = started + wait - Date.now()
    if (remaining > 0) await page.waitForTimeout(remaining)
    let s
    try {
      s = await page.evaluate(sel => ({
        marker: document.querySelectorAll(sel).length,
        h1: document.querySelectorAll('h1').length,
        tables: document.querySelectorAll('table').length,
      }), screen.marker)
    } catch {
      console.log(`  +${String(wait).padStart(4)}ms  (document replaced mid-sample)`)
      continue
    }
    const flag = s.marker > 1 || s.h1 > 1 ? '   <-- DOUBLED' : ''
    console.log(`  +${String(wait).padStart(4)}ms  marker=${s.marker}  h1=${s.h1}  tables=${s.tables}${flag}`)
  }
  await ctx.close()
}

db.prepare(`DELETE FROM User WHERE id = ?`).run(ORG_ID)
await browser.close()
