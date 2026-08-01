#!/usr/bin/env node
/**
 * Phase 8 — the floor-plan data and the participant map viewer.
 *
 * WHY THIS IS THE PRIMARY EVIDENCE FOR THIS PHASE. Phase 8 draws a picture on a
 * screen and puts markers on top of it at positions stored as percentages. A
 * check that matches strings in downloaded markup cannot see any of what
 * matters here:
 *
 *   - whether the picture actually loaded, or is a broken-image placeholder
 *     with the markers floating over white space
 *   - whether a marker is ON its stand or beside it
 *   - whether the markers stay on their stands when the screen size changes,
 *     which is the entire reason positions are stored as percentages
 *   - whether a marker is large enough to tap with a thumb
 *   - whether the labels are visible to a person or merely present in the markup
 *
 * WHAT IT COMPARES AGAINST. The database, not a list written into this file.
 * Every expected map name, pin count, label and position is read from
 * packages/db/prisma/dev.db at the top of the run. A seed that changes and a
 * screen that does not will fail here.
 *
 * Fixtures: two disposable delegate accounts, one satisfying the onboarding
 * required set and one deliberately missing a field, both created and removed
 * by this script. Nothing seeded is touched. If the run is killed part-way, the
 * exact cleanup statement is printed on startup.
 *
 * IT MUST BE RUN FROM INSIDE THE REPOSITORY. Node cannot resolve `playwright`
 * from the scratchpad, which sits outside it.
 *
 * Prerequisites: participant app on http://localhost:3001, a production build,
 * and the floor plan migrated, drawn and seeded:
 *   node scripts/migrate-floor-plan.mjs --local packages/db/prisma/dev.db
 *   node scripts/build-floor-plan-maps.mjs
 *   node scripts/seed-floor-plan.mjs --local packages/db/prisma/dev.db
 *
 * Usage: node docs/smoketests/playwright/phase-8-floor-plan-viewer.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'
const SHOTS = process.env.PHASE8_SHOT_DIR ?? '/tmp/phase8-shots'

const COMPLETE_ID = 'phase8-complete'
const COMPLETE_EMAIL = 'phase8-complete@wbr.invalid'
const INCOMPLETE_ID = 'phase8-incomplete'
const INCOMPLETE_EMAIL = 'phase8-incomplete@wbr.invalid'
const CLEANUP_SQL = `DELETE FROM User WHERE id LIKE 'phase8-%' OR email LIKE 'phase8-%'`

let pass = 0, fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, detail = '') => { fail++; console.log(`  ✗ ${m}${detail ? ` — ${detail}` : ''}`) }
const yes = (c, m, detail = '') => c ? ok(m) : no(m, detail)

mkdirSync(SHOTS, { recursive: true })

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA busy_timeout = 5000')

console.log(`If this run is killed part-way, clean up with:\n  ${CLEANUP_SQL};\n`)

// ── What the screen is expected to show, read from the database ──────────────

const conference = db.prepare(`SELECT id, name FROM Conference WHERE active = 1`).get()
if (!conference) {
  console.error('No active conference. Nothing to check against.')
  process.exit(2)
}

const expectedMaps = db
  .prepare(`SELECT id, name, imageUrl, position FROM VenueMap WHERE conferenceId = ? ORDER BY position ASC`)
  .all(conference.id)

if (expectedMaps.length === 0) {
  console.error(
    'No maps are seeded, so this suite has nothing to check. Run:\n' +
    '  node scripts/migrate-floor-plan.mjs --local packages/db/prisma/dev.db\n' +
    '  node scripts/build-floor-plan-maps.mjs\n' +
    '  node scripts/seed-floor-plan.mjs --local packages/db/prisma/dev.db',
  )
  process.exit(2)
}

const expectedPins = new Map()
for (const map of expectedMaps) {
  const rows = db
    .prepare(
      `SELECT p.id, p.type, p.label, p.x, p.y, p.sponsorId, s.name AS sponsorName, s.boothNumber
         FROM Pin p LEFT JOIN Sponsor s ON s.id = p.sponsorId
        WHERE p.venueMapId = ?`,
    )
    .all(map.id)
  expectedPins.set(map.id, rows)
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
//
// Created here rather than assumed, so this script runs on its own against a
// freshly seeded database. Same disposable-account pattern and the same scrypt
// hasher the app itself uses, so the passwords are valid by construction.
{
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  db.prepare(CLEANUP_SQL).run()

  const insert = db.prepare(
    `INSERT INTO User (id, email, name, role, password, jobTitle, company, companySize,
                       annualRevenue, solutionsSeeking, createdAt, updatedAt)
     VALUES (?, ?, ?, 'ATTENDEE', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = Date.now()

  // Satisfies every item of the delegate required set.
  const a = insert.run(
    COMPLETE_ID, COMPLETE_EMAIL, 'Phase 8 Complete', hash,
    'Head of Retail', 'Phase 8 Retail Co', 'MIDMARKET', '10M-50M',
    JSON.stringify(['Order Management']), now, now,
  )
  // Missing annualRevenue only — one field short, so the gate blocks it.
  const b = insert.run(
    INCOMPLETE_ID, INCOMPLETE_EMAIL, 'Phase 8 Incomplete', hash,
    'Head of Retail', 'Phase 8 Retail Co', 'MIDMARKET', null,
    JSON.stringify(['Order Management']), now, now,
  )
  if (a.changes !== 1 || b.changes !== 1) {
    console.error('Fixtures were not created; refusing to report on state that does not exist.')
    process.exit(2)
  }
}

const browser = await chromium.launch()

// Everything the browser complains about is collected. A screen that renders
// the right markers while throwing during hydration is not a working screen.
const consoleErrors = []
const pageErrors = []
function watch(page) {
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => pageErrors.push(e.message))
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  // Wait for where the reader comes to rest, not for the first URL that is not
  // /login. Phase 7 recorded a failure caused by reading the URL mid-flight.
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

/**
 * Where each marker actually sits on screen, and where its stored percentage
 * says it should sit. Measured from the browser's own layout, not computed from
 * the markup.
 */
async function measurePins(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="map-canvas"]')
    const image = document.querySelector('[data-testid="map-image"]')
    if (!canvas || !image) return null
    const canvasRect = canvas.getBoundingClientRect()
    const imageRect = image.getBoundingClientRect()
    const pins = [...document.querySelectorAll('[data-testid="pin"]')].map(el => {
      const r = el.getBoundingClientRect()
      // The room label is absolutely positioned OUTSIDE the marker's own box,
      // deliberately, so it cannot shift the marker's centre. That means the
      // marker's rectangle says nothing about where the label ends up, and a
      // label hanging off the picture would pass a containment check that looks
      // only at the button. Raised by adversarial review round 3. Measured
      // separately here so it can be asserted separately.
      const labelEl = el.querySelector('[data-testid="pin-label"]')
      const lr = labelEl ? labelEl.getBoundingClientRect() : null
      return {
        type: el.getAttribute('data-pin-type'),
        label: el.getAttribute('data-pin-label'),
        x: Number(el.getAttribute('data-pin-x')),
        y: Number(el.getAttribute('data-pin-y')),
        centreX: r.left + r.width / 2,
        centreY: r.top + r.height / 2,
        width: r.width,
        height: r.height,
        labelBox: lr ? { left: lr.left, top: lr.top, width: lr.width, height: lr.height } : null,
      }
    })
    const vp = document.querySelector('[data-testid="map-viewport"]')
    const vpRect = vp ? vp.getBoundingClientRect() : null
    return {
      canvas: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
      image: { left: imageRect.left, top: imageRect.top, width: imageRect.width, height: imageRect.height },
      viewport: vpRect ? { width: vpRect.width, height: vpRect.height } : null,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      src: image.getAttribute('src'),
      alt: image.getAttribute('alt'),
      pins,
    }
  })
}

console.log('Phase 8 — floor-plan data and participant map viewer')
console.log(`  ${BASE}   conference "${conference.name}"`)
console.log(`  ${expectedMaps.length} maps, ${[...expectedPins.values()].flat().length} pins expected\n`)

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
watch(page)

try {
  // ── 1. Sign in and reach the map from the navigation bar ───────────────────
  console.log('1. A delegate reaches the map from the bottom navigation bar')
  await signIn(page, COMPLETE_EMAIL)
  yes(!page.url().includes('/onboarding'), 'a complete delegate is not sent to the checklist')

  const mapTab = page.locator('nav a[href="/map"], a[href="/map"]').first()
  const tabVisible = await mapTab.isVisible().catch(() => false)
  yes(tabVisible, 'a Map item is present in the navigation and visible')

  if (tabVisible) {
    await mapTab.click()
    await page.waitForURL(u => u.pathname === '/map', { timeout: 30_000 })
    ok('tapping it lands on /map')
  } else {
    await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
    no('tapping it lands on /map', 'navigated directly instead')
  }

  await page.locator('[data-testid="map-canvas"]').first().waitFor({ state: 'visible', timeout: 30_000 })
  yes(await page.locator('[data-testid="floor-plan"]').first().isVisible(), 'the floor-plan screen is on screen')

  // ── 2. The first map's picture really loaded ───────────────────────────────
  console.log('\n2. The first map renders a picture that actually loaded')
  const firstMap = expectedMaps[0]

  // Wait for the picture to have ARRIVED before measuring it. Waiting for the
  // canvas to be visible is not the same thing: on a cold first load after a
  // rebuild, the element is laid out before the picture has decoded, and its
  // natural size is legitimately 0 in that gap. This check failed once against
  // a working app for exactly that reason. The wait can still time out, so the
  // assertion below can still fail honestly.
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="map-image"]')
    return Boolean(img && img.complete && img.naturalWidth > 0)
  }, undefined, { timeout: 15_000 }).catch(() => {})

  let m = await measurePins(page)
  yes(m !== null, 'the map canvas and its picture are both present')

  if (m) {
    yes(
      m.src?.endsWith(firstMap.imageUrl),
      `the picture shown is the first map's (${firstMap.imageUrl})`,
      `got ${m.src}`,
    )
    // naturalWidth is 0 for a picture that failed to load. This is the check
    // that separates "a map is on screen" from "a broken-image icon is on
    // screen with markers floating over it".
    yes(m.naturalWidth > 0 && m.naturalHeight > 0,
      'the picture decoded — its natural size is not zero',
      `${m.naturalWidth}×${m.naturalHeight}`)
    yes(m.image.width > 200 && m.image.height > 100,
      'the picture is laid out at a usable size',
      `${Math.round(m.image.width)}×${Math.round(m.image.height)}`)
    yes(m.alt === firstMap.name, `the picture is described as "${firstMap.name}"`, `got "${m.alt}"`)

    // If the canvas is bigger than the picture, a marker at 50% sits at the
    // middle of the BOX rather than the middle of the PICTURE, and every
    // marker drifts. Asserted rather than assumed.
    const dx = Math.abs(m.canvas.left - m.image.left)
    const dy = Math.abs(m.canvas.top - m.image.top)
    const dw = Math.abs(m.canvas.width - m.image.width)
    const dh = Math.abs(m.canvas.height - m.image.height)
    yes(dx <= 1 && dy <= 1 && dw <= 1 && dh <= 1,
      'the marker layer is exactly the picture’s box, so percentages mean what they say',
      `offset ${dx.toFixed(1)},${dy.toFixed(1)} size ${dw.toFixed(1)}×${dh.toFixed(1)}`)
  }

  // ── 3. Every marker the database holds for this map is on screen ───────────
  console.log('\n3. The markers on the first map match the database')
  const firstExpected = expectedPins.get(firstMap.id)
  yes(m?.pins.length === firstExpected.length,
    `${firstExpected.length} markers are on the first map`,
    `found ${m?.pins.length}`)

  const boothExpected = firstExpected.filter(p => p.type === 'BOOTH')
  const boothOnScreen = (m?.pins ?? []).filter(p => p.type === 'BOOTH')
  yes(boothOnScreen.length === boothExpected.length,
    `all ${boothExpected.length} booth markers are drawn`,
    `found ${boothOnScreen.length}`)

  // A booth marker must name its company, taken through the sponsor link. The
  // set is compared both ways so an extra marker fails as loudly as a missing
  // one.
  const expectedNames = [...new Set(boothExpected.map(p => p.sponsorName))].sort()
  const screenNames = [...new Set(boothOnScreen.map(p => p.label))].sort()
  yes(JSON.stringify(expectedNames) === JSON.stringify(screenNames),
    'every booth marker names its exhibiting company, and no others appear',
    `expected ${expectedNames.join(', ')} | got ${screenNames.join(', ')}`)

  // ── 4. Markers sit where their stored percentages say ──────────────────────
  console.log('\n4. Each marker sits where its stored position says, at three screen sizes')
  const sizes = [
    { width: 390, height: 844, label: 'phone 390×844' },
    { width: 768, height: 1024, label: 'tablet 768×1024' },
    { width: 1280, height: 900, label: 'desktop 1280×900' },
  ]

  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height })
    // Give layout a chance to settle; boundingBox waits, but a viewport change
    // needs a paint before the numbers mean anything.
    await page.locator('[data-testid="map-canvas"]').first().boundingBox()
    const measured = await measurePins(page)
    if (!measured) { no(`markers measured at ${size.label}`, 'no canvas'); continue }

    let worst = 0
    let worstLabel = ''
    for (const pin of measured.pins) {
      const wantX = measured.image.left + (pin.x / 100) * measured.image.width
      const wantY = measured.image.top + (pin.y / 100) * measured.image.height
      const off = Math.hypot(pin.centreX - wantX, pin.centreY - wantY)
      if (off > worst) { worst = off; worstLabel = pin.label }
    }
    yes(worst <= 2,
      `${size.label}: every marker's centre is within 2px of its stored position`,
      `worst ${worst.toFixed(1)}px on "${worstLabel}"`)

    // The whole point of percentages. If the picture is a different size at
    // each viewport and the markers still land, the positions are genuinely
    // screen-size independent.
    yes(measured.image.width > 0, `${size.label}: the picture has a width to measure against`)
  }

  await page.setViewportSize({ width: 390, height: 844 })

  // ── 5. A booth marker is big enough to tap, and reachable ──────────────────
  console.log('\n5. Booth markers have a forgiving tap target, and none is clipped or stacked')
  const phone = await measurePins(page)
  const smallest = (phone?.pins ?? []).reduce(
    (acc, p) => Math.min(acc, Math.min(p.width, p.height)),
    Number.POSITIVE_INFINITY,
  )
  yes(Number.isFinite(smallest) && smallest >= 44,
    'the smallest marker is at least 44 by 44 CSS pixels on a phone',
    `smallest side ${Number.isFinite(smallest) ? smallest.toFixed(1) : 'none'}px`)

  // Raised by adversarial review round 2. scripts/test-floor-plan.mjs enforces
  // a 2% margin from the edge and a 4-percentage-point gap between markers.
  // Those are cheap proxies and the reviewer was right that they do not
  // correspond to the real target: on a 390-pixel phone the picture is about
  // 366 pixels wide, so 2% is roughly 7 pixels while a marker's half-width is
  // 22. The offline rules stay as a first filter; THESE are the authoritative
  // ones, because they are measured in the pixels a thumb actually meets, at
  // the smallest screen the app supports.
  if (phone) {
    const overhanging = phone.pins.filter(p => {
      const left = p.centreX - p.width / 2
      const right = p.centreX + p.width / 2
      const top = p.centreY - p.height / 2
      const bottom = p.centreY + p.height / 2
      return (
        left < phone.image.left - 0.5 ||
        top < phone.image.top - 0.5 ||
        right > phone.image.left + phone.image.width + 0.5 ||
        bottom > phone.image.top + phone.image.height + 0.5
      )
    })
    yes(overhanging.length === 0,
      'on a phone, every marker sits wholly within the picture rather than hanging off it',
      overhanging.map(p => p.label).join(', '))

    // The same rule for room LABELS is applied per map inside step 6, because
    // the first map is the exhibit hall and carries booth markers only. Checking
    // labels here would assert against a map that has none, which passes for the
    // wrong reason.

    let closest = Number.POSITIVE_INFINITY
    let closestPair = ''
    for (let i = 0; i < phone.pins.length; i++) {
      for (let j = i + 1; j < phone.pins.length; j++) {
        const a = phone.pins[i]
        const b = phone.pins[j]
        const gap = Math.hypot(a.centreX - b.centreX, a.centreY - b.centreY)
        if (gap < closest) { closest = gap; closestPair = `${a.label} / ${b.label}` }
      }
    }
    yes(closest >= 44,
      'on a phone, no two markers are closer than one tap target apart, so none is unreachable',
      `closest ${Number.isFinite(closest) ? closest.toFixed(1) : 'n/a'}px between ${closestPair}`)
  }

  // ── 6. Switching between the maps, in their defined order ──────────────────
  console.log('\n6. The delegate can switch between the maps, in their stored order')
  const tabs = page.locator('[data-testid="map-tab"]')
  const tabCount = await tabs.count()
  yes(tabCount === expectedMaps.length,
    `the switcher offers all ${expectedMaps.length} maps`,
    `found ${tabCount}`)

  const tabOrder = await tabs.evaluateAll(els =>
    els.map(e => ({
      position: Number(e.getAttribute('data-map-position')),
      text: (e.textContent ?? '').trim(),
    })),
  )
  const positionsInOrder = tabOrder.map(t => t.position)
  yes(JSON.stringify(positionsInOrder) === JSON.stringify(expectedMaps.map(x => x.position)),
    'the switcher lists the maps in their stored order',
    positionsInOrder.join(', '))
  yes(tabOrder.every((t, i) => t.text.includes(expectedMaps[i].name)),
    'each switcher item is labelled with its map’s name',
    tabOrder.map(t => t.text).join(' | '))

  // Collected across the loop below, so the shape assertions afterwards are
  // made against what was actually on screen.
  const shapes = []

  for (let i = 0; i < expectedMaps.length; i++) {
    const map = expectedMaps[i]
    await tabs.nth(i).click()
    // Wait for the new picture to have ARRIVED, not merely to have been asked
    // for. The first version of this waited only for the src attribute to
    // change, which happens on the same tick as the click, and then measured
    // naturalWidth — which is 0 between a src changing and the new picture
    // decoding. Two assertions failed against an app that was working
    // correctly. Recorded rather than quietly corrected: a check that fails on
    // good code is as useless as one that passes on bad code.
    await page.waitForFunction(
      (wanted) => {
        const img = document.querySelector('[data-testid="map-image"]')
        return Boolean(
          img &&
          img.getAttribute('src')?.endsWith(wanted) &&
          img.complete &&
          img.naturalWidth > 0,
        )
      },
      map.imageUrl,
      { timeout: 15_000 },
    ).catch(() => {})

    const state = await measurePins(page)
    const wanted = expectedPins.get(map.id)
    yes(state?.src?.endsWith(map.imageUrl), `${map.name}: its own picture is shown`, `got ${state?.src}`)
    yes(state?.naturalWidth > 0, `${map.name}: that picture decoded`, `${state?.naturalWidth}`)
    yes(state?.pins.length === wanted.length,
      `${map.name}: all ${wanted.length} of its markers are drawn`,
      `found ${state?.pins.length}`)

    const roomWanted = wanted.filter(p => p.type === 'ROOM').map(p => p.label).sort()
    if (roomWanted.length > 0) {
      const roomOnScreen = (state?.pins ?? []).filter(p => p.type === 'ROOM').map(p => p.label).sort()
      yes(JSON.stringify(roomWanted) === JSON.stringify(roomOnScreen),
        `${map.name}: its room markers carry exactly the stored labels`,
        `expected ${roomWanted.join(', ')} | got ${roomOnScreen.join(', ')}`)

      // A room label is positioned outside its marker's box on purpose, so the
      // containment rule in step 5 says nothing about it. Raised by adversarial
      // review round 3. Checked here, per map, at phone width, because only the
      // room maps have labels at all — asserting it on the exhibit hall would
      // pass because there is nothing to measure.
      const labelled = (state?.pins ?? []).filter(p => p.labelBox)
      yes(labelled.length === roomWanted.length,
        `${map.name}: every room marker has a measurable label box`,
        `${labelled.length} of ${roomWanted.length}`)

      const outside = labelled.filter(p => {
        const b = p.labelBox
        return (
          b.left < state.image.left - 0.5 ||
          b.top < state.image.top - 0.5 ||
          b.left + b.width > state.image.left + state.image.width + 0.5 ||
          b.top + b.height > state.image.top + state.image.height + 0.5
        )
      })
      yes(outside.length === 0,
        `${map.name}: on a phone, every room label stays within the picture`,
        outside.map(p => `${p.label} at ${p.labelBox.left.toFixed(0)},${p.labelBox.top.toFixed(0)}`).join(' | '))
    }

    // The window the map moves inside has to take the shape of the picture in
    // it, or the picture is stretched and the pan limit is fed a wrong height.
    // Raised by adversarial review of the zoom work, where a stale ratio
    // survives a map switch.
    if (state?.viewport && state.naturalWidth > 0) {
      const wanted = state.naturalWidth / state.naturalHeight
      const got = state.viewport.width / state.viewport.height
      shapes.push({ name: map.name, wanted, got })
      yes(Math.abs(got - wanted) < 0.02,
        `${map.name}: the window takes the shape of this picture, not the previous one`,
        `picture ${wanted.toFixed(3)} vs window ${got.toFixed(3)}`)
    } else {
      no(`${map.name}: the window and the picture could both be measured`)
    }

    await page.screenshot({ path: join(SHOTS, `map-${map.position}.png`) })
  }

  // Without this, the assertion above is satisfied by three identically-shaped
  // pictures and proves nothing about switching. One seeded map is deliberately
  // a different shape for exactly this reason.
  const distinctShapes = new Set(shapes.map(s => s.wanted.toFixed(3)))
  yes(distinctShapes.size > 1,
    'the seeded maps are not all the same shape, so the check above means something',
    [...new Set(shapes.map(s => `${s.name} ${s.wanted.toFixed(3)}`))].join(' | '))

  // ── 7. Room labels are visible to a person, not merely present ─────────────
  console.log('\n7. Room labels are visible on screen')
  // The last map switched to is the meeting-room floor, which is all rooms.
  const labelNodes = page.locator('[data-testid="pin-label"]')
  const labelCount = await labelNodes.count()
  yes(labelCount > 0, 'room markers render a label element', `found ${labelCount}`)

  if (labelCount > 0) {
    const firstLabel = labelNodes.first()
    const box = await firstLabel.boundingBox()
    const text = (await firstLabel.textContent() ?? '').trim()
    yes(Boolean(box) && box.width > 0 && box.height > 0,
      'a room label occupies real space on screen',
      box ? `${box.width.toFixed(0)}×${box.height.toFixed(0)}` : 'no box')
    yes(text.length > 0, `a room label shows text ("${text}")`)
    yes(await firstLabel.isVisible(), 'a room label is visible rather than hidden')
  }

  // ── 8. The map is behind the onboarding gate, like every other section ─────
  console.log('\n8. An incomplete delegate cannot reach the map')
  const gateCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const gatePage = await gateCtx.newPage()
  watch(gatePage)
  await signIn(gatePage, INCOMPLETE_EMAIL)
  await gatePage.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
  await gatePage.waitForTimeout(1500)
  const gatedUrl = new URL(gatePage.url())
  yes(gatedUrl.pathname !== '/map',
    'an incomplete delegate asking for /map is sent elsewhere',
    `landed on ${gatedUrl.pathname}`)
  yes(gatedUrl.pathname.startsWith('/onboarding'),
    'and that elsewhere is the checklist',
    `landed on ${gatedUrl.pathname}`)
  // Both directions: the refusal above means nothing unless the same request
  // succeeds for someone who should be allowed, which step 1 already showed.
  yes(await gatePage.locator('[data-testid="map-canvas"]').count() === 0,
    'no map canvas is rendered for a blocked delegate')

  // ── 9. The address behind the screen refuses the same delegate ─────────────
  console.log('\n9. The map data address is guarded, both directions')
  const blockedResponse = await gatePage.evaluate(async () => {
    const r = await fetch('/api/data/map')
    return { status: r.status, body: (await r.text()).slice(0, 120) }
  })
  yes(blockedResponse.status === 403,
    'an incomplete delegate is refused at /api/data/map with 403',
    `got ${blockedResponse.status} ${blockedResponse.body}`)

  const allowedResponse = await page.evaluate(async () => {
    const r = await fetch('/api/data/map')
    const text = await r.text()
    let parsed = null
    try { parsed = JSON.parse(text) } catch {}
    return { status: r.status, maps: parsed?.maps?.length ?? null }
  })
  yes(allowedResponse.status === 200,
    'a complete delegate is answered at the same address with 200',
    `got ${allowedResponse.status}`)
  yes(allowedResponse.maps === expectedMaps.length,
    `and that answer carries all ${expectedMaps.length} maps`,
    `got ${allowedResponse.maps}`)

  await gateCtx.close()

  // ── 10. Zoom and pan ───────────────────────────────────────────────────────
  //
  // Added from finding F-9. The map is 1600 pixels wide shown at 366 on a
  // phone, so its own drawn text is about 4.6 pixels and unreadable, and the
  // readable labels are about as wide as the rooms they name.
  //
  // THE ASSERTION THAT MATTERS IS THE CONSTANT-SIZE ONE. Scaling the markers
  // along with the picture would magnify the problem and change nothing: a
  // label would cover the same proportion of the map at every zoom level. Only
  // if the markers hold still while the picture grows does zooming declutter.
  // Everything else in this step exists to stop that one property being
  // satisfied trivially.
  console.log('\n10. The delegate can zoom and pan, and the markers hold their size')

  await page.setViewportSize({ width: 390, height: 844 })
  // Back to the first map, so this step does not depend on where step 6 ended.
  await tabs.first().click()
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="map-image"]')
    return Boolean(img && img.complete && img.naturalWidth > 0)
  }, undefined, { timeout: 15_000 }).catch(() => {})

  const viewport = page.locator('[data-testid="map-viewport"]').first()
  const hasViewport = await viewport.count() > 0
  yes(hasViewport, 'there is a viewport element that the map moves inside')

  /** Scale, picture geometry, and the on-screen size of the markers. */
  async function zoomState() {
    return page.evaluate(() => {
      const vp = document.querySelector('[data-testid="map-viewport"]')
      const img = document.querySelector('[data-testid="map-image"]')
      if (!vp || !img) return null
      const vr = vp.getBoundingClientRect()
      const ir = img.getBoundingClientRect()
      const pins = [...document.querySelectorAll('[data-testid="pin"]')].map(el => {
        const r = el.getBoundingClientRect()
        const lab = el.querySelector('[data-testid="pin-label"]')
        const lr = lab ? lab.getBoundingClientRect() : null
        return {
          label: el.getAttribute('data-pin-label'),
          x: Number(el.getAttribute('data-pin-x')),
          y: Number(el.getAttribute('data-pin-y')),
          centreX: r.left + r.width / 2,
          centreY: r.top + r.height / 2,
          width: r.width,
          height: r.height,
          labelWidth: lr ? lr.width : null,
        }
      })
      return {
        declaredScale: Number(vp.getAttribute('data-map-scale')),
        overflow: getComputedStyle(vp).overflow,
        touchAction: getComputedStyle(vp).touchAction,
        viewport: { left: vr.left, top: vr.top, width: vr.width, height: vr.height },
        image: { left: ir.left, top: ir.top, width: ir.width, height: ir.height },
        pins,
      }
    })
  }

  /** A two-finger pinch, dispatched as real pointer events on the viewport. */
  async function pinch(factor) {
    await page.evaluate((f) => {
      const vp = document.querySelector('[data-testid="map-viewport"]')
      // No viewport means the feature is absent. Do nothing rather than throw,
      // so every assertion below fails on its own and the count stays stable.
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
    await page.waitForTimeout(120)
  }

  /** A one-finger drag across the viewport. */
  async function drag(dx, dy) {
    await page.evaluate(([x, y]) => {
      const vp = document.querySelector('[data-testid="map-viewport"]')
      if (!vp) return
      const r = vp.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const opts = (px, py) => ({
        pointerId: 1, pointerType: 'touch', clientX: px, clientY: py,
        bubbles: true, cancelable: true, isPrimary: true,
      })
      vp.dispatchEvent(new PointerEvent('pointerdown', opts(cx, cy)))
      for (let s = 1; s <= 8; s++) {
        vp.dispatchEvent(new PointerEvent('pointermove', opts(cx + (x * s) / 8, cy + (y * s) / 8)))
      }
      vp.dispatchEvent(new PointerEvent('pointerup', opts(cx + x, cy + y)))
    }, [dx, dy])
    await page.waitForTimeout(120)
  }

  const atRest = await zoomState()
  yes(atRest !== null, 'the viewport and the picture can both be measured')

  if (atRest) {
    yes(atRest.declaredScale === 1, 'the map opens at fit-to-width, scale 1', `got ${atRest.declaredScale}`)
    yes(atRest.overflow === 'hidden', 'the viewport clips what moves inside it', atRest.overflow)
    yes(atRest.touchAction === 'none',
      'the viewport claims the touch gestures rather than letting the browser scroll the page',
      atRest.touchAction)
    yes(Math.abs(atRest.image.width - atRest.viewport.width) <= 1,
      'at rest the picture exactly fills the viewport',
      `picture ${atRest.image.width.toFixed(1)} vs viewport ${atRest.viewport.width.toFixed(1)}`)
  }

  await pinch(2)
  const zoomed = await zoomState()

  // Asserted rather than used as a silent condition. The first version wrapped
  // everything below in `if (atRest && zoomed)`, and when a page error left the
  // measurement empty, a dozen assertions simply did not run and the suite
  // reported them as neither passed nor failed. A check that disappears when
  // something goes wrong is worse than one that fails.
  yes(zoomed !== null, 'the map can still be measured after the pinch')

  if (atRest && zoomed) {
    yes(zoomed.declaredScale > atRest.declaredScale,
      `a two-finger pinch zooms in (${atRest.declaredScale} → ${zoomed.declaredScale})`)
    yes(zoomed.image.width > atRest.image.width * 1.3,
      'the picture is substantially larger after the pinch',
      `${atRest.image.width.toFixed(0)} → ${zoomed.image.width.toFixed(0)}`)

    // THE ONE THAT MATTERS.
    const before = atRest.pins[0]
    const after = zoomed.pins.find(p => p.label === before?.label)
    yes(before && after && Math.abs(after.width - before.width) <= 1 && Math.abs(after.height - before.height) <= 1,
      'a marker is the SAME size on screen after zooming — the map grew, the marker did not',
      before && after ? `${before.width.toFixed(1)}×${before.height.toFixed(1)} → ${after.width.toFixed(1)}×${after.height.toFixed(1)}` : 'marker not found')

    // Zooming must not break the thing the rest of this suite rests on.
    let worst = 0, worstLabel = ''
    for (const pin of zoomed.pins) {
      const wantX = zoomed.image.left + (pin.x / 100) * zoomed.image.width
      const wantY = zoomed.image.top + (pin.y / 100) * zoomed.image.height
      const off = Math.hypot(pin.centreX - wantX, pin.centreY - wantY)
      if (off > worst) { worst = off; worstLabel = pin.label }
    }
    yes(worst <= 2,
      'every marker still sits on its stored position after zooming',
      `worst ${worst.toFixed(1)}px on "${worstLabel}"`)

    yes(Math.min(...zoomed.pins.map(p => Math.min(p.width, p.height))) >= 44,
      'markers are still at least 44 by 44 while zoomed in')
  }

  // Panning
  const beforePan = await zoomState()
  await drag(-80, -60)
  const afterPan = await zoomState()
  yes(beforePan !== null && afterPan !== null, "the map can be measured either side of a drag")
  if (beforePan && afterPan) {
    yes(Math.abs(afterPan.image.left - beforePan.image.left) > 5 ||
        Math.abs(afterPan.image.top - beforePan.image.top) > 5,
      'dragging moves the map',
      `left ${beforePan.image.left.toFixed(0)} → ${afterPan.image.left.toFixed(0)}, top ${beforePan.image.top.toFixed(0)} → ${afterPan.image.top.toFixed(0)}`)

    let worst = 0
    for (const pin of afterPan.pins) {
      const wantX = afterPan.image.left + (pin.x / 100) * afterPan.image.width
      const wantY = afterPan.image.top + (pin.y / 100) * afterPan.image.height
      worst = Math.max(worst, Math.hypot(pin.centreX - wantX, pin.centreY - wantY))
    }
    yes(worst <= 2, 'the markers travel with the map when it is panned', `worst ${worst.toFixed(1)}px`)
  }

  // Panning must not be able to drag the map off the screen.
  await drag(4000, 4000)
  const shoved = await zoomState()
  yes(shoved !== null, "the map can still be measured after being shoved")
  if (shoved) {
    const gapLeft = shoved.image.left - shoved.viewport.left
    const gapTop = shoved.image.top - shoved.viewport.top
    yes(gapLeft <= 1 && gapTop <= 1,
      'the map cannot be dragged away from the viewport, however hard it is shoved',
      `gap ${gapLeft.toFixed(1)},${gapTop.toFixed(1)}`)
  }

  // Zooming out is clamped at fit-to-width; the map never becomes smaller than
  // the space it is given.
  await pinch(0.2)
  await pinch(0.2)
  const shrunk = await zoomState()
  yes(shrunk !== null, "the map can still be measured after being pinched inward")
  if (shrunk) {
    yes(shrunk.declaredScale >= 1, 'the map cannot be pinched smaller than fit-to-width', `${shrunk.declaredScale}`)
    yes(Math.abs(shrunk.image.width - shrunk.viewport.width) <= 1,
      'and it settles back to exactly filling the viewport',
      `picture ${shrunk.image.width.toFixed(1)} vs viewport ${shrunk.viewport.width.toFixed(1)}`)
  }

  // A way back for someone who has zoomed into a corner.
  await pinch(2)
  const beforeReset = await zoomState()
  const reset = page.locator('[data-testid="map-zoom-reset"]').first()
  yes(await reset.count() > 0 && await reset.isVisible(),
    'a reset control appears once the map is zoomed')
  if (await reset.count() > 0) {
    await reset.click()
    await page.waitForTimeout(150)
    const afterReset = await zoomState()
    yes(afterReset?.declaredScale === 1, 'the reset control returns the map to fit-to-width',
      `${beforeReset?.declaredScale} → ${afterReset?.declaredScale}`)
    yes(await reset.count() === 0 || !(await reset.isVisible()),
      'and the reset control goes away again once there is nothing to reset')
  }

  // ── 11. Zooming actually declutters, said in the terms F-9 was written in ──
  //
  // This is the assertion that proves the remedy, so it is deliberately not
  // folded into step 10. Step 10 runs on the exhibit hall, which carries booth
  // markers and no room labels at all — the first version of this check lived
  // there, found nothing to measure, and was skipped in silence. It is the room
  // maps where labels collide, so it is a room map this must run on.
  console.log('\n11. Zooming makes the labels cover less of the map')

  // The first map that actually has room labels, taken from the database rather
  // than assumed to be a particular one.
  const roomMapIndex = expectedMaps.findIndex(
    m => expectedPins.get(m.id).some(p => p.type === 'ROOM'),
  )
  yes(roomMapIndex >= 0, 'there is a seeded map carrying room labels to measure')

  if (roomMapIndex >= 0) {
    await tabs.nth(roomMapIndex).click()
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="map-image"]')
      return Boolean(img && img.complete && img.naturalWidth > 0)
    }, undefined, { timeout: 15_000 }).catch(() => {})

    const fitted = await zoomState()
    yes(fitted !== null && fitted.declaredScale === 1,
      'the room map opens at fit-to-width',
      `scale ${fitted?.declaredScale}`)

    const labelled = (fitted?.pins ?? []).filter(p => p.labelWidth)
    yes(labelled.length > 0,
      `the room map has labels on screen to measure (${labelled.length})`)

    await pinch(2)
    const enlarged = await zoomState()
    yes(enlarged !== null, 'the room map can be measured after zooming')

    if (fitted && enlarged && labelled.length > 0) {
      const first = labelled[0]
      const same = enlarged.pins.find(p => p.label === first.label)
      yes(Boolean(same?.labelWidth), `"${first.label}" is still on screen after zooming`)

      if (same?.labelWidth) {
        const shareBefore = (first.labelWidth / fitted.image.width) * 100
        const shareAfter = (same.labelWidth / enlarged.image.width) * 100
        yes(shareAfter < shareBefore * 0.85,
          `"${first.label}" covers a smaller share of the map after zooming, so zooming declutters`,
          `${shareBefore.toFixed(1)}% → ${shareAfter.toFixed(1)}%`)
        yes(Math.abs(same.labelWidth - first.labelWidth) <= 1,
          'and it does that by staying the same size on screen, not by shrinking',
          `${first.labelWidth.toFixed(1)}px → ${same.labelWidth.toFixed(1)}px`)
      }
    }

    const backToFit = page.locator('[data-testid="map-zoom-reset"]').first()
    if (await backToFit.count() > 0) await backToFit.click()
    await page.waitForTimeout(150)
  }

  // ── 12. A tap still reaches a marker; a drag does not ─────────────────────
  //
  // Phase 9 makes tapping a booth marker open a card. The zoom work put a
  // gesture handler on the window those markers sit in, and capturing a pointer
  // there retargets the eventual click away from the marker — so the pan
  // gesture could silently swallow every tap, and Phase 9 would be built on a
  // marker that cannot be tapped. Raised by adversarial review round 2 as its
  // one high finding.
  //
  // Nothing is wired to a marker yet, so this listens for the click itself.
  console.log('\n12. A tap reaches a marker, and a drag does not activate one')

  await tabs.first().click()
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="map-image"]')
    return Boolean(img && img.complete && img.naturalWidth > 0)
  }, undefined, { timeout: 15_000 }).catch(() => {})

  await page.evaluate(() => {
    window.__markerClicks = []
    for (const el of document.querySelectorAll('[data-testid="pin"]')) {
      el.addEventListener('click', () => {
        window.__markerClicks.push(el.getAttribute('data-pin-label'))
      })
    }
  })

  const firstPin = page.locator('[data-testid="pin"]').first()
  const pinLabel = await firstPin.getAttribute('data-pin-label')
  await firstPin.click()
  await page.waitForTimeout(120)

  const afterTap = await page.evaluate(() => window.__markerClicks.slice())
  yes(afterTap.includes(pinLabel),
    `tapping the "${pinLabel}" marker activates it`,
    `clicks seen: ${JSON.stringify(afterTap)}`)

  // And the opposite: a real drag that happens to start on a marker must move
  // the map and must NOT count as tapping that marker.
  //
  // ZOOMED IN FIRST, ON PURPOSE. At fit-to-width the clamp deliberately allows
  // no panning at all, so a drag there cannot move anything and an assertion
  // about movement would pass whatever the drag path did. The first version of
  // this check accepted exactly that as success, which made it prove only that
  // no click fired. Raised by adversarial review round 3.
  await pinch(2)
  const zoomedForDrag = await zoomState()
  yes(zoomedForDrag !== null && zoomedForDrag.declaredScale > 1,
    'the map is zoomed in before the drag, so there is room to pan',
    `scale ${zoomedForDrag?.declaredScale}`)

  // A marker that is ACTUALLY ON SCREEN after zooming. Zooming pushes most of
  // the map outside the window, and the first marker in the list ended up at
  // x = -17 with the window starting at x = 12 — so the press landed on the
  // page behind the map and the drag never reached it. The assertion failed,
  // correctly, for a reason that was about this test rather than the product.
  const box = await page.evaluate(() => {
    const vp = document.querySelector('[data-testid="map-viewport"]')
    if (!vp) return null
    const v = vp.getBoundingClientRect()
    for (const el of document.querySelectorAll('[data-testid="pin"]')) {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      // Comfortably inside, so the whole drag stays over the map.
      if (cx > v.left + 60 && cx < v.right - 60 && cy > v.top + 60 && cy < v.bottom - 60) {
        return { x: r.left, y: r.top, width: r.width, height: r.height }
      }
    }
    return null
  })

  const beforeDrag = await zoomState()
  await page.evaluate(() => { window.__markerClicks = [] })

  yes(box !== null, 'a marker that is on screen while zoomed can be found to drag from')
  if (box) {
    const sx = box.x + box.width / 2
    const sy = box.y + box.height / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    for (let s = 1; s <= 8; s++) await page.mouse.move(sx - (70 * s) / 8, sy - (50 * s) / 8)
    await page.mouse.up()
    await page.waitForTimeout(150)
  }

  const afterDrag = await page.evaluate(() => window.__markerClicks.slice())
  const movedTo = await zoomState()
  yes(afterDrag.length === 0,
    'dragging from a marker activates no marker at all',
    `clicks seen: ${JSON.stringify(afterDrag)}`)
  yes(beforeDrag !== null && movedTo !== null &&
      (Math.abs(movedTo.image.left - beforeDrag.image.left) > 5 ||
       Math.abs(movedTo.image.top - beforeDrag.image.top) > 5),
    'and the map actually moved, so the drag was handled as a pan',
    beforeDrag && movedTo
      ? `left ${beforeDrag.image.left.toFixed(0)} → ${movedTo.image.left.toFixed(0)}, top ${beforeDrag.image.top.toFixed(0)} → ${movedTo.image.top.toFixed(0)}`
      : 'not measured')

  const backToFit2 = page.locator('[data-testid="map-zoom-reset"]').first()
  if (await backToFit2.count() > 0) await backToFit2.click()

  // ── 13. Nothing broke in the browser ───────────────────────────────────────
  console.log('\n13. The browser reported no errors')
  yes(pageErrors.length === 0, 'no uncaught error was thrown in the page', pageErrors.slice(0, 3).join(' | '))
  // Failed picture requests surface here and would otherwise be invisible.
  const imageErrors = consoleErrors.filter(e => /maps\/.*\.png/i.test(e))
  yes(imageErrors.length === 0, 'no map picture failed to load', imageErrors.slice(0, 3).join(' | '))
} catch (e) {
  no('the run completed without throwing', String(e?.message ?? e))
} finally {
  await browser.close()

  // ── Cleanup, counted rather than assumed ───────────────────────────────────
  const removed = db.prepare(CLEANUP_SQL).run()
  console.log(`\n── Cleanup ──`)
  yes(removed.changes === 2,
    'both disposable accounts were removed',
    `${removed.changes} rows deleted`)
  const left = db.prepare(`SELECT count(*) AS c FROM User WHERE id LIKE 'phase8-%'`).get()
  yes(Number(left.c) === 0, 'no fixture rows remain', `${left.c} left`)
  db.close()

  console.log('\n' + '─'.repeat(60))
  console.log(`  Results: ${pass} passed, ${fail} failed`)
  console.log('─'.repeat(60))
  console.log(
    '\n  Green here is evidence about the assertions listed above and nothing\n' +
    '  wider. It says nothing about the admin authoring tool, which is Phase\n' +
    '  11, or about the booth company card, which is Phase 9.\n',
  )
  process.exit(fail === 0 ? 0 : 1)
}
