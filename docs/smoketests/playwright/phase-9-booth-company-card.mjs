#!/usr/bin/env node
// Phase 9 — the booth company card, checked in a real browser.
//
//   node docs/smoketests/playwright/phase-9-booth-company-card.mjs
//
// Needs the participant app running on 3001. Exits non-zero on any failure.
//
// ── What this covers ─────────────────────────────────────────────────────────
//
// Tapping a booth marker opens a card over the map showing that exhibiting
// company's logo, name, tagline, booth number, offerings and website link;
// dismissing it returns to the same map at the same zoom and position.
//
// ── What this file assumes, and why each assumption is checked rather than
//    trusted ─────────────────────────────────────────────────────────────────
//
// Every expected value is read from the database at startup and compared
// against what the screen shows. Nothing is hard-coded — a literal "ten booth
// markers" keeps passing after a company is removed, and a literal company name
// keeps passing after the seed changes.
//
// Two habits carried from Phase 8, both of which caught real defects there:
//
//   1. ENUMERATE, DO NOT SAMPLE. Every booth marker is opened and checked, not
//      one of them. A card wired to the first marker in the list and to nothing
//      else passes a sampled check.
//   2. A measurement that comes back empty is a FAILURE, never a skip. Phase 8's
//      review recorded two blocks of assertions that vanished rather than failed
//      when a query returned nothing, which reads as "nothing wrong" at exactly
//      the moment the most is wrong.
//
// ── The Phase 8 behaviour this must not break ────────────────────────────────
//
// The map zooms and pans, and the moving layer captures pointers for the pan
// gesture. Phase 8's review found that capturing on the way down retargeted the
// click away from the marker button, which would have meant a card that never
// opens — with the cause looking like the card rather than the gesture. So this
// file taps markers BOTH at rest and after a zoom and pan, and separately
// asserts that a drag does not open a card.

import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'

const COMPLETE_ID = 'phase9-complete'
const COMPLETE_EMAIL = 'phase9-complete@wbr.invalid'
const CLEANUP_SQL = `DELETE FROM User WHERE id LIKE 'phase9-%' OR email LIKE 'phase9-%'`

let pass = 0
let fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, detail = '') => { fail++; console.log(`  ✗ ${m}${detail ? ` — ${detail}` : ''}`) }
const yes = (c, m, detail = '') => (c ? ok(m) : no(m, detail))
const section = t => { currentStage = t; console.log(`\n── ${t} ──`) }

// Declares a group of assertions that could not run, one failure each, naming
// them. A group that silently does not run reads as "nothing wrong here" at
// exactly the moment the most is wrong — a defect this project has recorded
// twice, once in Phase 8's own review cycle.
const notRun = (labels, why) => labels.forEach(l => no(l, `NOT RUN — ${why}`))

const db = new DatabaseSync(DB_PATH)

// ── What the screen is expected to show, read from the database ──────────────

const conference = db.prepare(`SELECT id, name FROM Conference WHERE active = 1`).get()
if (!conference) {
  console.error('No active conference. Refusing to report on state that does not exist.')
  process.exit(2)
}

const mapRows = db
  .prepare(`SELECT id, name, imageUrl, position FROM VenueMap WHERE conferenceId = ? ORDER BY position ASC`)
  .all(conference.id)

// Every booth marker, with the company values its card must show. Joined
// through sponsorId, never through boothNumber — the two drifted apart once
// already and finding F-10 records why the id is the only trustworthy link.
const boothRows = db
  .prepare(
    `SELECT p.id AS pinId, p.venueMapId, p.x, p.y,
            s.id AS sponsorId, s.name, s.tagline, s.website, s.logoUrl,
            s.boothNumber, s.solutionsOffering
       FROM Pin p
       JOIN Sponsor s ON s.id = p.sponsorId
      WHERE p.type = 'BOOTH'
      ORDER BY s.boothNumber ASC`,
  )
  .all()

const roomPinCount = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE type = 'ROOM'`).get().n

if (boothRows.length === 0 || mapRows.length === 0) {
  console.error(
    `Nothing to check: ${mapRows.length} maps, ${boothRows.length} booth markers. ` +
      `Run pnpm seed:floor-plan first.`,
  )
  process.exit(2)
}

const expected = new Map(
  boothRows.map(r => {
    let offerings = []
    try {
      const parsed = JSON.parse(r.solutionsOffering ?? '[]')
      if (Array.isArray(parsed)) offerings = parsed.filter(o => typeof o === 'string' && o.trim())
    } catch {
      // Left empty on purpose. A malformed value is asserted as a failure in
      // the data checks (scripts/test-booth-card-data.mjs); here it would
      // produce a card with no offerings, and the assertion below says so.
    }
    return [r.sponsorId, { ...r, offerings }]
  }),
)

// The map each booth marker lives on, so the script switches to it rather than
// assuming the exhibit hall is first.
const boothMapIds = [...new Set(boothRows.map(r => r.venueMapId))]

// ── Fixture ──────────────────────────────────────────────────────────────────
//
// A delegate satisfying every item of the required set, so the onboarding gate
// lets them reach the map at all. Created here, with the app's own hasher, so
// this script runs against a freshly seeded database without manual setup.
{
  const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
  const hash = await hashPassword(PASSWORD)
  db.prepare(CLEANUP_SQL).run()
  const now = Date.now()
  const r = db
    .prepare(
      `INSERT INTO User (id, email, name, role, password, jobTitle, company, companySize,
                         annualRevenue, solutionsSeeking, createdAt, updatedAt)
       VALUES (?, ?, ?, 'ATTENDEE', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      COMPLETE_ID, COMPLETE_EMAIL, 'Phase 9 Complete', hash,
      'Head of Retail', 'Phase 9 Retail Co', 'MIDMARKET', '10M-50M',
      JSON.stringify(['Order Management']), now, now,
    )
  if (r.changes !== 1) {
    console.error('Fixture was not created; refusing to report on state that does not exist.')
    process.exit(2)
  }
}

const browser = await chromium.launch()

// Console output is recorded WITH the moment and the address it arrived on, not
// as bare strings. Phase 8's suite asserts only on failed map pictures, so a
// broader assertion here needs to be able to say where anything else came from
// rather than filtering it away unexplained.
const startedAt = Date.now()
const consoleErrors = []
const pageErrors = []
let currentStage = 'startup'

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

/** The map's current zoom and offset, read from the DOM rather than remembered. */
async function readTransform(page) {
  return page.evaluate(() => {
    const vp = document.querySelector('[data-testid="map-viewport"]')
    const canvas = document.querySelector('[data-testid="map-canvas"]')
    const tab = document.querySelector('[data-testid="map-tab"][data-active="true"]')
    if (!vp || !canvas) return null
    const r = canvas.getBoundingClientRect()
    return {
      scale: vp.getAttribute('data-map-scale'),
      transform: canvas.style.transform,
      // The rendered box too. Two different transform strings can describe the
      // same position, and two identical strings cannot describe different ones
      // — comparing both means neither a formatting change nor a silent reflow
      // can be mistaken for "unchanged".
      box: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width) },
      activeMap: tab ? tab.textContent.trim() : null,
      activeMapPosition: tab ? tab.getAttribute('data-map-position') : null,
    }
  })
}

/** Everything the open card shows, or null when no card is open. */
async function readCard(page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="booth-card"]')
    if (!card) return null
    const t = sel => {
      const el = card.querySelector(sel)
      return el ? el.textContent.trim() : null
    }
    const logo = card.querySelector('[data-testid="booth-card-logo"]')
    const link = card.querySelector('[data-testid="booth-card-website"]')
    const cardRect = card.getBoundingClientRect()
    const vp = document.querySelector('[data-testid="map-viewport"]')
    const vpRect = vp ? vp.getBoundingClientRect() : null
    return {
      sponsorId: card.getAttribute('data-booth-card-sponsor'),
      name: t('[data-testid="booth-card-name"]'),
      tagline: t('[data-testid="booth-card-tagline"]'),
      booth: t('[data-testid="booth-card-booth"]'),
      offerings: [...card.querySelectorAll('[data-testid="booth-card-offering"]')].map(e =>
        e.textContent.trim(),
      ),
      logoSrc: logo ? logo.getAttribute('src') : null,
      logoAlt: logo ? logo.getAttribute('alt') : null,
      // Whether the picture actually DECODED, not just whether the address is
      // right. A logo whose file is missing, renamed or corrupt has a correct
      // src attribute and shows an empty box, and every attribute check passes.
      logoDecoded: logo ? logo.complete && logo.naturalWidth > 0 : false,
      logoBox: logo
        ? { w: Math.round(logo.getBoundingClientRect().width), h: Math.round(logo.getBoundingClientRect().height) }
        : null,
      // What a delegate can see WITHOUT scrolling inside the card. The first
      // version of this card put the website link 97 pixels below the visible
      // area on every phone card, and nothing here noticed, because a link that
      // is present in the markup satisfies an href comparison whether or not
      // anyone can reach it.
      mustScrollToSeeEverything: card.scrollHeight > card.clientHeight + 1,
      websiteVisibleWithoutScrolling: link
        ? (() => {
            const r = link.getBoundingClientRect()
            return r.top >= cardRect.top - 1 && r.bottom <= cardRect.bottom + 1
          })()
        : false,
      websiteHref: link ? link.getAttribute('href') : null,
      websiteTarget: link ? link.getAttribute('target') : null,
      websiteRel: link ? link.getAttribute('rel') : null,
      hasCloseButton: Boolean(card.querySelector('[data-testid="booth-card-close"]')),
      role: card.getAttribute('role'),
      ariaLabel: card.getAttribute('aria-label') ?? card.getAttribute('aria-labelledby'),
      // Visible, not merely present. An element with a zero box is in the
      // markup and on nobody's screen.
      box: { width: Math.round(cardRect.width), height: Math.round(cardRect.height) },
      // Over the map, not below it or beside it: the card's rectangle must
      // intersect the map window's rectangle.
      overlapsMap: vpRect
        ? cardRect.left < vpRect.right &&
          cardRect.right > vpRect.left &&
          cardRect.top < vpRect.bottom &&
          cardRect.bottom > vpRect.top
        : false,
      // The map must still be on the page behind it. A card that replaced the
      // map would satisfy every other assertion here.
      mapStillPresent: Boolean(document.querySelector('[data-testid="map-image"]')),
    }
  })
}

async function openCardFor(page, sponsorId) {
  await page.locator(`[data-testid="pin"][data-pin-sponsor="${sponsorId}"]`).first().click()
  await page.waitForSelector('[data-testid="booth-card"]', { timeout: 5000 }).catch(() => {})

  // Give the logo a bounded moment to decode before anything is measured.
  //
  // Without this the decode check ran in the same tick the card appeared and
  // reported all ten logos as broken, which was not true — measured directly,
  // Shopify's is 128 by 128, complete, drawn at 48 by 48. The assertion was
  // testing "did it decode instantly", which is not a requirement anyone has.
  //
  // Three seconds, and no longer. If a logo has not decoded by then the file is
  // genuinely missing or corrupt and the assertion SHOULD fail — which is why
  // this waits rather than simply asserting later, and why the wait is bounded
  // rather than open-ended.
  await page
    .waitForFunction(
      () => {
        const i = document.querySelector('[data-testid="booth-card-logo"]')
        return !i || (i.complete && i.naturalWidth > 0)
      },
      { timeout: 3000 },
    )
    .catch(() => {})
}

async function dismissByCloseButton(page) {
  const btn = page.locator('[data-testid="booth-card-close"]').first()
  if (await btn.count()) await btn.click()
  await page.waitForSelector('[data-testid="booth-card"]', { state: 'detached', timeout: 5000 }).catch(() => {})
}

console.log('Phase 9 — the booth company card')
console.log(`  ${BASE}   conference "${conference.name}"`)
console.log(`  ${mapRows.length} maps, ${boothRows.length} booth markers, ${roomPinCount} room markers expected\n`)

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const record = (list, text) =>
  list.push({ text, stage: currentStage, atMs: Date.now() - startedAt, url: page.url() })
page.on('console', m => { if (m.type() === 'error') record(consoleErrors, m.text()) })
page.on('pageerror', e => record(pageErrors, e.message))

await signIn(page, COMPLETE_EMAIL)
await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="map-image"]', { timeout: 30_000 })

// ── 1. Nothing is open before anything is tapped ─────────────────────────────

section('The card is closed until a booth marker is tapped')

yes((await readCard(page)) === null, 'no card is showing when the map first opens')

// ── 2. Every booth marker opens its own correct card ─────────────────────────
//
// Enumerated. Every company, on whichever map its marker lives, compared field
// by field against the database row for that company.

section('Every booth marker opens the card for its own company')

for (const mapId of boothMapIds) {
  const mapRow = mapRows.find(m => m.id === mapId)
  const onThisMap = boothRows.filter(r => r.venueMapId === mapId)

  // Switch to the map this group of markers lives on.
  const tab = page.locator(`[data-testid="map-tab"]`).filter({ hasText: mapRow.name }).first()
  if (await tab.count()) {
    await tab.click()
    await page.waitForTimeout(300)
  }

  for (const row of onThisMap) {
    const want = expected.get(row.sponsorId)
    const who = `${want.boothNumber} ${want.name}`

    const marker = page.locator(`[data-testid="pin"][data-pin-sponsor="${row.sponsorId}"]`)
    const markerCount = await marker.count()
    yes(markerCount === 1, `${who} — exactly one marker carries this company's id`, `found ${markerCount}`)
    if (markerCount !== 1) continue

    await openCardFor(page, row.sponsorId)
    const card = await readCard(page)

    if (card === null) {
      no(`${who} — tapping the marker opens a card`, 'no element with data-testid="booth-card"')
      // Every remaining assertion for this company would measure nothing.
      // Counted as failures rather than skipped, so the total reflects what was
      // not proven.
      for (const label of [
        'card is for the tapped company', 'shows the company name', 'shows the tagline',
        'shows the booth number', 'shows the logo', 'logo has alternative text',
        'the logo picture actually loaded', 'the logo takes up space on screen',
        'shows every offering, in order and with duplicates intact',
        'website link points at the stored address',
        'website link opens safely in a new tab', 'card is visible on screen',
        'the whole card fits without scrolling on a phone',
        'the website link is visible without scrolling',
        'card sits below the map, not over it', 'the map is still behind it', 'card has a close control',
      ]) no(`${who} — ${label}`, 'NOT RUN, no card opened')
      continue
    }

    yes(card.sponsorId === row.sponsorId, `${who} — card is for the tapped company`,
      `card says ${card.sponsorId}, marker says ${row.sponsorId}`)
    yes(card.name === want.name, `${who} — shows the company name`,
      `card ${JSON.stringify(card.name)}, database ${JSON.stringify(want.name)}`)
    yes(card.tagline === want.tagline, `${who} — shows the tagline`,
      `card ${JSON.stringify(card.tagline)}, database ${JSON.stringify(want.tagline)}`)
    yes(
      typeof card.booth === 'string' && card.booth.includes(want.boothNumber),
      `${who} — shows the booth number`,
      `card ${JSON.stringify(card.booth)}, database ${JSON.stringify(want.boothNumber)}`,
    )
    yes(card.logoSrc === want.logoUrl, `${who} — shows the logo`,
      `card ${JSON.stringify(card.logoSrc)}, database ${JSON.stringify(want.logoUrl)}`)
    yes(
      typeof card.logoAlt === 'string' && card.logoAlt.trim().length > 0,
      `${who} — logo has alternative text`,
      `alt is ${JSON.stringify(card.logoAlt)}`,
    )
    yes(card.logoDecoded, `${who} — the logo picture actually loaded`,
      `src ${JSON.stringify(card.logoSrc)} did not decode`)
    yes(
      card.logoBox !== null && card.logoBox.w > 0 && card.logoBox.h > 0,
      `${who} — the logo takes up space on screen`,
      `measured ${JSON.stringify(card.logoBox)}`,
    )

    // Compared as an ORDERED LIST, not with includes(). Raised by Phase 9's
    // adversarial review round 2: a company that lists the same offering twice
    // is an ordinary shape once organizers type these values in Phase 11, and
    // an includes() check is satisfied by a card that rendered only one copy —
    // which is precisely what a duplicate React key can cause. Comparing
    // position by position catches a dropped duplicate; includes() cannot.
    const sameOfferings =
      want.offerings.length > 0 &&
      card.offerings.length === want.offerings.length &&
      card.offerings.every((o, i) => o === want.offerings[i])
    yes(
      sameOfferings,
      `${who} — shows every offering, in order and with duplicates intact`,
      want.offerings.length === 0
        ? 'the database has none for this company'
        : `card ${JSON.stringify(card.offerings)}, database ${JSON.stringify(want.offerings)}`,
    )

    yes(card.websiteHref === want.website, `${who} — website link points at the stored address`,
      `card ${JSON.stringify(card.websiteHref)}, database ${JSON.stringify(want.website)}`)
    yes(
      card.websiteTarget === '_blank' &&
        typeof card.websiteRel === 'string' &&
        card.websiteRel.includes('noopener'),
      `${who} — website link opens safely in a new tab`,
      `target ${JSON.stringify(card.websiteTarget)}, rel ${JSON.stringify(card.websiteRel)}`,
    )

    yes(card.box.width > 0 && card.box.height > 0, `${who} — card is visible on screen`,
      `measured ${card.box.width}x${card.box.height}`)

    // This runs at 390 by 844, a phone. Every assertion above is about what the
    // markup holds; these two are about what a delegate standing in the hall
    // can actually see without discovering that the card scrolls.
    yes(!card.mustScrollToSeeEverything, `${who} — the whole card fits without scrolling on a phone`)
    yes(card.websiteVisibleWithoutScrolling,
      `${who} — the website link is visible without scrolling`)
    // ── AMENDED BY PHASE 7, 2026-08-07 ────────────────────────────────────────
    //
    // This asserted the opposite — that the card overlaps the map — and that was
    // the behaviour until phase 7. The reported fault was that tapping a marker
    // low on the map opened the card over the very spot just tapped, so a
    // delegate could not see what they had selected, and how much was covered
    // depended on the shape of whatever picture an organizer had uploaded
    // (UF-5). Below 768 pixels the card now sits beneath the map, which is what
    // makes the tapped marker stay visible. This file runs at 390 × 844.
    //
    // At 768 and above the card still opens over the map, and phase 7's own run
    // asserts that at 1280.
    yes(!card.overlapsMap, `${who} — card sits below the map, not over it`)
    yes(card.mapStillPresent, `${who} — the map is still behind it`)
    yes(card.hasCloseButton, `${who} — card has a close control`)

    await dismissByCloseButton(page)
  }
}

// ── 3. A room marker opens nothing ───────────────────────────────────────────

section('A room marker does not open a company card')

{
  const roomMap = mapRows.find(m => !boothMapIds.includes(m.id)) ?? mapRows[0]
  const tab = page.locator('[data-testid="map-tab"]').filter({ hasText: roomMap.name }).first()
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(300) }

  const rooms = page.locator('[data-testid="pin"][data-pin-type="ROOM"]')
  const n = await rooms.count()
  yes(n > 0, 'the chosen map has room markers to try', `found ${n}`)

  // Every room marker, not one. A card wired to "any marker" rather than "a
  // booth marker" would be caught only by the room that happens to be checked.
  for (let i = 0; i < n; i++) {
    const label = await rooms.nth(i).getAttribute('data-pin-label')
    await rooms.nth(i).click()
    await page.waitForTimeout(120)
    const card = await readCard(page)
    yes(card === null, `room "${label}" — tapping it opens no company card`,
      card ? `a card opened for ${card.name}` : '')
    if (card !== null) await dismissByCloseButton(page)
  }
}

// ── A marker looks pressable only when pressing it does something ────────────
//
// Added 2026-08-04. The section above proves no card opens for a room. It passed
// while every room marker was still a <button> with a pointer cursor and a click
// handler that the parent silently discarded — so the delegate was offered a
// control that did nothing, and no assertion here noticed. These checks are about
// what the marker OFFERS, which is a different question from what it DOES.
//
// Found by a person tapping room markers on the deployed site, after three review
// rounds and thirteen negative controls on Phase 11 did not.

section('Only markers that open a card are presented as controls')

{
  // ── EVERY MAP CARRYING ROOM MARKERS, NOT THE FIRST ONE. Round 2 caught this. ──
  //
  // The first version picked `mapRows.find(m => !boothMapIds.includes(m.id))`,
  // which is Ballroom Level and its six rooms, and never looked at Meeting Rooms
  // and its nine. Those nine are Table 1 to Table 8 and the Networking Lounge —
  // the very markers whose tapping produced the defect this section exists for.
  // The case that started it was untested.
  //
  // The map list comes from the database, so a fourth map added later is covered
  // without editing this.
  const roomMapIds = new Set(
    db.prepare(`SELECT DISTINCT venueMapId AS id FROM Pin WHERE type = 'ROOM'`).all().map(r => r.id),
  )
  const roomMaps = mapRows.filter(m => roomMapIds.has(m.id))
  yes(roomMaps.length > 0, 'at least one map carries room markers', `found ${roomMaps.length}`)

  // Read once from the database, so a map that renders NO markers is caught as a
  // shortfall rather than passing with an empty loop.
  const expectedRoomsByMap = new Map(
    roomMaps.map(m => [
      m.id,
      db.prepare(`SELECT label FROM Pin WHERE venueMapId = ? AND type = 'ROOM' ORDER BY label`)
        .all(m.id).map(r => r.label),
    ]),
  )

  for (const roomMap of roomMaps) {
    // ── PROVE THE INTENDED MAP IS SHOWING. Round 3 caught this. ────────────────
    //
    // Selecting the tab by `hasText` is a SUBSTRING match, so a map named "Meeting"
    // would open "Meeting Rooms" instead. And because every per-marker assertion
    // below compares a label to the marker's OWN data-pin-label, they all agree with
    // each other whichever map is showing — so the loop could report coverage for a
    // map it never opened. Round 2's fix read the expected labels from the database
    // and then never compared against them.
    //
    // Two changes: the tab is matched on its exact text, and the marker labels drawn
    // are compared AS A SET against the labels stored for this map.
    const exactName = new RegExp(`^${roomMap.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
    const tab = page.locator('[data-testid="map-tab"]').filter({ hasText: exactName }).first()
    const tabFound = await tab.count()
    yes(tabFound === 1, `${roomMap.name}: its own tab was found by exact name`,
      `matched ${tabFound} tabs`)
    if (tabFound !== 1) continue
    await tab.click()
    await page.waitForTimeout(400)

    const rooms = page.locator('[data-testid="pin"][data-pin-type="ROOM"]')
    const roomCount = await rooms.count()
    const expected = expectedRoomsByMap.get(roomMap.id) ?? []

    // Counted against the database, not merely against zero. A map that drew two
    // of its nine markers would otherwise check two and report success.
    yes(roomCount === expected.length,
      `${roomMap.name}: all ${expected.length} stored room markers are drawn`,
      `drew ${roomCount}`)

    // And they are THIS map's markers. Compared as a set, which is what proves the
    // right map is on screen rather than a different one with the same count.
    const drawnLabels = (await rooms.evaluateAll(
      els => els.map(e => e.getAttribute('data-pin-label')),
    )).slice().sort()
    const expectedSorted = expected.slice().sort()
    yes(JSON.stringify(drawnLabels) === JSON.stringify(expectedSorted),
      `${roomMap.name}: the markers drawn are exactly the ones stored for this map`,
      `drew ${JSON.stringify(drawnLabels)} | stored ${JSON.stringify(expectedSorted)}`)

    for (let i = 0; i < roomCount; i++) {
      const el = rooms.nth(i)
      const label = await el.getAttribute('data-pin-label')
      const shape = await el.evaluate(e => ({
        tag: e.tagName,
        cursor: getComputedStyle(e).cursor,
        tabIndex: e.tabIndex,
        role: e.getAttribute('role'),
      }))
      yes(shape.tag !== 'BUTTON', `${roomMap.name} / "${label}" — is not a button`,
        `tag was ${shape.tag}`)
      yes(shape.cursor !== 'pointer', `${roomMap.name} / "${label}" — offers no pointer cursor`,
        `cursor was ${shape.cursor}`)
      // ── TAB ORDER AND ROLE. Round 2 caught the document claiming this while
      // nothing asserted it. A <div role="button" tabIndex="0"> would have passed
      // the two assertions above while still being presented as a control.
      // A plain <div> reports -1; a <button> or anything with tabindex="0" reports 0.
      yes(shape.tabIndex < 0,
        `${roomMap.name} / "${label}" — is not in the keyboard tab order`,
        `tabIndex was ${shape.tabIndex}`)
      yes(shape.role !== 'button' && shape.role !== 'link',
        `${roomMap.name} / "${label}" — is not given a control role`,
        `role was ${shape.role}`)
    }

    // The room's name is what a tap would have revealed, so it has to be on screen
    // already or this fix has removed the only way to learn it.
    //
    // ── EXACT TEXT, AND NOT OCCLUDED. Rounds 1 and 2 both shaped this. ─────────
    //
    // Round 1: the first version counted nodes, so a label hidden by CSS kept it
    // green. Round 2: matching by `hasText` is a SUBSTRING match and the text was
    // never compared, so a visible "Hall A1" would satisfy a missing "Hall A"; and
    // a box with size can still be clipped by the map window or covered by
    // something on top of it. So this reads the label's own element, compares its
    // text exactly, and asks the document what is actually at the label's centre.
    for (let i = 0; i < roomCount; i++) {
      const marker = rooms.nth(i)
      const label = await marker.getAttribute('data-pin-label')

      // Scoped to the marker itself, not searched across the page.
      const labelEl = marker.locator('[data-testid="pin-label"]').first()
      if (await labelEl.count() === 0) {
        no(`${roomMap.name} / "${label}" — its name is visibly printed without tapping`,
          'the marker carries no label element')
        continue
      }

      const shown = await labelEl.evaluate(e => {
        const r = e.getBoundingClientRect()
        const s = getComputedStyle(e)

        // ── MEASURING OCCLUSION ON AN ELEMENT WITH POINTER EVENTS DISABLED ──────
        //
        // The label sets `pointer-events: none`, so elementFromPoint never returns
        // it — the hit passes through. Two earlier attempts got this wrong and both
        // failed every label while it was plainly visible: the first demanded the
        // hit BE the label, the second accepted an ancestor, and the real hit is the
        // map picture, because the label is positioned BELOW the marker's own box
        // and so is outside it.
        //
        // So pointer events are switched on for the duration of the measurement and
        // put back afterwards. That makes the hit test mean what it says: if
        // something other than the label answers, something is genuinely on top.
        const previous = e.style.pointerEvents
        e.style.pointerEvents = 'auto'
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const atCentre = document.elementFromPoint(cx, cy)
        e.style.pointerEvents = previous

        // Clipped off the edge of the map window is the other way a label with a
        // real box can be invisible — the concrete case review round 2 named.
        const viewport = document.querySelector('[data-testid="map-viewport"]')
        const vp = viewport ? viewport.getBoundingClientRect() : null
        const insideViewport = vp === null ? null :
          r.left >= vp.left - 1 && r.right <= vp.right + 1 &&
          r.top >= vp.top - 1 && r.bottom <= vp.bottom + 1

        const covered = atCentre !== null && atCentre !== e && !e.contains(atCentre)
        return {
          w: Math.round(r.width), h: Math.round(r.height),
          display: s.display, visibility: s.visibility, opacity: s.opacity,
          text: (e.textContent ?? '').trim(),
          onTop: !covered,
          insideViewport,
          coveredBy: covered
            ? `${atCentre.tagName}${atCentre.getAttribute('data-testid') ? '[' + atCentre.getAttribute('data-testid') + ']' : ''}`
            : '',
        }
      })

      const styled = shown.w > 0 && shown.h > 0 &&
        shown.display !== 'none' && shown.visibility !== 'hidden' && Number(shown.opacity) > 0
      const exact = shown.text === label

      // ── WHY OVERLAP IS MEASURED AND REPORTED BUT NOT ASSERTED ────────────────
      //
      // A first version failed on any element sitting over the label's centre, and
      // "Hall A" went red: another marker's 44-pixel tap box overlaps it. That is
      // not a new defect. Phase 8 measured this and the project owner ACCEPTED it —
      // docs/smoketests/phase-8-floor-plan-viewer.md § the accepted limit: at the
      // default fit-to-width view on a phone the labels overlap, 4 collisions at
      // fit-to-width and 0 once zoomed to 2.5x, and zoom is the chosen remedy
      // because hiding labels until a zoom threshold was rejected against user
      // story 19.
      //
      // Asserting against a decision already taken would make this suite fail for a
      // state the project has agreed to live with. So the overlap is measured, named
      // in the detail line when present, and left out of the pass condition. What IS
      // asserted is what this group exists for: the name is rendered, it is exactly
      // this room's name, it has a real box with visible styles, and it is inside
      // the map window rather than clipped off its edge.
      //
      // insideViewport is null when the map window could not be found, which is a
      // measurement failure rather than a pass — so it is required to be true.
      yes(styled && exact && shown.insideViewport === true,
        `${roomMap.name} / "${label}" — its name is visibly printed without tapping`,
        `box ${shown.w}x${shown.h}, display ${shown.display}, visibility ${shown.visibility}, ` +
        `opacity ${shown.opacity}, text "${shown.text}" (exact: ${exact}), ` +
        `inside the map window: ${shown.insideViewport}` +
        (shown.coveredBy ? `, overlapped by ${shown.coveredBy}` : ''))

      if (shown.coveredBy) {
        console.log(`  ! ${roomMap.name} / "${label}" is overlapped by ${shown.coveredBy} at ` +
          'fit-to-width — reported, not asserted; the accepted limit in Phase 8 § the accepted limit')
      }
    }
  }
}

// ── The over-correction check ────────────────────────────────────────────────
//
// A fix that made EVERY marker non-interactive would satisfy every assertion
// above and destroy the booth card entirely. This is the assertion that fails if
// that happens.

{
  const boothMapId = boothMapIds[0]
  const mapRow = mapRows.find(m => m.id === boothMapId)
  const tab = page.locator('[data-testid="map-tab"]').filter({ hasText: mapRow.name }).first()
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(300) }

  const booths = page.locator('[data-testid="pin"][data-pin-type="BOOTH"]')
  const boothCount = await booths.count()
  yes(boothCount > 0, 'the chosen map has booth markers to inspect', `found ${boothCount}`)

  let withoutCompany = 0
  for (let i = 0; i < boothCount; i++) {
    const el = booths.nth(i)
    const label = await el.getAttribute('data-pin-label')
    const sponsorId = await el.getAttribute('data-pin-sponsor')
    const shape = await el.evaluate(e => ({
      tag: e.tagName,
      cursor: getComputedStyle(e).cursor,
    }))
    if (sponsorId) {
      yes(shape.tag === 'BUTTON', `booth "${label}" — is still a button`,
        `tag was ${shape.tag}`)
      yes(shape.cursor === 'pointer', `booth "${label}" — still offers a pointer cursor`,
        `cursor was ${shape.cursor}`)
    } else {
      // ── THE SAME CHECKS AS THE CREATED ONE. Round 2 caught this. ────────────
      //
      // The first version ran only the tag check here and left the cursor and the
      // click behaviour to the created-marker branch below — which is skipped
      // whenever a companyless booth already exists. So the presence of real drift
      // in the data DOWNGRADED the check, exactly when it mattered most.
      withoutCompany++
      yes(shape.tag !== 'BUTTON', `booth "${label}" with no company — is not a button`,
        `tag was ${shape.tag}`)
      yes(shape.cursor !== 'pointer', `booth "${label}" with no company — offers no pointer cursor`,
        `cursor was ${shape.cursor}`)
      await el.click()
      await page.waitForTimeout(150)
      const card = await readCard(page)
      yes(card === null, `booth "${label}" with no company — tapping it opens no card`,
        card ? `a card opened for ${card.name}` : '')
      if (card !== null) await dismissByCloseButton(page)
    }
  }

  // ── The booth marker whose company is gone ─────────────────────────────────
  //
  // A booth marker with no company takes the same path as a room — nothing to
  // show — so it must be presented the same way. No such marker exists in the
  // seeded data, so this makes one, checks it, and removes it, following the
  // `phase9-` prefix and cleanup this suite already uses for its test accounts.
  //
  // Done last, after every other assertion in this file, so an extra marker
  // cannot disturb the enumerations above.
  if (withoutCompany === 0) {
    const ORPHAN_ID = 'phase9-orphan-booth'
    db.prepare(`DELETE FROM Pin WHERE id = ?`).run(ORPHAN_ID)
    db.prepare(
      `INSERT INTO Pin (id, venueMapId, type, label, x, y, sponsorId)
       VALUES (?, ?, 'BOOTH', 'Phase 9 Orphan', 12.5, 12.5, NULL)`,
    ).run(ORPHAN_ID, boothMapId)

    try {
      // The map payload is cached for five minutes under the 'floor-plan' tag
      // (apps/attendee/lib/floor-plan-data.ts line 111). Writing straight to the
      // database bypasses the app, so nothing tells it the cached copy is out of
      // date and the reload below would serve the old markers. This is the same
      // call apps/web/lib/revalidate-attendee.ts makes after an organizer saves.
      //
      // The secret is read from apps/attendee/.env.local when it is not already
      // in the environment, so this check does not silently depend on the caller
      // exporting it. It did at first, and the four assertions below reported a
      // missing marker rather than a missing setting — the same shape of fault as
      // an assertion that cannot fail. Same lookup as
      // packages/db/scripts/reset-test-accounts.mjs.
      const secret = process.env.NEXTAUTH_SECRET ?? (() => {
        try {
          const raw = readFileSync(join(ROOT, 'apps/attendee/.env.local'), 'utf8')
          const line = raw.split('\n').find(l => l.startsWith('NEXTAUTH_SECRET='))
          return line ? line.slice('NEXTAUTH_SECRET='.length).replace(/^["']|["']$/g, '') : undefined
        } catch { return undefined }
      })()
      yes(Boolean(secret), 'a cache-invalidation secret was found',
        'set NEXTAUTH_SECRET or put it in apps/attendee/.env.local')

      const invalidated = await fetch(`${BASE}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, tags: ['floor-plan'] }),
      }).then(r => r.ok).catch(() => false)
      yes(invalidated, 'the map cache was invalidated so the new marker can be seen',
        'the revalidate address refused; NEXTAUTH_SECRET may not be set for this run')

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const tabAgain = page.locator('[data-testid="map-tab"]').filter({ hasText: mapRow.name }).first()
      if (await tabAgain.count()) { await tabAgain.click(); await page.waitForTimeout(400) }

      const orphan = page.locator('[data-testid="pin"][data-pin-label="Phase 9 Orphan"]').first()
      const drawn = await orphan.count()
      yes(drawn === 1, 'a booth marker with no company is drawn on the map', `found ${drawn}`)

      if (drawn === 1) {
        const shape = await orphan.evaluate(e => ({
          tag: e.tagName,
          cursor: getComputedStyle(e).cursor,
        }))
        yes(shape.tag !== 'BUTTON',
          'a booth marker with no company — is not a button', `tag was ${shape.tag}`)
        yes(shape.cursor !== 'pointer',
          'a booth marker with no company — offers no pointer cursor', `cursor was ${shape.cursor}`)

        await orphan.click()
        await page.waitForTimeout(150)
        const card = await readCard(page)
        yes(card === null, 'a booth marker with no company — tapping it opens no card',
          card ? `a card opened for ${card.name}` : '')
        if (card !== null) await dismissByCloseButton(page)
      } else {
        notRun([
          'a booth marker with no company — is not a button',
          'a booth marker with no company — offers no pointer cursor',
          'a booth marker with no company — tapping it opens no card',
        ], 'the marker this check created was not drawn, so its presentation could not be read')
      }
    } finally {
      // ── THE CLEANUP MUST NOT REPLACE THE FAILURE IT CLEANS UP AFTER ──────────
      //
      // Round 3 caught this. The database calls here were unguarded, so if the try
      // block failed because the marker never appeared AND the delete then threw a
      // lock error, the lock error would replace the real failure and the run would
      // report the wrong thing. The fetch below was already safe because it catches.
      let deleteError = null
      try {
        db.prepare(`DELETE FROM Pin WHERE id = ?`).run(ORPHAN_ID)
      } catch (e) {
        deleteError = e
      }
      yes(deleteError === null, 'removing the created marker did not error',
        deleteError ? String(deleteError.message ?? deleteError) : '')

      // ── INVALIDATE AGAIN AFTER DELETING. Round 1 of review caught this. ──────
      //
      // The first version deleted the row and stopped. The reload above had just
      // repopulated the app's 300-second `floor-plan` cache WITH the fake marker,
      // so a running server kept serving "Phase 9 Orphan" after its row was gone.
      //
      // That is not merely untidy: on the NEXT run, `withoutCompany` counts that
      // phantom marker, so the branch is skipped and the orphan case silently
      // stops being checked. A test that disables itself on its second run is
      // worse than no test, because the count still goes up.
      const secretAgain = process.env.NEXTAUTH_SECRET ?? (() => {
        try {
          const raw = readFileSync(join(ROOT, 'apps/attendee/.env.local'), 'utf8')
          const line = raw.split('\n').find(l => l.startsWith('NEXTAUTH_SECRET='))
          return line ? line.slice('NEXTAUTH_SECRET='.length).replace(/^["']|["']$/g, '') : undefined
        } catch { return undefined }
      })()
      const cleared = await fetch(`${BASE}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretAgain, tags: ['floor-plan'] }),
      }).then(r => r.ok).catch(() => false)
      yes(cleared, 'the map cache was invalidated again after removing the created marker',
        'the running app may keep serving it for up to 300s, which skips this branch next run')

      // Assert the cleanup actually took, rather than trusting the delete. Guarded
      // for the same reason as the delete above — round 3.
      let leftBehind = null
      let readError = null
      try {
        leftBehind = db.prepare(`SELECT COUNT(*) AS n FROM Pin WHERE id = ?`).get(ORPHAN_ID).n
      } catch (e) {
        readError = e
      }
      yes(readError === null && leftBehind === 0, 'the created marker is gone from the database',
        readError ? `could not check: ${String(readError.message ?? readError)}` : `${leftBehind} row(s) remain`)
    }
  }
}

// ── 4. Dismissing returns to the same map at the same position ───────────────
//
// The acceptance criterion in the plan. Checked after a zoom AND a pan, because
// a card that resets the view is indistinguishable from one that does not when
// the view was never moved.

section('Dismissing the card returns to the same map at the same zoom and position')

{
  const boothMapId = boothMapIds[0]
  const mapRow = mapRows.find(m => m.id === boothMapId)
  const tab = page.locator('[data-testid="map-tab"]').filter({ hasText: mapRow.name }).first()
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(300) }

  const vp = page.locator('[data-testid="map-viewport"]')
  const box = await vp.boundingBox()

  // Double-tap to zoom, then drag to move somewhere that is not the origin.
  await page.mouse.dblclick(box.x + box.width * 0.6, box.y + box.height * 0.4)
  await page.waitForTimeout(300)
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  const before = await readTransform(page)
  yes(before !== null, 'the map reports its position before the card opens')
  yes(before && Number(before.scale) > 1, 'the map is zoomed in before the card opens',
    `scale ${before?.scale}`)

  // Which marker is on screen after a zoom and pan is not knowable in advance,
  // so this asks the page which booth markers are currently within the window
  // rather than assuming one. Phase 8 recorded that a card must not assume a
  // marker sits where it did when the screen opened.
  const visibleSponsor = await page.evaluate(() => {
    const vp = document.querySelector('[data-testid="map-viewport"]')
    if (!vp) return null
    const v = vp.getBoundingClientRect()
    for (const el of document.querySelectorAll('[data-testid="pin"][data-pin-type="BOOTH"]')) {
      const r = el.getBoundingClientRect()
      if (r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom) {
        return el.getAttribute('data-pin-sponsor')
      }
    }
    return null
  })

  yes(visibleSponsor !== null, 'at least one booth marker is reachable after zooming and panning')

  // Everything after "a card opened" is meaningless unless a card actually
  // opened. "Dismissing restored the position" is trivially true when nothing
  // was ever shown, and so is "the close control dismissed it" — both assert
  // that no card is present, which is the state the screen was already in.
  const dependent = [
    'it is the card for the marker that was tapped',
    'opening the card does not move the map',
    'the close control dismisses the card',
    'the zoom level is unchanged after dismissing',
    'the map position is unchanged after dismissing',
    'the map is rendered in the same place after dismissing',
    'the same map is still selected after dismissing',
  ]

  if (!visibleSponsor) {
    notRun(
      ['a booth marker still opens a card on a zoomed, panned map', ...dependent],
      'no booth marker was reachable after zooming and panning',
    )
  } else {
    await openCardFor(page, visibleSponsor)
    const opened = await readCard(page)
    yes(opened !== null, 'a booth marker still opens a card on a zoomed, panned map')

    if (opened === null) {
      notRun(dependent, 'no card opened, so there is nothing to dismiss')
    } else {
      yes(opened.sponsorId === visibleSponsor, 'it is the card for the marker that was tapped',
        `card ${opened.sponsorId}, marker ${visibleSponsor}`)

      const during = await readTransform(page)
      yes(
        during && before && during.transform === before.transform,
        'opening the card does not move the map',
        `before ${before?.transform}, during ${during?.transform}`,
      )

      await dismissByCloseButton(page)
      const after = await readTransform(page)

      yes((await readCard(page)) === null, 'the close control dismisses the card')
      yes(after && before && after.scale === before.scale,
        'the zoom level is unchanged after dismissing', `before ${before?.scale}, after ${after?.scale}`)
      yes(after && before && after.transform === before.transform,
        'the map position is unchanged after dismissing',
        `before ${before?.transform}, after ${after?.transform}`)
      yes(after && before && after.box.left === before.box.left && after.box.top === before.box.top,
        'the map is rendered in the same place after dismissing',
        `before ${JSON.stringify(before?.box)}, after ${JSON.stringify(after?.box)}`)
      yes(after && before && after.activeMapPosition === before.activeMapPosition,
        'the same map is still selected after dismissing',
        `before ${before?.activeMap}, after ${after?.activeMap}`)
    }
  }
}

// ── 4b. The dialog behaves like the modal it says it is ──────────────────────
//
// Added after Phase 9's adversarial review found the card claiming
// role="dialog" with aria-modal="true" while never moving focus. Assistive
// software changes how it presents a page on the strength of that claim, so a
// claim without the behaviour is worse than no claim.

section('The card behaves like the modal dialog it declares itself to be')

{
  await page.locator('[data-testid="map-zoom-reset"]').first().click().catch(() => {})
  await page.waitForTimeout(200)

  const first = boothRows[0]
  const markerSel = `[data-testid="pin"][data-pin-sponsor="${first.sponsorId}"]`

  await openCardFor(page, first.sponsorId)
  const opened = await readCard(page)
  yes(opened !== null, 'a card is open before checking focus')

  if (opened === null) {
    notRun(
      ['focus moves into the card when it opens',
       'Tab leaves the card, so the markers behind it stay reachable by keyboard',
       'closing returns focus to the marker that opened it',
       'closing after the person has moved away leaves focus where they put it'],
      'no card was open',
    )
  } else {
    const focusInside = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="booth-card"]')
      return Boolean(card && (document.activeElement === card || card.contains(document.activeElement)))
    })
    yes(focusInside, 'focus moves into the card when it opens')

    // ── AMENDED BY PHASE 7, 2026-08-07 ──────────────────────────────────────
    //
    // This block used to assert that Tab is held inside the card and that
    // closing always returns focus to the marker. Below 768 pixels neither is
    // true any more, and both changed for the same reason: the card is no longer
    // over the map and the overlay is gone, so every marker behind it stays
    // reachable. Holding Tab inside would take away the keyboard route to the
    // very markers a finger can reach, and the card claiming `aria-modal` there
    // would describe the screen wrongly. This file runs at 390 × 844; phase 7's
    // own run asserts the modal behaviour at 1280, where it still holds.
    //
    // The contract at this width, in the order asserted below:
    //   - closing a card the person has not left returns focus to its marker,
    //   - Tab leaves the card,
    //   - and closing after they have moved away leaves them where they are
    //     rather than pulling focus back to the map.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    const backOnMarker = await page.evaluate(sel => {
      const marker = document.querySelector(sel)
      return Boolean(marker && document.activeElement === marker)
    }, markerSel)
    yes(backOnMarker, 'closing returns focus to the marker that opened it')

    await openCardFor(page, first.sponsorId)
    await page.waitForTimeout(200)
    // Tab further than the card holds, so a card that held focus would still
    // have it. Six presses against a card with two or three stops.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab')
    const leftTheCard = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="booth-card"]')
      return Boolean(card) && !card.contains(document.activeElement)
    })
    yes(leftTheCard, 'Tab leaves the card, so the markers behind it stay reachable by keyboard')

    const whereTheyWere = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    const stayedPut = await page.evaluate(prev => (document.activeElement?.getAttribute('data-testid') ?? null) === prev, whereTheyWere)
    yes(stayedPut, 'closing after the person has moved away leaves focus where they put it')
  }
}

// ── 5. Other ways of dismissing ──────────────────────────────────────────────

section('The card can also be dismissed by the backdrop and by the keyboard')

{
  await page.locator('[data-testid="map-zoom-reset"]').first().click().catch(() => {})
  await page.waitForTimeout(200)

  const first = boothRows[0]

  // Each dismissal is only a real check if a card was open first. Asserting
  // "the card is gone" against a screen that never had one passes for the wrong
  // reason, which is the failure mode this whole file is written against.
  await openCardFor(page, first.sponsorId)
  const beforeEscape = await readCard(page)
  yes(beforeEscape !== null, 'a card is open before trying the keyboard')
  if (beforeEscape === null) {
    notRun(['pressing Escape dismisses the card'], 'no card was open to dismiss')
  } else {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    yes((await readCard(page)) === null, 'pressing Escape dismisses the card')
  }

  // ── AMENDED BY PHASE 7, 2026-08-07 ──────────────────────────────────────────
  //
  // This step used to open a card and dismiss it by tapping the backdrop. That
  // was correct when it was written and is not any more: below 768 pixels the
  // backdrop is deliberately gone (UF-7). Its reach had nothing to do with where
  // the card was drawn — it covered the whole map container — so once the card
  // moved beneath the map, the backdrop was the only thing left over the map and
  // a tap meant for a second marker was spent closing the first card. Removing
  // it is what makes a second marker one tap.
  //
  // This whole file runs at 390 × 844, so the step is amended rather than
  // deleted: at this width the backdrop must exist in the markup and NOT be
  // shown, and the card is dismissed by its close control. The backdrop's
  // dismissal is still asserted at 768 and above, in phase 7's own run, where
  // the card still opens over the map.
  //
  // Found by re-running this file during phase 7, which the smoketest contract
  // requires of any phase that touches a surface an earlier one covers. It had
  // not been run since phase 9, and it failed on the first attempt.
  await openCardFor(page, first.sponsorId)
  const beforeBackdrop = await readCard(page)
  yes(beforeBackdrop !== null, 'a card is open before checking the backdrop')
  const backdrop = page.locator('[data-testid="booth-card-backdrop"]').first()
  const hasBackdrop = (await backdrop.count()) > 0
  yes(hasBackdrop, 'the backdrop element is still in the markup')

  if (beforeBackdrop === null || !hasBackdrop) {
    notRun(
      ['the backdrop is not drawn at phone width', 'the close control dismisses the card'],
      beforeBackdrop === null ? 'no card was open to dismiss' : 'no backdrop element exists',
    )
  } else {
    const shown = await backdrop.evaluate(el => getComputedStyle(el).display !== 'none')
    yes(!shown, 'the backdrop is not drawn at phone width, so a tap reaches the map')

    await page.locator('[data-testid="booth-card-close"]').first().click()
    await page.waitForTimeout(250)
    yes((await readCard(page)) === null, 'the close control dismisses the card')
  }
}

// ── 6. A drag does not open a card ───────────────────────────────────────────
//
// Phase 8 asserted that a drag does not ACTIVATE a marker. With a card wired to
// the marker, the observable consequence is different and is asserted directly:
// panning across a marker must not leave a card open.

section('Dragging across a marker pans the map without opening a card')

{
  await page.locator('[data-testid="map-zoom-reset"]').first().click().catch(() => {})
  await page.waitForTimeout(200)

  // Zoom first, so there is room to pan. At fit-to-width the clamp holds the
  // map still and a drag cannot move anything — Phase 8's review recorded a
  // drag assertion that passed for exactly that reason while proving nothing.
  //
  // The double-tap must land on BARE MAP, not on a marker. Since Phase 9 a
  // marker responds to a tap, so double-tapping one opens the card on the first
  // tap and dismisses it on the second, and the map never zooms. That is
  // correct behaviour and not what this section is testing, so the empty spot
  // is found rather than assumed — the middle of the exhibit hall has a marker
  // in it.
  const emptySpot = await page.evaluate(() => {
    const vp = document.querySelector('[data-testid="map-viewport"]')
    if (!vp) return null
    const v = vp.getBoundingClientRect()
    const markers = [...document.querySelectorAll('[data-testid="pin"]')].map(el => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    // Walk a grid inside the window and take the point furthest from any
    // marker, so this keeps working when the venue's markers move.
    let best = null
    for (let fx = 0.15; fx <= 0.85; fx += 0.05) {
      for (let fy = 0.15; fy <= 0.85; fy += 0.05) {
        const x = v.left + v.width * fx
        const y = v.top + v.height * fy
        const nearest = markers.reduce(
          (m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)),
          Number.POSITIVE_INFINITY,
        )
        if (!best || nearest > best.clear) best = { x, y, clear: nearest }
      }
    }
    return best
  })

  yes(emptySpot !== null && emptySpot.clear > 40,
    'a spot clear of every marker was found to double-tap',
    emptySpot ? `nearest marker ${emptySpot.clear.toFixed(0)}px away` : 'no viewport')

  if (emptySpot) await page.mouse.dblclick(emptySpot.x, emptySpot.y)
  await page.waitForTimeout(300)
  const zoomedNow = await readTransform(page)
  yes(Number(zoomedNow?.scale) > 1, 'the map is zoomed before the drag, so a drag can move it',
    `scale ${zoomedNow?.scale}`)

  // The marker must be COMFORTABLY INSIDE the window, not merely the first one
  // in the markup. At 2x zoom the topmost marker is usually scrolled out of
  // view; its bounding box still reports coordinates, the press lands outside
  // the map, and nothing pans — which looks exactly like a broken pan. Phase
  // 8's suite picks its marker the same way for the same reason.
  const target = await page.evaluate(() => {
    const vp = document.querySelector('[data-testid="map-viewport"]')
    if (!vp) return null
    const v = vp.getBoundingClientRect()
    for (const el of document.querySelectorAll('[data-testid="pin"][data-pin-type="BOOTH"]')) {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (cx > v.left + 70 && cx < v.right - 70 && cy > v.top + 70 && cy < v.bottom - 70) {
        return { sponsorId: el.getAttribute('data-pin-sponsor'), cx, cy }
      }
    }
    return null
  })

  yes(target !== null, 'a booth marker sits well inside the window to drag from')

  if (!target) {
    notRun(
      ['a tap on that same marker does open a card', 'the drag moved the map',
       'dragging from a marker did not open a card'],
      'no booth marker was far enough inside the window',
    )
  } else {
    // Proven first: a TAP on this very marker, in this very state, opens a card.
    // Without this, "the drag opened no card" is satisfied by a marker that
    // cannot open a card at all, and the assertion measures nothing.
    await openCardFor(page, target.sponsorId)
    const tapped = await readCard(page)
    yes(tapped !== null, 'a tap on that same marker does open a card')
    if (tapped !== null) await dismissByCloseButton(page)

    const beforeDrag = await readTransform(page)

    await page.mouse.move(target.cx, target.cy)
    await page.mouse.down()
    for (let s = 1; s <= 12; s++) {
      await page.mouse.move(target.cx - (60 * s) / 12, target.cy - (40 * s) / 12)
    }
    await page.mouse.up()
    await page.waitForTimeout(300)

    const afterDrag = await readTransform(page)
    yes(afterDrag?.transform !== beforeDrag?.transform, 'the drag moved the map',
      `before ${beforeDrag?.transform}, after ${afterDrag?.transform}`)

    if (tapped === null) {
      notRun(['dragging from a marker did not open a card'],
        'a tap on this marker opens nothing either, so the check proves nothing')
    } else {
      yes((await readCard(page)) === null, 'dragging from a marker did not open a card')
    }
  }
}

// ── 7. Switching maps while a card is open ───────────────────────────────────

section('Switching maps does not leave a card from the previous map open')

{
  await page.locator('[data-testid="map-zoom-reset"]').first().click().catch(() => {})
  await page.waitForTimeout(200)

  const boothMapId = boothMapIds[0]
  const boothMap = mapRows.find(m => m.id === boothMapId)
  const otherMap = mapRows.find(m => m.id !== boothMapId)

  const tab = page.locator('[data-testid="map-tab"]').filter({ hasText: boothMap.name }).first()
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(300) }

  await openCardFor(page, boothRows.find(r => r.venueMapId === boothMapId).sponsorId)
  const openBefore = await readCard(page)
  yes(openBefore !== null, 'a card is open before switching maps')

  if (!otherMap) {
    notRun(['switching to another map closes the open card', 'the other map is now selected'],
      'only one map exists')
  } else if (openBefore === null) {
    // The map switch itself is still worth checking; the card assertion is not,
    // because "no card is open afterwards" was already true beforehand.
    notRun(['switching to another map closes the open card'], 'no card was open to leave behind')
    const other = page.locator('[data-testid="map-tab"]').filter({ hasText: otherMap.name }).first()
    await other.click()
    await page.waitForTimeout(400)
    const t = await readTransform(page)
    yes(t?.activeMap === otherMap.name, 'the other map is now selected',
      `selected ${t?.activeMap}, expected ${otherMap.name}`)
  } else {
    const other = page.locator('[data-testid="map-tab"]').filter({ hasText: otherMap.name }).first()
    await other.click()
    await page.waitForTimeout(400)
    yes((await readCard(page)) === null, 'switching to another map closes the open card')
    const t = await readTransform(page)
    yes(t?.activeMap === otherMap.name, 'the other map is now selected',
      `selected ${t?.activeMap}, expected ${otherMap.name}`)
  }
}

// ── 8. Nothing threw ─────────────────────────────────────────────────────────

section('The screen worked without complaining')

const show = e => `[${(e.atMs / 1000).toFixed(1)}s, ${e.stage}] ${e.text.slice(0, 160)}`

yes(pageErrors.length === 0, 'no uncaught error in the page', pageErrors.map(show).join(' | '))

// ── Why the session-fetch message is separated rather than filtered ──────────
//
// Measured 2026-08-02: a page signed in and left idle on the map for 45 seconds
// produces no console errors at all, so this is not a background poll. It
// appears only during a long interactive run, and Phase 8's suite never saw it
// because that suite asserts on failed map pictures alone.
//
// It is reported with its moment and its stage rather than dropped, so the
// smoketest document can state where it happened instead of recording a silent
// exclusion. What it is NOT allowed to do is hide a card or map failure, which
// is what the second assertion below covers.
const sessionFetch = consoleErrors.filter(e => /CLIENT_FETCH_ERROR|\/api\/auth\/session/.test(e.text))
const other = consoleErrors.filter(e => !sessionFetch.includes(e))

yes(other.length === 0, 'no console error outside the known session-fetch message',
  other.map(show).join(' | '))

if (sessionFetch.length > 0) {
  console.log(
    `  ! ${sessionFetch.length} next-auth session-fetch message(s), reported not asserted:\n` +
      sessionFetch.map(e => `      ${show(e)}`).join('\n'),
  )
}

// ── Result ───────────────────────────────────────────────────────────────────

db.prepare(CLEANUP_SQL).run()
db.close()
await browser.close()

console.log('\n' + '─'.repeat(60))
console.log(`  Results: ${pass} passed, ${fail} failed`)
console.log('─'.repeat(60))
console.log(
  '\n  Green here is evidence about the assertions listed above and nothing\n' +
  '  wider. It says nothing about the admin upload tool, which is Phase 10,\n' +
  '  nor about whether the deployed database holds these same company values.\n',
)
process.exit(fail === 0 ? 0 : 1)
