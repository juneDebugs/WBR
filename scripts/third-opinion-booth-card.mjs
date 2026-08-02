#!/usr/bin/env node
// A third opinion on the booth card: what it actually looks like, measured
// against the map it sits on rather than against the values it was given.
//
//   node scripts/third-opinion-booth-card.mjs
//   (participant app on 3001; writes PNGs to /tmp/phase9-shots)
//
// ── Why this exists alongside the Playwright suite ───────────────────────────
//
// Phase 8 shipped with 111 passing assertions and three rounds of adversarial
// review, and the map was still unreadable on a phone with six of fifteen room
// labels sitting on top of other rooms. Every check compared a marker to the
// number stored for that marker; none compared anything to the picture. Finding
// it took signing in and looking.
//
// The Phase 9 suite has the same shape of blind spot. It asserts that the card
// shows the right tagline, the right offerings and the right booth number, and
// every one of those passes whether the card is comfortably readable or crushed
// into a strip with its close button off the bottom edge.
//
// So this measures GEOMETRY and reports it for a human to judge:
//   * how much of the card is actually inside the map's box
//   * whether the card has to scroll to show everything it holds
//   * whether the close control is within the visible part
//   * how much of the map is left uncovered
//
// It prints numbers and saves pictures. It deliberately does not pass or fail
// on a threshold — a threshold here would be a guess, and a guess that passes
// is what Phase 8 shipped.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'
const SHOTS = process.env.PHASE9_SHOT_DIR ?? '/tmp/phase9-shots'
mkdirSync(SHOTS, { recursive: true })

const ID = 'phase9-look'
const EMAIL = 'phase9-look@wbr.invalid'
const CLEANUP = `DELETE FROM User WHERE id LIKE 'phase9-look%' OR email LIKE 'phase9-look%'`

const db = new DatabaseSync(DB_PATH)

// The two extremes, chosen from the data rather than picked by name: the
// company with the most offerings and the one with the fewest. If the card
// works for both it works for the eight in between.
const booths = db
  .prepare(
    `SELECT s.id, s.name, s.boothNumber, s.tagline, s.solutionsOffering
       FROM Pin p JOIN Sponsor s ON s.id = p.sponsorId WHERE p.type = 'BOOTH'`,
  )
  .all()
  .map(r => {
    let n = 0
    try {
      const p = JSON.parse(r.solutionsOffering ?? '[]')
      if (Array.isArray(p)) n = p.length
    } catch {
      // A malformed list means zero renderable offerings, which is the extreme
      // worth looking at anyway.
    }
    return { ...r, count: n, taglineLength: (r.tagline ?? '').length }
  })
  .sort((a, b) => b.count - a.count || b.taglineLength - a.taglineLength)

if (booths.length === 0) {
  console.error('No booth markers. Run pnpm seed:floor-plan first.')
  process.exit(2)
}

const subjects = [
  { label: 'most-offerings', row: booths[0] },
  { label: 'fewest-offerings', row: booths[booths.length - 1] },
]

{
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  db.prepare(CLEANUP).run()
  const now = Date.now()
  db.prepare(
    `INSERT INTO User (id, email, name, role, password, jobTitle, company, companySize,
                       annualRevenue, solutionsSeeking, createdAt, updatedAt)
     VALUES (?, ?, ?, 'ATTENDEE', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ID, EMAIL, 'Phase 9 Look', hash, 'Head of Retail', 'Phase 9 Retail Co',
        'MIDMARKET', '10M-50M', JSON.stringify(['Order Management']), now, now)
}

const browser = await chromium.launch()

const SIZES = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 900 },
]

console.log('Third opinion — what the booth card actually looks like\n')

for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } })
  const page = await ctx.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="map-image"]', { timeout: 30_000 })

  console.log(`── ${size.name} (${size.width}x${size.height}) ──`)

  for (const s of subjects) {
    await page.locator(`[data-testid="pin"][data-pin-sponsor="${s.row.id}"]`).first().click()
    await page.waitForSelector('[data-testid="booth-card"]', { timeout: 5000 }).catch(() => {})

    // Wait for the logo to DECODE before measuring or photographing. Without
    // this the first run's pictures showed an empty box where the logo goes and
    // it was briefly read as a broken image — the picture was simply taken in
    // the same tick the card appeared. The logo does load: 128 by 128, drawn at
    // 48 by 48. A screenshot that lies is worse than no screenshot.
    await page
      .waitForFunction(() => {
        const i = document.querySelector('[data-testid="booth-card-logo"]')
        return !i || (i.complete && i.naturalWidth > 0)
      }, { timeout: 5000 })
      .catch(() => {})

    const m = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="booth-card"]')
      const vp = document.querySelector('[data-testid="map-viewport"]')
      if (!card || !vp) return null
      const c = card.getBoundingClientRect()
      const v = vp.getBoundingClientRect()
      const close = card.querySelector('[data-testid="booth-card-close"]')
      const link = card.querySelector('[data-testid="booth-card-website"]')
      const chips = [...card.querySelectorAll('[data-testid="booth-card-offering"]')]
      // Inside the CARD's visible area, not merely inside the document. An
      // element below the card's scroll line is present and unreachable
      // without scrolling, which is the thing worth knowing.
      const visibleInCard = el => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return r.top >= c.top - 1 && r.bottom <= c.bottom + 1
      }
      return {
        cardH: Math.round(c.height),
        cardW: Math.round(c.width),
        viewportH: Math.round(v.height),
        viewportW: Math.round(v.width),
        // How tall the card WOULD be if nothing capped it.
        contentH: Math.round(card.scrollHeight),
        mustScroll: card.scrollHeight > card.clientHeight + 1,
        coversPercentOfMap: Math.round((c.height / v.height) * 100),
        closeVisible: visibleInCard(close),
        linkVisible: visibleInCard(link),
        chipCount: chips.length,
        chipsVisible: chips.filter(visibleInCard).length,
        // Any part of the card outside the map's box is a card that is not
        // "over the map" for that part of itself.
        overhangBottom: Math.round(Math.max(0, c.bottom - v.bottom)),
        overhangTop: Math.round(Math.max(0, v.top - c.top)),
      }
    })

    if (!m) {
      console.log(`  ${s.label} (${s.row.name}): NO CARD OPENED`)
      continue
    }

    console.log(
      `  ${s.label} — ${s.row.name}, ${s.row.count} offerings\n` +
        `    map window ${m.viewportW}x${m.viewportH}, card ${m.cardW}x${m.cardH} ` +
        `(${m.coversPercentOfMap}% of the map's height)\n` +
        `    content needs ${m.contentH}px; ${m.mustScroll ? 'MUST SCROLL' : 'fits without scrolling'}\n` +
        `    close control visible: ${m.closeVisible}; website link visible: ${m.linkVisible}\n` +
        `    offering chips visible: ${m.chipsVisible} of ${m.chipCount}\n` +
        `    overhang beyond the map: ${m.overhangTop}px above, ${m.overhangBottom}px below`,
    )

    await page.screenshot({ path: join(SHOTS, `${size.name}-${s.label}.png`) })

    // ── Stress the layout with content longer than the seed contains ─────────
    //
    // Raised by Phase 9's adversarial review round 2. The longest seeded company
    // name is 12 characters and the longest offering 23, so every real card is
    // comfortably short and no measurement above can tell whether the card
    // wraps or overflows. Phase 11 lets an organizer type these values.
    //
    // The values are written into the live DOM rather than into the database:
    // the thing at risk is the CSS, the database is shared with the running
    // apps, and a test that edits real rows to prove a layout point is a bad
    // trade. Overflow is then measured against the card's own box.
    if (s.label === 'most-offerings') {
      const overflow = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="booth-card"]')
        if (!card) return null
        const long = 'Averyveryverylongunbrokencompanynamewithnospacesatallxxxxxxxxxxxx'
        const set = (sel, text) => {
          const el = card.querySelector(sel)
          if (el) el.textContent = text
        }
        set('[data-testid="booth-card-name"]', long)
        set('[data-testid="booth-card-tagline"]', `https://${long}.example.com/${long}`)
        const chip = card.querySelector('[data-testid="booth-card-offering"]')
        if (chip) chip.textContent = long
        const link = card.querySelector('[data-testid="booth-card-website"]')
        if (link) link.textContent = `https://${long}.example.com`

        // Force layout, then compare each text box against the card's box.
        void card.offsetHeight
        const c = card.getBoundingClientRect()
        const offenders = []
        for (const el of card.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (r.width === 0) continue
          if (r.right > c.right + 1 || r.left < c.left - 1) {
            offenders.push(
              `${el.getAttribute('data-testid') ?? el.tagName.toLowerCase()} ` +
                `(${Math.round(r.left)}..${Math.round(r.right)} vs card ${Math.round(c.left)}..${Math.round(c.right)})`,
            )
          }
        }
        return {
          cardScrollsSideways: card.scrollWidth > card.clientWidth + 1,
          offenders,
        }
      })

      if (overflow) {
        console.log(
          `    long-content stress: ${overflow.offenders.length === 0 && !overflow.cardScrollsSideways
            ? 'nothing overflows the card'
            : `OVERFLOW — sideways scroll ${overflow.cardScrollsSideways}; ${overflow.offenders.join('; ')}`}`,
        )
        await page.screenshot({ path: join(SHOTS, `${size.name}-long-content-stress.png`) })
      }
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="map-image"]', { timeout: 30_000 })
    await page.waitForTimeout(200)
  }

  console.log('')
  await ctx.close()
}

db.prepare(CLEANUP).run()
db.close()
await browser.close()
console.log(`Pictures in ${SHOTS}`)
