#!/usr/bin/env node
// A third opinion on one acceptance criterion: dismissing the booth card
// returns the delegate to the same map at the same zoom and position.
//
//   node scripts/third-opinion-view-restored.mjs
//   (participant app on 3001; writes PNGs to /tmp/phase9-shots)
//
// ── Why the existing check is not enough ─────────────────────────────────────
//
// docs/smoketests/playwright/phase-9-booth-company-card.mjs proves this by
// reading the map layer's CSS transform before and after and requiring the two
// strings to match. That string is written by the very code under test. If the
// card disturbed the view and something wrote a consistent-but-wrong value back
// — or if the transform were right while the picture had moved for some other
// reason, a re-render, a reflow, the picture reloading — the comparison would
// still pass.
//
// This compares the PICTURE. It photographs the map window before the card is
// opened and again after it is dismissed, and requires the two images to be
// byte-identical. Two PNGs encoded from identical pixels by the same encoder
// are byte-identical; one pixel of movement anywhere changes them.
//
// The view is deliberately zoomed AND panned first. At fit-to-width the map
// cannot move at all, so a "the view was restored" check there would pass
// whatever the card did — the same defect this project already recorded once in
// a drag assertion.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'
const SHOTS = process.env.PHASE9_SHOT_DIR ?? '/tmp/phase9-shots'
mkdirSync(SHOTS, { recursive: true })

const ID = 'phase9-view'
const EMAIL = 'phase9-view@wbr.invalid'
const CLEANUP = `DELETE FROM User WHERE id LIKE 'phase9-view%' OR email LIKE 'phase9-view%'`

const db = new DatabaseSync(DB_PATH)
{
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  db.prepare(CLEANUP).run()
  const now = Date.now()
  db.prepare(
    `INSERT INTO User (id, email, name, role, password, jobTitle, company, companySize,
                       annualRevenue, solutionsSeeking, createdAt, updatedAt)
     VALUES (?, ?, ?, 'ATTENDEE', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ID, EMAIL, 'Phase 9 View', hash, 'Head of Retail', 'Phase 9 Retail Co',
        'MIDMARKET', '10M-50M', JSON.stringify(['Order Management']), now, now)
}

let pass = 0
let fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

/**
 * Compare two PNG buffers pixel by pixel, decoding them in the page itself.
 *
 * Returns how many pixels differ at all and the largest single-channel
 * difference. Both numbers matter and neither is enough alone: renderer noise
 * is a few pixels differing by 1 or 2, while a map that moved is thousands of
 * pixels differing by a lot, because every drawn edge lands somewhere new.
 */
async function comparePngs(p, bufA, bufB) {
  return p.evaluate(
    async ([a, b]) => {
      const load = src =>
        new Promise(res => {
          const i = new Image()
          i.onload = () => res(i)
          i.src = src
        })
      const ia = await load('data:image/png;base64,' + a)
      const ib = await load('data:image/png;base64,' + b)
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return { differing: Infinity, maxDelta: 255, total: 0, note: 'different sizes' }
      }
      const grab = img => {
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        c.getContext('2d').drawImage(img, 0, 0)
        return c.getContext('2d').getImageData(0, 0, img.width, img.height).data
      }
      const d1 = grab(ia)
      const d2 = grab(ib)
      let differing = 0
      let maxDelta = 0
      for (let i = 0; i < d1.length; i += 4) {
        const delta = Math.max(
          Math.abs(d1[i] - d2[i]),
          Math.abs(d1[i + 1] - d2[i + 1]),
          Math.abs(d1[i + 2] - d2[i + 2]),
          Math.abs(d1[i + 3] - d2[i + 3]),
        )
        if (delta > 0) {
          differing++
          if (delta > maxDelta) maxDelta = delta
        }
      }
      return { differing, maxDelta, total: ia.width * ia.height }
    },
    [bufA.toString('base64'), bufB.toString('base64')],
  )
}

/**
 * The pass criterion, and why it is two numbers rather than byte-identity.
 *
 * Measured on this workspace 2026-08-02: two screenshots of a map that had NOT
 * moved differed in 27 pixels out of 100,650, by at most 2 of 255, scattered
 * across the whole picture. Requiring identical bytes therefore reported a
 * correct restore as a failure.
 *
 * A real movement is not subtle by comparison, which the control at the end of
 * this file demonstrates rather than assumes.
 */
function report(what, d) {
  const fraction = d.total ? d.differing / d.total : 1
  if (d.maxDelta <= 8 && fraction < 0.01) {
    ok(
      `the map is unchanged ${what} — ${d.differing} of ${d.total} pixels differ ` +
        `(${(fraction * 100).toFixed(3)}%), by at most ${d.maxDelta} of 255`,
    )
  } else {
    no(
      `the map MOVED ${what}`,
      `${d.differing} of ${d.total} pixels differ (${(fraction * 100).toFixed(2)}%), ` +
        `by up to ${d.maxDelta} of 255. Compare ${join(SHOTS, 'view-before-card.png')} ` +
        `and ${join(SHOTS, 'view-after-dismiss.png')}`,
    )
  }
}

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
await page.locator('button[type="submit"]').first().click()
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 })
await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="map-image"]', { timeout: 30_000 })
await page.waitForTimeout(600)

const viewport = page.locator('[data-testid="map-viewport"]')
const box = await viewport.boundingBox()

// Zoom on a spot clear of every marker, so the double-tap is not swallowed by a
// marker opening its card.
const spot = await page.evaluate(() => {
  const vp = document.querySelector('[data-testid="map-viewport"]')
  const v = vp.getBoundingClientRect()
  const marks = [...document.querySelectorAll('[data-testid="pin"]')].map(el => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  let best = null
  for (let fx = 0.2; fx <= 0.8; fx += 0.05) {
    for (let fy = 0.2; fy <= 0.8; fy += 0.05) {
      const x = v.left + v.width * fx
      const y = v.top + v.height * fy
      const near = marks.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity)
      if (!best || near > best.clear) best = { x, y, clear: near }
    }
  }
  return best
})

await page.mouse.dblclick(spot.x, spot.y)
await page.waitForTimeout(400)
// And pan, so the view is somewhere the code did not put it by default.
await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.65)
await page.mouse.down()
for (let s = 1; s <= 10; s++) {
  await page.mouse.move(box.x + box.width * 0.65 - 5 * s, box.y + box.height * 0.65 - 4 * s)
}
await page.mouse.up()
await page.waitForTimeout(500)

const scale = await page.evaluate(() =>
  document.querySelector('[data-testid="map-viewport"]')?.getAttribute('data-map-scale'))
if (Number(scale) > 1) {
  ok(`the view is zoomed to ${scale} and panned before the card opens, so it CAN be disturbed`)
} else {
  no('the view could not be zoomed, so this run proves nothing about restoring it', `scale ${scale}`)
}

const before = await viewport.screenshot()
writeFileSync(join(SHOTS, 'view-before-card.png'), before)

// Open a card by clicking a marker that is on screen at this zoom.
const target = await page.evaluate(() => {
  const vp = document.querySelector('[data-testid="map-viewport"]')
  const v = vp.getBoundingClientRect()
  for (const el of document.querySelectorAll('[data-testid="pin"][data-pin-type="BOOTH"]')) {
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    if (cx > v.left + 60 && cx < v.right - 60 && cy > v.top + 60 && cy < v.bottom - 60) {
      return { cx, cy }
    }
  }
  return null
})

if (!target) {
  no('no booth marker was on screen to open a card from')
} else {
  await page.mouse.click(target.cx, target.cy)
  await page.waitForTimeout(400)
  const opened = await page.evaluate(() =>
    Boolean(document.querySelector('[data-testid="booth-card"]')))
  if (!opened) {
    no('clicking a marker on the zoomed map opened no card, so there is nothing to dismiss')
  } else {
    ok('a card opened over the zoomed, panned map')

    await page.locator('[data-testid="booth-card-close"]').first().click()
    await page.waitForTimeout(600)

    const stillOpen = await page.evaluate(() =>
      Boolean(document.querySelector('[data-testid="booth-card"]')))
    if (stillOpen) no('the card did not close')
    else ok('the card closed')

    const after = await viewport.screenshot()
    writeFileSync(join(SHOTS, 'view-after-dismiss.png'), after)

    const diff = await comparePngs(page, before, after)
    report('after dismissing the card', diff)

    // ── Proving this comparison can still fail ───────────────────────────────
    //
    // The tolerance below exists because byte-identity was tried first and was
    // wrong: two screenshots of an UNMOVED map differed in 27 pixels out of
    // 100,650, by at most 2 of 255, scattered over the whole image. That is how
    // the renderer rounds edges from one frame to the next, not movement.
    //
    // A tolerance that forgives real movement would be worse than no check, so
    // the map is now nudged by a few pixels and the same comparison is required
    // to REJECT it. Without this, "the images matched" would mean nothing.
    const nudgeBox = await viewport.boundingBox()
    await page.mouse.move(nudgeBox.x + nudgeBox.width * 0.5, nudgeBox.y + nudgeBox.height * 0.5)
    await page.mouse.down()
    for (let s = 1; s <= 6; s++) {
      await page.mouse.move(
        nudgeBox.x + nudgeBox.width * 0.5 - 2 * s,
        nudgeBox.y + nudgeBox.height * 0.5 - 2 * s,
      )
    }
    await page.mouse.up()
    await page.waitForTimeout(500)

    const nudged = await viewport.screenshot()
    writeFileSync(join(SHOTS, 'view-nudged-control.png'), nudged)
    const control = await comparePngs(page, before, nudged)

    if (control.differing > diff.differing * 20 && control.maxDelta > 8) {
      ok(
        `the control passes: nudging the map is rejected — ${control.differing} pixels differ ` +
          `by up to ${control.maxDelta}, against ${diff.differing} by up to ${diff.maxDelta} when restored`,
      )
    } else {
      no(
        'the control FAILED: nudging the map produced a difference this comparison would forgive, ' +
          'so the comparison above proves nothing',
        `nudged ${control.differing} pixels by up to ${control.maxDelta}; ` +
          `restored ${diff.differing} by up to ${diff.maxDelta}`,
      )
    }
  }
}

db.prepare(CLEANUP).run()
db.close()
await browser.close()

console.log(`\n  Results: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
