#!/usr/bin/env node
// A THIRD OPINION on Phase 8 — deliberately not the Phase 8 suite.
//
// The Phase 8 browser suite proves every marker sits where its STORED
// PERCENTAGE says. It cannot prove that the stored percentage corresponds to
// the stand actually drawn in the picture. Both come from one shared module, so
// the argument that they cannot disagree is sound — but it is an argument, not
// an observation, and everything else in this phase rests on it.
//
// This script produces the observation: it signs in through the real form as a
// SEEDED account (no fixture is created, nothing is written), opens the real
// screen, and captures what is on it. The pictures are then looked at.
//
// It also records, per map, where every marker sits relative to the picture, so
// the numbers behind the pictures can be read rather than eyeballed.
//
// Usage: node scripts/third-opinion-floor-plan.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const EMAIL = process.env.THIRD_OPINION_EMAIL ?? 'wbr@test.com'
const PASSWORD = process.env.THIRD_OPINION_PASSWORD ?? 'password123'
const OUT = process.env.THIRD_OPINION_DIR ?? '/tmp/phase8-third-opinion'

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

const pageErrors = []
page.on('pageerror', e => pageErrors.push(e.message))

console.log(`Signing in at ${BASE} as ${EMAIL} (a seeded account; nothing is created)`)
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
await page.locator('button[type="submit"]').first().click()
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 })
console.log(`  landed on ${new URL(page.url()).pathname}`)

await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
await page.locator('[data-testid="map-canvas"]').first().waitFor({ state: 'visible', timeout: 30_000 })

const tabs = page.locator('[data-testid="map-tab"]')
const count = await tabs.count()
console.log(`\n${count} maps offered\n`)

const report = []

for (let i = 0; i < count; i++) {
  await tabs.nth(i).click()
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="map-image"]')
    return Boolean(img && img.complete && img.naturalWidth > 0)
  }, undefined, { timeout: 15_000 }).catch(() => {})
  await page.locator('[data-testid="map-canvas"]').first().boundingBox()

  const shot = await page.evaluate(() => {
    const img = document.querySelector('[data-testid="map-image"]')
    const ir = img.getBoundingClientRect()
    const pins = [...document.querySelectorAll('[data-testid="pin"]')].map(el => {
      const r = el.getBoundingClientRect()
      return {
        type: el.getAttribute('data-pin-type'),
        label: el.getAttribute('data-pin-label'),
        x: Number(el.getAttribute('data-pin-x')),
        y: Number(el.getAttribute('data-pin-y')),
        // Where the marker's centre sits as a fraction of the PICTURE, measured
        // from layout rather than read back from the attribute it was set from.
        measuredX: ((r.left + r.width / 2) - ir.left) / ir.width * 100,
        measuredY: ((r.top + r.height / 2) - ir.top) / ir.height * 100,
      }
    })
    const active = document.querySelector('[data-testid="map-tab"][data-active="true"]')
    return {
      map: active ? active.textContent.trim() : '(none)',
      src: img.getAttribute('src'),
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      laidOut: `${Math.round(ir.width)}x${Math.round(ir.height)}`,
      pins,
    }
  })

  const name = shot.src.split('/').pop().replace('.png', '')
  const file = join(OUT, `${i + 1}-${name}.png`)
  // The canvas only, not the whole page — so what is captured is the picture
  // and its markers and nothing else.
  await page.locator('[data-testid="map-canvas"]').first().screenshot({ path: file })

  console.log(`${i + 1}. ${shot.map}`)
  console.log(`   picture ${shot.src}  natural ${shot.natural}  laid out ${shot.laidOut}`)
  console.log(`   ${shot.pins.length} markers`)
  for (const p of shot.pins) {
    const drift = Math.hypot(p.measuredX - p.x, p.measuredY - p.y)
    console.log(
      `     ${p.type.padEnd(5)} ${String(p.label).padEnd(22)} stored ${String(p.x).padStart(5)},${String(p.y).padStart(5)}` +
      `   measured ${p.measuredX.toFixed(1).padStart(5)},${p.measuredY.toFixed(1).padStart(5)}   drift ${drift.toFixed(2)}`,
    )
  }
  console.log(`   captured → ${file}\n`)
  report.push(shot)
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(`page errors: ${pageErrors.length}${pageErrors.length ? ' — ' + pageErrors.join(' | ') : ''}`)

await browser.close()
