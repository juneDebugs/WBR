#!/usr/bin/env node
/**
 * Phase 7 verification: below 768 pixels the company card sits under the map
 * instead of over it, and the map is capped so there is room for it.
 *
 * Every assertion is a contract check per docs/smoketests/CONTRACT.md §1.1 — a
 * measured geometry or a binary observable, never a judgement about how
 * something looks.
 *
 *   AC-1  At 390 × 844, tapping the lowest marker on a LANDSCAPE floor plan
 *         leaves that marker visible with the card open.
 *   AC-2  The same on a PORTRAIT floor plan.
 *   AC-3  The tallest seeded company card renders complete at 390 × 844, its
 *         website link visible, without the card scrolling inside itself.
 *   AC-4  With a card open, tapping a different marker shows that company — in
 *         one tap.
 *   AC-5  The card keeps a usable close control below 768.
 *   AC-6  At 1280 wide the card opens over the map exactly as before, with the
 *         overlay present.
 *   AC-7  Below 768 the card carries no aria-modal and does not trap Tab; at 768
 *         and above it does both.
 *   AC-8  Pinch and pan behave as before at every width.
 *
 * ── THE MEASUREMENTS ARE THE POINT, NOT THE MARKUP ───────────────────────────
 *
 * The predecessor attempt at this screen passed every automated assertion while
 * putting the website link off the bottom of every company card, because every
 * assertion read the markup rather than the rendered screen (UF-6, and finding
 * F-9 before it). So this run reads geometry from the browser — where things
 * actually are, in pixels — and asks `document.elementFromPoint` what is
 * genuinely on top rather than trusting a z-index.
 *
 * ── WHY IT BUILDS ITS OWN PORTRAIT FLOOR PLAN ────────────────────────────────
 *
 * AC-2 needs one and all three seeded maps are landscape — 1600×1200, 1600×1200
 * and 1600×1400. Without a portrait picture the criterion that motivated the
 * whole change cannot be exercised: the map's height comes from the picture's
 * proportions (UF-5), so a portrait picture is the case that leaves no room
 * under the map. The run adds a map row with a picture and two markers,
 * measures, and removes them. Nothing it creates outlives it.
 *
 * THE PICTURE IS STORED THE WAY AN ORGANIZER'S UPLOAD STORES ONE — as a base64
 * data URL in the map's `imageUrl` column, which the participant app then serves
 * through /api/data/map/<id>/image. Two reasons, the first measured.
 *
 * An earlier version wrote a PNG into apps/attendee/public/maps and pointed the
 * map at it. That works on a development server and DOES NOT WORK on a
 * production build: Next.js takes its list of public files at build time, so a
 * file written afterwards answers 404. Measured against `next start`:
 * phase7-portrait-probe.png → 404, exhibit-hall.png → 200. The picture never
 * appeared, the map window kept the previous map's proportions, and the run
 * reported eight of the nine portrait checks as passing while showing a
 * landscape map. Only the proportions check noticed.
 *
 * And a data URL is what an uploaded map actually is, so the probe exercises the
 * same path a real one does rather than a seeded file path that only the three
 * built-in maps use.
 *
 * Prerequisites:
 *   - The participant app reachable at ATTENDEE_BASE_URL (default
 *     http://localhost:3001), serving THIS branch. Check the port first:
 *       lsof -nP -iTCP:3001 -sTCP:LISTEN
 *     A process whose age is measured in days is not this run's server.
 *   - apps/attendee/.env.local with DATABASE_URL as an ABSOLUTE file: path.
 *   - Playwright with Chromium.
 *
 * Usage:
 *   node docs/smoketests/playwright/phase-7-map-card-below-map.mjs
 *
 * Exits 0 on pass, 1 on any assertion failure or setup error.
 */

import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { deflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE_URL = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const COOKIE_NAME = BASE_URL.startsWith('https://')
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token'
const EMAIL = process.env.ATTENDEE_EMAIL ?? 'stephcurry@test.com'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'

/** The screen the acceptance criteria are written against. */
const PHONE = { width: 390, height: 844 }
/** A width comfortably above the 768 threshold, for the unchanged-at-wide checks. */
const DESKTOP = { width: 1280, height: 900 }

const PROBE = {
  mapId: 'phase7-portrait-probe',
  mapName: 'Portrait Probe',
  pinLow: 'phase7-probe-pin-low',
  pinHigh: 'phase7-probe-pin-high',
  // 0.6 — taller than it is wide by a long way, which is the shape that left no
  // room under the map before this change.
  width: 900,
  height: 1500,
}

let passCount = 0
let failCount = 0
function ok(msg) { passCount++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failCount++; console.log(`  ✗ ${msg}`) }
function step(title) { console.log(`\n${title}`) }

/**
 * Run one group of assertions and turn anything it throws into a failure.
 *
 * A run that stops at an exception reports no count, and a missing count is not
 * a result — it is silence that reads like a crash in the harness rather than a
 * defect in the screen. Found by running a negative control: with the card put
 * back over the map, the card covers the middle of the map, so the double tap
 * lands on the card, no zoom happens, the "Fit map" control never appears, and
 * the click on it threw. Every assertion up to that point had correctly failed
 * and none of it was reported.
 */
async function group(title, fn) {
  step(title)
  try {
    await fn()
  } catch (err) {
    fail(`this group stopped early: ${err.message.split('\n')[0]}`)
  }
}

/** Click something, and fail rather than throw when it is not there. */
async function clickOrFail(locator, description, timeout = 5000) {
  try {
    await locator.click({ timeout })
    return true
  } catch {
    fail(`${description} — the control was not there to click`)
    return false
  }
}

// ── the portrait picture, written by hand ───────────────────────────────────
//
// A PNG is a signature plus three chunks, and a chunk is length, type, data and
// a CRC. Built here rather than committed, so the repository does not carry a
// test picture that looks like a floor plan and is not one.
function portraitPngBytes(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // colour type: truecolour
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3)
    // Bands, so a person looking at a screenshot can tell top from bottom.
    const shade = 180 + ((y / height) * 60 | 0)
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = shade
      row[2 + x * 3] = 200
      row[3 + x * 3] = 235
    }
    rows.push(row)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

// ── plumbing ────────────────────────────────────────────────────────────────

async function signIn() {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  if (!csrfRes.ok) throw new Error(`GET /api/auth/csrf -> ${csrfRes.status}`)
  const { csrfToken } = await csrfRes.json()
  const cookies = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, json: 'true' }),
    redirect: 'manual',
  })
  const raw = (res.headers.getSetCookie?.() ?? []).find(c => c.startsWith(`${COOKIE_NAME}=`))
  if (!raw) throw new Error(`sign-in for ${EMAIL} set no session cookie (HTTP ${res.status})`)
  return raw.split(';')[0].split('=').slice(1).join('=')
}

async function openMap(browser, cookie, viewport, { touch = true } = {}) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch,
  })
  await ctx.addCookies([{ name: COOKIE_NAME, value: cookie, url: BASE_URL, httpOnly: true, sameSite: 'Lax' }])
  const page = await ctx.newPage()
  // NOT networkidle: this screen holds a live-update connection open, so the
  // network never goes idle and the wait times out.
  await page.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="map-viewport"]', { timeout: 30_000 })
  await page.waitForTimeout(2000)
  return { ctx, page }
}

/**
 * Tell the participant app its list of maps has changed.
 *
 * NOT OPTIONAL, and it took a flaky run to learn why. That list is cached for
 * 300 seconds under the tag `floor-plan` (apps/attendee/lib/floor-plan-data.ts),
 * so a probe map inserted straight into the database does not appear until the
 * cache expires — the run passed while the cache happened to be cold and later
 * reported "no map tab named Portrait Probe" for a map that was certainly there.
 *
 * This is the same address the organizer's application posts to whenever it
 * changes a map, with the same shared secret, so the run is using the ordinary
 * mechanism rather than working around it.
 */
async function revalidateFloorPlan() {
  let secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    try {
      const env = readFileSync(join(ROOT, 'apps/attendee/.env.local'), 'utf8')
      secret = env.split('\n').find(l => l.startsWith('NEXTAUTH_SECRET='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
    } catch { /* handled below */ }
  }
  if (!secret) throw new Error('NEXTAUTH_SECRET not found — cannot clear the map cache, and the probe map would not appear')
  const res = await fetch(`${BASE_URL}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, tags: ['floor-plan', 'conference'] }),
  })
  if (!res.ok) throw new Error(`POST /api/revalidate -> ${res.status}: ${await res.text()}`)
}

async function chooseTab(page, name) {
  const tabs = page.locator('[data-testid="map-tab"]')
  for (let i = 0; i < await tabs.count(); i++) {
    if ((await tabs.nth(i).innerText()).trim() === name) {
      await tabs.nth(i).click()
      await page.waitForTimeout(1400)
      return true
    }
  }
  return false
}

/** Everything this run measures, read from the rendered page in one go. */
const readGeometry = page => page.evaluate(() => {
  const box = el => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return {
      top: Math.round(b.top), bottom: Math.round(b.bottom),
      left: Math.round(b.left), right: Math.round(b.right),
      w: Math.round(b.width), h: Math.round(b.height),
    }
  }
  const card = document.querySelector('[data-testid="booth-card"]')
  const backdrop = document.querySelector('[data-testid="booth-card-backdrop"]')
  const link = document.querySelector('[data-testid="booth-card-website"]')
  return {
    win: { w: window.innerWidth, h: window.innerHeight },
    docHeight: Math.round(document.documentElement.scrollHeight),
    viewport: box(document.querySelector('[data-testid="map-viewport"]')),
    image: box(document.querySelector('[data-testid="map-image"]')),
    card: box(card),
    cardName: document.querySelector('[data-testid="booth-card-name"]')?.textContent ?? null,
    cardPosition: card ? getComputedStyle(card).position : null,
    cardScrollsInside: card ? card.scrollHeight > card.clientHeight + 1 : null,
    ariaModal: card ? card.getAttribute('aria-modal') : null,
    backdropPresent: !!backdrop,
    backdropShown: backdrop ? getComputedStyle(backdrop).display !== 'none' : false,
    website: link ? { ...box(link), visible: box(link).bottom <= window.innerHeight && box(link).top >= 0 } : null,
    closeControl: box(document.querySelector('[data-testid="booth-card-close"]')),
    tabBarTop: (() => { const t = document.querySelector('.tab-bar'); return t ? Math.round(t.getBoundingClientRect().top) : null })(),
  }
})

/** The lowest marker on screen, and whether anything is drawn on top of it. */
async function lowestMarker(page) {
  const pins = page.locator('[data-testid="pin"]')
  const n = await pins.count()
  let index = -1, y = -Infinity
  for (let i = 0; i < n; i++) {
    const b = await pins.nth(i).boundingBox()
    if (b && b.y > y) { y = b.y; index = i }
  }
  return { index, count: n, locator: pins.nth(index) }
}

const markerState = locator => locator.evaluate(el => {
  const b = el.getBoundingClientRect()
  const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
  return {
    onScreen: b.top >= 0 && b.bottom <= window.innerHeight,
    // What is actually on top at the marker's own middle. A z-index says what
    // should be there; this says what is.
    topmostIsMarker: !!hit && (hit === el || el.contains(hit) || hit.contains(el)),
    topmost: hit ? (hit.getAttribute('data-testid') ?? hit.tagName.toLowerCase()) : null,
  }
})

// ── the run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('Phase 7 — the company card sits under the map on a phone')
  console.log(`App:      ${BASE_URL}`)
  console.log(`Database: ${DB_PATH}`)

  const db = new DatabaseSync(DB_PATH)
  const browser = await chromium.launch()

  try {
    // ── the portrait floor plan this run owns ────────────────────────────────
    const png = portraitPngBytes(PROBE.width, PROBE.height)
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    const conference = db.prepare('SELECT conferenceId FROM VenueMap ORDER BY position LIMIT 1').get()
    if (!conference) throw new Error('no VenueMap rows — nothing to attach a probe map to')
    db.prepare(`
      INSERT OR REPLACE INTO VenueMap (id, conferenceId, name, imageUrl, position, createdAt)
      VALUES (?, ?, ?, ?, 99, datetime('now'))
    `).run(PROBE.mapId, conference.conferenceId, PROBE.mapName, dataUrl)

    // The two markers: one near the bottom, which is the one the criterion is
    // about, and one near the top so a second company is a tap away for AC-4.
    // Both borrow a real exhibiting company, so the card has real content.
    const sponsors = db.prepare(`
      SELECT DISTINCT sponsorId FROM Pin WHERE sponsorId IS NOT NULL LIMIT 2
    `).all()
    if (sponsors.length < 2) throw new Error('need two companies with markers to probe with')
    db.prepare(`
      INSERT OR REPLACE INTO Pin (id, venueMapId, type, label, x, y, sponsorId, createdAt)
      VALUES (?, ?, 'BOOTH', NULL, 50, 92, ?, datetime('now'))
    `).run(PROBE.pinLow, PROBE.mapId, sponsors[0].sponsorId)
    db.prepare(`
      INSERT OR REPLACE INTO Pin (id, venueMapId, type, label, x, y, sponsorId, createdAt)
      VALUES (?, ?, 'BOOTH', NULL, 20, 15, ?, datetime('now'))
    `).run(PROBE.pinHigh, PROBE.mapId, sponsors[1].sponsorId)
    await revalidateFloorPlan()
    console.log(`Probe map created: ${PROBE.width}×${PROBE.height}, aspect ${(PROBE.width / PROBE.height).toFixed(3)}, map cache cleared`)

    const cookie = await signIn()

    // ── AC-1, AC-2: the tapped marker stays visible, both shapes ─────────────
    for (const [label, tab] of [['landscape', 'Exhibit Hall'], ['portrait', PROBE.mapName]]) {
      step(`AC-1/AC-2 — ${label} floor plan at ${PHONE.width}×${PHONE.height}: the tapped marker stays visible`)
      const { ctx, page } = await openMap(browser, cookie, PHONE)
      try {
        if (!await chooseTab(page, tab)) { fail(`no map tab named "${tab}"`); continue }
        const before = await readGeometry(page)

        // ── IS THE PICTURE ON SCREEN THE ONE THIS CHECK IS ABOUT? ───────────
        //
        // Asked before anything is measured, because the answer was once no and
        // almost nothing noticed. The probe picture used to be a file written
        // into the public folder, which a production build does not serve, so
        // the picture never loaded, the map window kept the previous map's
        // proportions, and eight of the nine portrait assertions passed while
        // the screen showed a landscape map.
        //
        // The picture's own dimensions are the thing to ask about: they come
        // from the decoded file, so they cannot be right by accident.
        const shown = await page.evaluate(() => {
          const img = document.querySelector('[data-testid="map-image"]')
          return img ? { w: img.naturalWidth, h: img.naturalHeight, complete: img.complete } : null
        })
        const expectPicture = label === 'portrait'
          ? { w: PROBE.width, h: PROBE.height }
          : null
        if (!shown || !shown.complete || shown.w === 0) {
          fail(`${label}: the map picture has not loaded — nothing measured below means anything`)
          continue
        }
        if (expectPicture && (shown.w !== expectPicture.w || shown.h !== expectPicture.h)) {
          fail(`${label}: the picture on screen is ${shown.w}×${shown.h}, not the probe's ${expectPicture.w}×${expectPicture.h} — this is a different map`)
          continue
        }
        ok(`${label}: the picture on screen is the one this check is about (${shown.w}×${shown.h})`)

        const { locator, count } = await lowestMarker(page)
        if (count === 0) { fail(`${label}: no markers on this map`); continue }

        const beforeTap = await markerState(locator)
        if (beforeTap.onScreen) ok(`${label}: the lowest marker is on screen before the tap`)
        else fail(`${label}: the lowest marker is already off screen before any tap`)

        await locator.click({ force: true })
        await page.waitForTimeout(500)
        const after = await readGeometry(page)
        if (!after.card) { fail(`${label}: tapping the lowest marker opened no card`); continue }

        const state = await markerState(locator)
        if (state.onScreen) ok(`${label}: the tapped marker is still on screen with the card open`)
        else fail(`${label}: the tapped marker went off screen — top ${before.viewport.top}, card at ${after.card.top}`)

        if (state.topmostIsMarker) ok(`${label}: nothing is drawn over the tapped marker`)
        else fail(`${label}: the marker is covered by ${state.topmost}`)

        if (after.card.top >= after.viewport.bottom) {
          ok(`${label}: the card starts below the map (card ${after.card.top}, map ends ${after.viewport.bottom})`)
        } else {
          fail(`${label}: the card overlaps the map — card top ${after.card.top}, map bottom ${after.viewport.bottom}`)
        }

        // The picture is scaled, not cut off. Height comes from the picture's
        // own proportions, so a cap applied as a height would clip it and take
        // the lower markers with it.
        const expectedH = Math.round(after.viewport.w / (PROBE.width / PROBE.height))
        if (label === 'portrait') {
          if (Math.abs(after.image.h - after.viewport.h) <= 2) {
            ok(`portrait: the whole picture is inside the map window (${after.image.w}×${after.image.h})`)
          } else {
            fail(`portrait: picture ${after.image.w}×${after.image.h} against window ${after.viewport.w}×${after.viewport.h} — it is being clipped`)
          }
          if (Math.abs(after.image.h - expectedH) <= 2) {
            ok(`portrait: the picture keeps its proportions (${after.image.h} tall for ${after.image.w} wide)`)
          } else {
            fail(`portrait: proportions lost — ${after.image.w}×${after.image.h}, expected ${expectedH} tall`)
          }

          // ── THE CHECKS THAT MAKE THE HEIGHT CAP LOAD-CARRYING ──────────────
          //
          // Everything above this point still passes with no cap at all: an
          // uncapped portrait map is 610 pixels tall, the card is placed under
          // it at 736, and the tapped marker is still on screen — so the four
          // assertions above are satisfied while the card hangs off the bottom
          // of the phone. Found by asking what a negative control would prove,
          // before running one.
          //
          // These three are what the cap actually buys, and they are the reason
          // the number was measured rather than chosen.
          if (after.card.bottom <= after.win.h) {
            ok(`portrait: the whole card is inside the window (ends ${after.card.bottom} of ${after.win.h})`)
          } else {
            fail(`portrait: the card ends at ${after.card.bottom}, past the bottom of a ${after.win.h} window`)
          }
          if (after.docHeight <= after.win.h) {
            ok('portrait: the page does not scroll to show the card')
          } else {
            fail(`portrait: the page grew to ${after.docHeight} against a window of ${after.win.h}`)
          }
          if (after.website?.visible) {
            ok(`portrait: the website link is visible (bottom ${after.website.bottom})`)
          } else {
            fail(`portrait: the website link is not visible — bottom ${after.website?.bottom} of ${after.win.h}`)
          }
        }
      } finally {
        await ctx.close()
      }
    }

    // ── AC-3: the tallest card renders complete ─────────────────────────────
    step('AC-3 — the tallest seeded company card renders complete at 390 × 844')
    {
      const { ctx, page } = await openMap(browser, cookie, PHONE)
      try {
        // ── EVERY SEEDED MAP, NOT ONE OF THEM ───────────────────────────────
        //
        // This looked at Exhibit Hall alone, which proves something narrower
        // than the criterion says: the tallest card among the markers on ONE
        // map. Move the tallest company's marker to another map, or add a
        // company with more offerings to a different one, and this would go on
        // passing while never opening the card that would fail it. Raised by
        // adversarial review round 3.
        //
        // The probe map is skipped: its markers borrow companies that are
        // already on the seeded maps, so it adds nothing, and "seeded" in the
        // criterion means the data the demonstration runs on rather than
        // anything this run invented.
        const tabNames = []
        const tabs = page.locator('[data-testid="map-tab"]')
        for (let i = 0; i < await tabs.count(); i++) {
          const name = (await tabs.nth(i).innerText()).trim()
          if (name !== PROBE.mapName) tabNames.push(name)
        }
        console.log(`    looking at ${tabNames.length} seeded maps: ${tabNames.join(', ')}`)

        let tallest = null
        let cardsOpened = 0
        for (const name of tabNames) {
          await chooseTab(page, name)
          const pins = page.locator('[data-testid="pin"]')
          for (let i = 0; i < await pins.count(); i++) {
            await pins.nth(i).click({ force: true })
            await page.waitForTimeout(300)
            const g = await readGeometry(page)
            if (!g.card) continue
            cardsOpened++
            if (!tallest || g.card.h > tallest.card.h) tallest = g
            await page.locator('[data-testid="booth-card-close"]').click().catch(() => {})
            await page.waitForTimeout(150)
          }
        }
        console.log(`    ${cardsOpened} company cards opened across those maps`)
        if (cardsOpened === 0) fail('no company card opened on any seeded map — this check measured nothing')
        else ok(`${cardsOpened} company cards were measured, across every seeded map`)

        if (!tallest) { fail('no company card opened at all') }
        else {
          console.log(`    tallest card: ${tallest.cardName}, ${tallest.card.h}px, ending at y=${tallest.card.bottom}`)
          if (tallest.cardScrollsInside === false) ok(`${tallest.cardName}'s card does not scroll inside itself`)
          else fail(`${tallest.cardName}'s card scrolls inside itself — its end is hidden`)

          if (tallest.website?.visible) ok(`the website link is inside the window (bottom ${tallest.website.bottom} of ${tallest.win.h})`)
          else fail(`the website link is not visible — bottom ${tallest.website?.bottom} of ${tallest.win.h}`)

          if (tallest.docHeight <= tallest.win.h) ok('the page does not scroll to show it')
          else fail(`the page grew to ${tallest.docHeight} against a window of ${tallest.win.h} — the card no longer fits`)

          if (tallest.tabBarTop === null || tallest.card.bottom <= tallest.tabBarTop) {
            ok(`the card ends clear of the bottom bar (${tallest.card.bottom} against ${tallest.tabBarTop})`)
          } else {
            fail(`the card runs into the bottom bar — ends ${tallest.card.bottom}, bar starts ${tallest.tabBarTop}`)
          }
        }
      } finally {
        await ctx.close()
      }
    }

    // ── AC-4, AC-5: one tap to a second company, and a close control ─────────
    step('AC-4/AC-5 — a second marker takes one tap, and the close control works')
    {
      const { ctx, page } = await openMap(browser, cookie, PHONE)
      try {
        await chooseTab(page, 'Exhibit Hall')
        const pins = page.locator('[data-testid="pin"]')
        await pins.nth(0).click({ force: true })
        await page.waitForTimeout(400)
        const first = await readGeometry(page)
        if (!first.card) { fail('the first marker opened no card') }
        else {
          // ONE tap on a different marker. If the overlay were still there it
          // would swallow this tap to close the first card, and the count would
          // have to be two.
          await pins.nth(1).click({ force: true })
          await page.waitForTimeout(400)
          const second = await readGeometry(page)
          if (second.card && second.cardName && second.cardName !== first.cardName) {
            ok(`one tap moved the card from ${first.cardName} to ${second.cardName}`)
          } else if (!second.card) {
            fail('the tap on a second marker closed the card instead of switching it — the overlay is still swallowing taps')
          } else {
            fail(`the card still shows ${second.cardName} after tapping a different marker`)
          }

          if (second.backdropShown === false) ok('no overlay is drawn over the map below 768')
          else fail('the overlay is still drawn below 768')

          const close = second.closeControl
          if (close && close.w >= 44 && close.h >= 44) ok(`the close control is ${close.w}×${close.h}, a reliable target`)
          else fail(`the close control is ${close ? `${close.w}×${close.h}` : 'absent'}`)

          if (await clickOrFail(page.locator('[data-testid="booth-card-close"]'), 'the close control does not dismiss the card')) {
            await page.waitForTimeout(300)
            const closed = await readGeometry(page)
            if (!closed.card) ok('the close control dismisses the card')
            else fail('the close control did not dismiss the card')
          }
        }
      } finally {
        await ctx.close()
      }
    }

    // ── AC-7 (narrow half): no aria-modal, no Tab trap ──────────────────────
    step('AC-7 — below 768 the card claims no modal behaviour, and does not trap Tab')
    {
      const { ctx, page } = await openMap(browser, cookie, PHONE)
      try {
        await chooseTab(page, 'Exhibit Hall')
        await page.locator('[data-testid="pin"]').nth(0).click({ force: true })
        await page.waitForTimeout(400)
        const g = await readGeometry(page)
        if (g.ariaModal === null) ok('the card carries no aria-modal below 768')
        else fail(`the card claims aria-modal="${g.ariaModal}" below 768, while everything behind it is reachable`)

        // Tab from the last control inside the card must LEAVE it. Under a trap
        // it would cycle back to the first.
        const escaped = await page.evaluate(async () => {
          const card = document.querySelector('[data-testid="booth-card"]')
          const inside = [...card.querySelectorAll('a[href], button:not([disabled])')]
          if (inside.length === 0) return 'no focusable controls in the card'
          inside[inside.length - 1].focus()
          return 'ready'
        })
        if (escaped !== 'ready') { fail(escaped) }
        else {
          await page.keyboard.press('Tab')
          await page.waitForTimeout(150)
          const stillInside = await page.evaluate(() => {
            const card = document.querySelector('[data-testid="booth-card"]')
            return !!card && card.contains(document.activeElement)
          })
          if (!stillInside) ok('Tab moves out of the card below 768 — the markers behind it stay reachable')
          else fail('Tab is trapped inside the card below 768, so the reachable markers cannot be reached by keyboard')
        }
      } finally {
        await ctx.close()
      }
    }

    // ── AC-6, AC-7 (wide half): nothing changed at 1280 ─────────────────────
    step('AC-6/AC-7 — at 1280 the card opens over the map, with the overlay and the modal behaviour')
    {
      const { ctx, page } = await openMap(browser, cookie, DESKTOP, { touch: false })
      try {
        await chooseTab(page, 'Exhibit Hall')
        const before = await readGeometry(page)
        await page.locator('[data-testid="pin"]').nth(0).click({ force: true })
        await page.waitForTimeout(400)
        const g = await readGeometry(page)
        if (!g.card) { fail('no card opened at 1280') }
        else {
          if (g.cardPosition === 'absolute') ok('the card is positioned over the map at 1280')
          else fail(`the card is ${g.cardPosition} at 1280 — expected absolute`)

          if (g.card.top < before.viewport.bottom) ok(`the card overlaps the map at 1280 (card ${g.card.top}, map ends ${before.viewport.bottom})`)
          else fail(`the card sits below the map at 1280 — this width was meant to be unchanged`)

          if (g.backdropShown) ok('the overlay is present at 1280')
          else fail('the overlay is missing at 1280')

          if (g.ariaModal === 'true') ok('the card claims aria-modal at 1280')
          else fail(`the card carries aria-modal="${g.ariaModal}" at 1280 — expected "true"`)

          const trapped = await page.evaluate(async () => {
            const card = document.querySelector('[data-testid="booth-card"]')
            const inside = [...card.querySelectorAll('a[href], button:not([disabled])')]
            if (inside.length === 0) return null
            inside[inside.length - 1].focus()
            return true
          })
          if (trapped) {
            await page.keyboard.press('Tab')
            await page.waitForTimeout(150)
            const stillInside = await page.evaluate(() => {
              const card = document.querySelector('[data-testid="booth-card"]')
              return !!card && card.contains(document.activeElement)
            })
            if (stillInside) ok('Tab stays inside the card at 1280')
            else fail('Tab escapes the card at 1280, while the overlay makes everything behind it unreachable')
          }

          // The map is not capped at this width.
          const capped = await page.evaluate(() => {
            const vp = document.querySelector('[data-testid="map-viewport"]')
            return getComputedStyle(vp).maxWidth
          })
          if (capped === 'none') ok('no height cap is applied at 1280')
          else fail(`the map carries max-width ${capped} at 1280 — the cap is meant to be narrow-only`)
        }
      } finally {
        await ctx.close()
      }
    }

    // ── AC-8: pinch and pan still work ──────────────────────────────────────
    step('AC-8 — pinch and pan behave as before, at both widths')
    for (const [label, viewport] of [['390 wide', PHONE], ['1280 wide', DESKTOP]]) {
      const { ctx, page } = await openMap(browser, cookie, viewport, { touch: viewport === PHONE })
      try {
        await chooseTab(page, 'Exhibit Hall')
        const scaleOf = () => page.locator('[data-testid="map-viewport"]').getAttribute('data-map-scale')
        const atRest = await scaleOf()

        // Double tap to zoom — the gesture the screen's own instructions name.
        const vp = page.locator('[data-testid="map-viewport"]')
        const box = await vp.boundingBox()
        await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
        await page.waitForTimeout(600)
        const zoomed = await scaleOf()
        if (Number(zoomed) > Number(atRest)) ok(`${label}: double tap zooms in (${atRest} → ${zoomed})`)
        else fail(`${label}: double tap did not zoom (${atRest} → ${zoomed})`)

        // Drag to move, while zoomed in.
        const canvasBefore = await page.locator('[data-testid="map-canvas"]').evaluate(el => el.style.transform)
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 40, { steps: 8 })
        await page.mouse.up()
        await page.waitForTimeout(400)
        const canvasAfter = await page.locator('[data-testid="map-canvas"]').evaluate(el => el.style.transform)
        if (canvasAfter !== canvasBefore) ok(`${label}: dragging moves the map`)
        else fail(`${label}: dragging did not move the map`)

        // And the way back.
        if (await clickOrFail(page.locator('[data-testid="map-zoom-reset"]'), `${label}: "Fit map" is unreachable`)) {
          await page.waitForTimeout(500)
          const reset = await scaleOf()
          if (Number(reset) === Number(atRest)) ok(`${label}: "Fit map" returns to the resting view`)
          else fail(`${label}: "Fit map" left the scale at ${reset}, expected ${atRest}`)
        }
      } finally {
        await ctx.close()
      }
    }
    // ── AC-10: switching markers is a real open, not a change of contents ────
    //
    // Not in the plan's criteria. Added because this phase created the case:
    // below 768 the overlay is gone, so a second marker switches the card in
    // place instead of closing it, and the card was being reused rather than
    // reopened. Raised by adversarial review round 2.
    await group('AC-10 — opening a second marker is a real open (round 2 finding)', async () => {
      const { ctx, page } = await openMap(browser, cookie, PHONE)
      try {
        await chooseTab(page, 'Exhibit Hall')
        const pins = page.locator('[data-testid="pin"]')
        await pins.nth(0).click({ force: true })
        await page.waitForTimeout(400)
        const firstName = (await readGeometry(page)).cardName

        // The second marker is opened BY KEYBOARD — focus it, then press Enter.
        //
        // Not a stylistic choice. The map takes over pointer presses to pan, so
        // pressing a marker with a mouse never gives it focus, and "closing
        // returns focus to the marker that opened it" is a promise to somebody
        // operating this with a keyboard or a screen reader. Driving it with a
        // mouse would assert nothing about them: measured, the return landed on
        // the document body either way.
        await pins.nth(1).evaluate(el => el.focus())
        await page.keyboard.press('Enter')
        await page.waitForTimeout(400)
        const second = await readGeometry(page)
        if (second.cardName && second.cardName !== firstName) ok(`the card switched to ${second.cardName}`)
        else fail(`the card did not switch — still ${second.cardName}`)

        // Focus must be on the card that is now showing, as it would be had it
        // been opened from nothing.
        const focusOnCard = await page.evaluate(() => {
          const card = document.querySelector('[data-testid="booth-card"]')
          return !!card && (document.activeElement === card || card.contains(document.activeElement))
        })
        if (focusOnCard) ok('focus is on the card that is now showing')
        else fail('focus was left behind when the card switched — a screen reader is told nothing')

        // And closing must return focus to the marker actually opened, not the
        // first one tapped.
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
        const returned = await page.evaluate(() => {
          const active = document.activeElement
          const pins = [...document.querySelectorAll('[data-testid="pin"]')]
          return { index: pins.findIndex(p => p === active || p.contains(active)), count: pins.length }
        })
        if (returned.index === 1) ok('closing returns focus to the second marker, the one that was opened')
        else fail(`closing returned focus to marker index ${returned.index}, expected 1`)
      } finally {
        await ctx.close()
      }
    })

    // ── AC-11: becoming modal collects the focus it is about to shut in ──────
    await group('AC-11 — crossing 768 with a card open does not leave focus behind the overlay (round 2 finding)', async () => {
      const { ctx, page } = await openMap(browser, cookie, PHONE)
      try {
        await chooseTab(page, 'Exhibit Hall')
        await page.locator('[data-testid="pin"]').nth(0).click({ force: true })
        await page.waitForTimeout(400)

        // Leave the card by keyboard, which below 768 is allowed on purpose.
        await page.evaluate(() => {
          const card = document.querySelector('[data-testid="booth-card"]')
          const inside = [...card.querySelectorAll('a[href], button:not([disabled])')]
          inside[inside.length - 1].focus()
        })
        await page.keyboard.press('Tab')
        await page.waitForTimeout(200)
        const outside = await page.evaluate(() => {
          const card = document.querySelector('[data-testid="booth-card"]')
          return !card.contains(document.activeElement)
        })
        if (outside) ok('Tab leaves the card below 768, as intended')
        else fail('Tab did not leave the card below 768')

        // Now widen past 768 — what turning a phone on its side does.
        await page.setViewportSize({ width: 900, height: 600 })
        await page.waitForTimeout(700)

        const state = await page.evaluate(() => {
          const card = document.querySelector('[data-testid="booth-card"]')
          const backdrop = document.querySelector('[data-testid="booth-card-backdrop"]')
          return {
            stillOpen: !!card,
            ariaModal: card ? card.getAttribute('aria-modal') : null,
            backdropShown: backdrop ? getComputedStyle(backdrop).display !== 'none' : false,
            focusInside: !!card && (document.activeElement === card || card.contains(document.activeElement)),
          }
        })
        if (!state.stillOpen) { fail('the card closed on resize — this check needs it open'); return }
        if (state.ariaModal === 'true' && state.backdropShown) ok('past 768 the card is modal again, with its overlay')
        else fail(`past 768 the card reports aria-modal=${state.ariaModal}, overlay shown=${state.backdropShown}`)
        if (state.focusInside) ok('focus was collected into the card as it became modal')
        else fail('focus was left behind the overlay, on something the person can no longer reach')
      } finally {
        await ctx.close()
      }
    })

    // ── AC-9: the map stays inside its window when that window changes size ──
    //
    // Not in the plan's criteria. Added because adversarial review found that
    // the pan limit is worked out from the window's measured box and nothing
    // recomputed it when that box changed — so a person zoomed in and dragged to
    // an edge kept an offset that was legal for the old box. Turning a phone on
    // its side reaches it, and this phase made that worse by giving the screen a
    // rule that applies below 768 and not above.
    //
    // THE WINDOW MUST GET SMALLER, and that took a negative control to learn.
    // The first version of this check started narrow and turned the phone to
    // landscape, which made the window BIGGER — and a bigger window allows more
    // panning, so an offset that was legal before is still legal after and the
    // check passed with the fix removed. It proved nothing. Starting wide and
    // ending narrow is the direction that can strand the map, so that is the
    // direction to test.
    await group('AC-9 — a smaller window does not throw the map out of it (round 1 finding)', async () => {
      const { ctx, page } = await openMap(browser, cookie, DESKTOP, { touch: false })
      try {
        await chooseTab(page, PROBE.mapName)
        const vp = page.locator('[data-testid="map-viewport"]')
        const box = await vp.boundingBox()

        // Zoom in, then drag hard to the right and down, which parks the map at
        // the limit the current box allows.
        await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
        await page.waitForTimeout(600)
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 2, box.y + box.height * 2, { steps: 10 })
        await page.mouse.up()
        await page.waitForTimeout(400)

        const parked = await page.evaluate(() => {
          const canvas = document.querySelector('[data-testid="map-canvas"]')
          const vp = document.querySelector('[data-testid="map-viewport"]')
          const c = canvas.getBoundingClientRect(), v = vp.getBoundingClientRect()
          return { scale: vp.getAttribute('data-map-scale'), gapLeft: Math.round(c.left - v.left), gapTop: Math.round(c.top - v.top) }
        })
        if (Number(parked.scale) > 1) ok(`zoomed to ${parked.scale} and dragged to the edge`)
        else fail(`could not zoom in — scale stayed at ${parked.scale}`)

        // Now shrink the window to a phone. This crosses 768, so the height cap
        // comes into force as well — the box does not merely change, it becomes
        // a great deal smaller, which is exactly when a stale offset strands the
        // map.
        await page.setViewportSize(PHONE)
        await page.waitForTimeout(700)

        const after = await page.evaluate(() => {
          const canvas = document.querySelector('[data-testid="map-canvas"]')
          const vp = document.querySelector('[data-testid="map-viewport"]')
          const c = canvas.getBoundingClientRect(), v = vp.getBoundingClientRect()
          return {
            // Positive numbers mean an edge of the map has come inside the
            // window, which is the state the pan limit exists to prevent.
            gapLeft: Math.round(c.left - v.left),
            gapTop: Math.round(c.top - v.top),
            gapRight: Math.round(v.right - c.right),
            gapBottom: Math.round(v.bottom - c.bottom),
          }
        })
        const worst = Math.max(after.gapLeft, after.gapTop, after.gapRight, after.gapBottom)
        if (worst <= 1) {
          ok(`the map still covers its window after the turn (worst edge gap ${worst}px)`)
        } else {
          fail(`an edge of the map came ${worst}px inside the window after the turn — ${JSON.stringify(after)}`)
        }
      } finally {
        await ctx.close()
      }
    })
  } finally {
    step('Cleanup')
    await browser.close()
    const pins = db.prepare('DELETE FROM Pin WHERE venueMapId = ?').run(PROBE.mapId).changes
    const maps = db.prepare('DELETE FROM VenueMap WHERE id = ?').run(PROBE.mapId).changes
    db.close()
    // Clear the cache on the way out too, so the app is not left offering a map
    // tab whose picture and markers have gone.
    //
    // A FAILURE HERE FAILS THE RUN. It used to print a note and exit 0, which
    // meant a run could report everything passing while leaving the application
    // serving a map that no longer exists for up to five minutes — the next
    // person to look at that screen sees a tab whose picture is missing, and
    // nothing in the output told them why. Raised by adversarial review round 3.
    let cache = 'cleared'
    try {
      await revalidateFloorPlan()
    } catch (err) {
      cache = `NOT cleared: ${err.message}`
      fail(`the probe map was removed but the app's cache was not cleared — it may keep serving that map for up to five minutes: ${err.message}`)
    }
    console.log(`  probe markers deleted: ${pins}`)
    console.log(`  probe map deleted: ${maps}`)
    console.log(`  map cache: ${cache}`)
  }

  console.log(`\n${passCount} passed, ${failCount} failed`)
  process.exit(failCount === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('\nRUN FAILED:', err.message)
  process.exit(1)
})
