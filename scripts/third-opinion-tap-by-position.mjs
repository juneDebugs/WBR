#!/usr/bin/env node
// A third opinion on the booth card, sharing nothing with the code it checks.
//
//   node scripts/third-opinion-tap-by-position.mjs
//   (participant app on 3001)
//
// ── Why this exists when a Playwright suite already covers the same ground ───
//
// docs/smoketests/playwright/phase-9-booth-company-card.mjs finds a marker with
// [data-pin-sponsor="<id>"] and then reads the card's data-booth-card-sponsor.
// Both of those attributes are written from the SAME value in the same
// component. If that value were wrong, or if the card were wired to the wrong
// marker in a way that kept the two attributes consistent, the assertion would
// still pass. It is a check on internal agreement, not on what a delegate gets.
//
// This file removes every shared handle:
//
//   * It does not use data-pin-sponsor. It computes where a marker must be from
//     the x and y PERCENTAGES stored in the database and the map picture's
//     measured box, then clicks those raw screen coordinates.
//   * It does not read data-booth-card-sponsor. It reads the TEXT a delegate
//     sees — the heading, the stand line, the tagline, the offering chips.
//   * It compares that text against the database row for the company whose
//     stored position it just clicked.
//
// So the only thing connecting the tap to the answer is the product itself. If
// the card opened for the wrong company, this says so; the suite might not.

import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'

const ID = 'phase9-tap'
const EMAIL = 'phase9-tap@wbr.invalid'
const CLEANUP = `DELETE FROM User WHERE id LIKE 'phase9-tap%' OR email LIKE 'phase9-tap%'`

const db = new DatabaseSync(DB_PATH)

// Where each booth marker is SUPPOSED to be, and what its card must say. Read
// straight from the database, joined through sponsorId.
const booths = db
  .prepare(
    `SELECT p.x, p.y, s.name, s.boothNumber, s.tagline, s.website, s.solutionsOffering
       FROM Pin p JOIN Sponsor s ON s.id = p.sponsorId
      WHERE p.type = 'BOOTH'
      ORDER BY s.boothNumber ASC`,
  )
  .all()
  .map(r => {
    let offerings = []
    try {
      const a = JSON.parse(r.solutionsOffering ?? '[]')
      if (Array.isArray(a)) offerings = a.filter(o => typeof o === 'string' && o.trim())
    } catch {
      // An unparseable list means the card should show none; the comparison
      // below then expects none, which is the honest expectation.
    }
    return { ...r, offerings }
  })

if (booths.length === 0) {
  console.error('No booth markers to click.')
  process.exit(2)
}

{
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  db.prepare(CLEANUP).run()
  const now = Date.now()
  db.prepare(
    `INSERT INTO User (id, email, name, role, password, jobTitle, company, companySize,
                       annualRevenue, solutionsSeeking, createdAt, updatedAt)
     VALUES (?, ?, ?, 'ATTENDEE', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ID, EMAIL, 'Phase 9 Tap', hash, 'Head of Retail', 'Phase 9 Retail Co',
        'MIDMARKET', '10M-50M', JSON.stringify(['Order Management']), now, now)
}

let pass = 0
let fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
await page.locator('button[type="submit"]').first().click()
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 })
await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="map-image"]', { timeout: 30_000 })
await page.waitForTimeout(500)

console.log(`Tapping ${booths.length} stored positions on the exhibit-hall picture.`)
console.log('Nothing below reads a pin id or a card id. Positions in, rendered words out.\n')

for (const b of booths) {
  // Where that percentage lands on this screen, measured from the picture's own
  // box. The stored value is a percentage OF THE PICTURE, so the picture's box
  // is the only thing needed to turn it into a coordinate.
  const point = await page.evaluate(({ x, y }) => {
    const img = document.querySelector('[data-testid="map-image"]')
    if (!img) return null
    const r = img.getBoundingClientRect()
    return { px: r.left + (r.width * x) / 100, py: r.top + (r.height * y) / 100 }
  }, { x: b.x, y: b.y })

  if (!point) { no(`${b.boothNumber} — could not measure the picture`); continue }

  await page.mouse.click(point.px, point.py)
  await page.waitForTimeout(350)

  // Only what a person can read.
  const seen = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="booth-card"]')
    if (!card) return null
    const txt = sel => {
      const el = card.querySelector(sel)
      return el ? el.textContent.trim() : null
    }
    const link = card.querySelector('[data-testid="booth-card-website"]')
    return {
      heading: txt('[data-testid="booth-card-name"]'),
      stand: txt('[data-testid="booth-card-booth"]'),
      tagline: txt('[data-testid="booth-card-tagline"]'),
      offerings: [...card.querySelectorAll('[data-testid="booth-card-offering"]')]
        .map(e => e.textContent.trim()),
      href: link ? link.getAttribute('href') : null,
    }
  })

  if (!seen) {
    no(`${b.boothNumber} ${b.name} — clicking its stored position opened no card`,
      `clicked (${Math.round(point.px)}, ${Math.round(point.py)}) for stored ${b.x}%, ${b.y}%`)
    continue
  }

  const sameOfferings =
    seen.offerings.length === b.offerings.length &&
    seen.offerings.every((o, i) => o === b.offerings[i])

  const matches =
    seen.heading === b.name &&
    typeof seen.stand === 'string' && seen.stand.includes(b.boothNumber) &&
    seen.tagline === b.tagline &&
    seen.href === b.website &&
    sameOfferings

  if (matches) {
    ok(`clicking the position stored for ${b.boothNumber} shows "${seen.heading}", ${seen.stand}, ${seen.offerings.length} offerings`)
  } else {
    no(`${b.boothNumber} ${b.name} — the card does not match the company at that position`,
      `saw heading ${JSON.stringify(seen.heading)}, stand ${JSON.stringify(seen.stand)}, ` +
      `tagline ${JSON.stringify(seen.tagline)}, href ${JSON.stringify(seen.href)}, ` +
      `offerings ${JSON.stringify(seen.offerings)}`)
  }

  await page.locator('[data-testid="booth-card-close"]').first().click().catch(() => {})
  await page.waitForTimeout(200)
}

db.prepare(CLEANUP).run()
db.close()
await browser.close()

console.log(`\n  Results: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
