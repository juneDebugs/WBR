#!/usr/bin/env node
// Third opinion, second question: do room labels sit on top of things that are
// DRAWN INTO the picture?
//
// The Phase 8 browser suite asserts that a room label stays "within the
// picture". That is satisfied by a label sitting squarely on a different room,
// because the picture's outer rectangle is all the suite knows about. The
// shapes drawn inside it are known only to scripts/floor-plan-demo-venue.mjs.
//
// This script measures each label's box from the live page, converts it into
// percentages of the picture, and tests it against the rectangles the drawing
// actually contains — every room block, and the title block in the lower left.
//
// It reports, it does not assert. The point is to establish the facts before
// deciding whether anything needs changing.
//
// Usage: node scripts/third-opinion-label-collisions.mjs
import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const EMAIL = process.env.THIRD_OPINION_EMAIL ?? 'wbr@test.com'
const PASSWORD = process.env.THIRD_OPINION_PASSWORD ?? 'password123'

const { MAPS, BALLROOM_ROOMS, layoutMeetingRooms, layoutBooths } =
  await import(join(ROOT, 'scripts/floor-plan-demo-venue.mjs'))
const { MEETING_ROOMS } = await import(join(ROOT, 'packages/db/src/meeting-engine.ts'))
const { DatabaseSync } = await import('node:sqlite')

const db = new DatabaseSync(join(ROOT, 'packages/db/prisma/dev.db'))
const conference = db.prepare(`select id from Conference where active = 1`).get()
const boothSponsors = db
  .prepare(
    `select id, name, boothNumber from Sponsor
      where conferenceId = ? and boothNumber is not null and trim(boothNumber) <> ''
      order by boothNumber asc`,
  )
  .all(conference.id)
db.close()

// The rectangles the drawing contains, as percentages of the picture. Taken
// from the same module the drawing uses, so these ARE the drawn shapes.
const shapesByPicture = {
  'exhibit-hall': layoutBooths(boothSponsors).map(s => ({ label: s.sponsor.boothNumber, x: s.x, y: s.y, w: s.w, h: s.h })),
  'ballroom-level': BALLROOM_ROOMS.map(r => ({ label: r.label, x: r.x, y: r.y, w: r.w, h: r.h })),
  'meeting-rooms': layoutMeetingRooms(MEETING_ROOMS).map(r => ({ label: r.label, x: r.x, y: r.y, w: r.w, h: r.h })),
}

// The title block, drawn by scripts/build-floor-plan-maps.mjs at a fixed pixel
// position: x 40, y HEIGHT-124, 560 wide, 96 tall. Its position AS A PERCENTAGE
// therefore depends on how tall that particular picture is, and the maps are
// deliberately not all the same height.
//
// Raised by adversarial review round 2: this was hard-coded against 1600x1200,
// which put the block's top at 89.7% on every map. On the 1600x1000 map its real
// top is 87.6%, so a label colliding in the band between the two would have been
// reported as clear — in the script whose entire claim is that it tests labels
// against the shapes actually drawn.
const titleBlockFor = (map) => {
  const w = map.width ?? 1600
  const h = map.height ?? 1200
  return {
    label: 'the title block',
    left: (40 / w) * 100,
    top: ((h - 124) / h) * 100,
    right: ((40 + 560) / w) * 100,
    bottom: ((h - 124 + 96) / h) * 100,
  }
}

// The drawn floor area of each picture, also from the drawing script.
const FLOOR = {
  'exhibit-hall': { left: 8, top: 12, right: 92, bottom: 92 },
  'ballroom-level': { left: 8, top: 10, right: 92, bottom: 92 },
  'meeting-rooms': { left: 10, top: 12, right: 90, bottom: 90 },
}

const toBox = (s) => ({
  left: s.x - s.w / 2,
  right: s.x + s.w / 2,
  top: s.y - s.h / 2,
  bottom: s.y + s.h / 2,
})
const overlaps = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

const browser = await chromium.launch()

for (const width of [390, 768, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-testid="map-canvas"]').first().waitFor({ state: 'visible', timeout: 30_000 })

  console.log(`\n══════ viewport ${width} wide ══════`)

  const tabs = page.locator('[data-testid="map-tab"]')
  const count = await tabs.count()

  // A two-finger pinch, so the same measurement can be taken while zoomed in.
  async function pinch(factor) {
    await page.evaluate((f) => {
      const vp = document.querySelector('[data-testid="map-viewport"]')
      if (!vp) return
      const r = vp.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const start = 60
      const end = start * f
      const opts = (id, x, y) => ({
        pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
        bubbles: true, cancelable: true, isPrimary: id === 1,
      })
      vp.dispatchEvent(new PointerEvent('pointerdown', opts(1, cx - start, cy)))
      vp.dispatchEvent(new PointerEvent('pointerdown', opts(2, cx + start, cy)))
      for (let s = 1; s <= 8; s++) {
        const d = start + ((end - start) * s) / 8
        vp.dispatchEvent(new PointerEvent('pointermove', opts(1, cx - d, cy)))
        vp.dispatchEvent(new PointerEvent('pointermove', opts(2, cx + d, cy)))
      }
      vp.dispatchEvent(new PointerEvent('pointerup', opts(1, cx - end, cy)))
      vp.dispatchEvent(new PointerEvent('pointerup', opts(2, cx + end, cy)))
    }, factor)
    await page.waitForTimeout(150)
  }

  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click()
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="map-image"]')
      return Boolean(img && img.complete && img.naturalWidth > 0)
    }, undefined, { timeout: 15_000 }).catch(() => {})
    await page.locator('[data-testid="map-canvas"]').first().boundingBox()

    const state = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="map-image"]')
      const ir = img.getBoundingClientRect()
      const labels = [...document.querySelectorAll('[data-testid="pin"]')]
        .map(el => {
          const lab = el.querySelector('[data-testid="pin-label"]')
          if (!lab) return null
          const r = lab.getBoundingClientRect()
          return {
            label: el.getAttribute('data-pin-label'),
            left: ((r.left - ir.left) / ir.width) * 100,
            right: ((r.right - ir.left) / ir.width) * 100,
            top: ((r.top - ir.top) / ir.height) * 100,
            bottom: ((r.bottom - ir.top) / ir.height) * 100,
          }
        })
        .filter(Boolean)
      return { src: img.getAttribute('src'), labels }
    })

    const key = state.src.split('/').pop().replace('.png', '')
    const shapes = shapesByPicture[key] ?? []
    const floor = FLOOR[key]
    // Derived from this map's own dimensions, not from a fixed 1600x1200.
    const TITLE_BLOCK = titleBlockFor(MAPS.find(m => m.slug === key) ?? {})

    console.log(`\n  ${key} — ${state.labels.length} labels`)
    if (state.labels.length === 0) { console.log('    (no room labels on this map)'); continue }

    /** How many labels sit on something they should not. */
    const countProblems = (labels, show) => {
      let problems = 0
      for (const lab of labels) {
        const hits = []
        for (const shape of shapes) {
          if (shape.label === lab.label) continue // its own block is fine
          if (overlaps(lab, toBox(shape))) hits.push(`the "${shape.label}" block`)
        }
        if (overlaps(lab, TITLE_BLOCK)) hits.push(TITLE_BLOCK.label)
        const outsideFloor =
          lab.left < floor.left || lab.right > floor.right ||
          lab.top < floor.top || lab.bottom > floor.bottom

        if (hits.length > 0 || outsideFloor) {
          problems++
          if (show) {
            const parts = []
            if (hits.length) parts.push(`sits on ${hits.join(' and ')}`)
            if (outsideFloor) parts.push('extends outside the drawn floor')
            console.log(`      ✗ "${lab.label}" ${parts.join('; ')}`)
          }
        }
      }
      return problems
    }

    console.log('    at fit-to-width:')
    const atFit = countProblems(state.labels, true)
    if (atFit === 0) console.log('      ✓ every label is clear')
    else console.log(`      ${atFit} of ${state.labels.length} labels have a problem`)

    // The same measurement with the map zoomed in. The labels hold their size on
    // screen while the map grows, so each covers a smaller share of it — this is
    // whether that actually resolves the collisions, rather than an argument
    // that it should.
    await pinch(2.5)
    const zoomedState = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="map-image"]')
      const vp = document.querySelector('[data-testid="map-viewport"]')
      const ir = img.getBoundingClientRect()
      const labels = [...document.querySelectorAll('[data-testid="pin"]')]
        .map(el => {
          const lab = el.querySelector('[data-testid="pin-label"]')
          if (!lab) return null
          const r = lab.getBoundingClientRect()
          return {
            label: el.getAttribute('data-pin-label'),
            left: ((r.left - ir.left) / ir.width) * 100,
            right: ((r.right - ir.left) / ir.width) * 100,
            top: ((r.top - ir.top) / ir.height) * 100,
            bottom: ((r.bottom - ir.top) / ir.height) * 100,
          }
        })
        .filter(Boolean)
      return { scale: Number(vp.getAttribute('data-map-scale')), labels }
    })

    console.log(`    zoomed to ${zoomedState.scale}x:`)
    const atZoom = countProblems(zoomedState.labels, true)
    if (atZoom === 0) console.log('      ✓ every label is clear')
    else console.log(`      ${atZoom} of ${zoomedState.labels.length} labels still have a problem`)

    console.log(`    → ${atFit} problems at fit-to-width, ${atZoom} at ${zoomedState.scale}x`)

    const reset = page.locator('[data-testid="map-zoom-reset"]').first()
    if (await reset.count() > 0) await reset.click()
    await page.waitForTimeout(150)
  }

  await ctx.close()
}

await browser.close()
