#!/usr/bin/env node
// Draws the demonstration venue's three floor-plan pictures and writes them to
// apps/attendee/public/maps/ as PNG files.
//
//   node scripts/build-floor-plan-maps.mjs
//   pnpm build:floor-plan-maps
//
// ── Why the pictures are generated rather than supplied ──────────────────────
//
// Measured 2026-08-01, before this phase was written: there is no floor-plan
// picture of any kind in this repository. Every JPG, PNG, PDF and SVG outside
// node_modules is a performance capture, a sponsor logo or an app icon. The
// participant map screen therefore had nothing to show, so the demonstration
// venue is drawn here.
//
// A real venue's plan can replace any of these later: drop the file in, change
// one seed value. The stored column holds a path, so no code changes.
//
// ── Why PNG rather than a drawing file ───────────────────────────────────────
//
// A real venue sends a photo, a scan or a PDF export — ADR 0007 is built around
// that being the normal case. Producing PNGs means the seeded maps behave on
// screen exactly like an uploaded one will, including their weight, rather than
// being unrepresentatively crisp and small.
//
// ── Why the shapes come from a shared module ─────────────────────────────────
//
// The blocks drawn here and the pins written by scripts/seed-floor-plan.mjs are
// the same numbers, from scripts/floor-plan-demo-venue.mjs. A marker cannot end
// up beside its stand instead of on it.

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import {
  PICTURE_WIDTH,
  PICTURE_HEIGHT,
  MAPS,
  BALLROOM_ROOMS,
  layoutBooths,
  layoutMeetingRooms,
} from './floor-plan-demo-venue.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = join(ROOT, 'packages/db/prisma/dev.db')
const OUT_DIR = join(ROOT, 'apps/attendee/public/maps')

const { MEETING_ROOMS } = await import(join(ROOT, 'packages/db/src/meeting-engine.ts'))

// ─── Drawing helpers ──────────────────────────────────────────────────────────

const INK = '#2f3336'
const INK_SOFT = '#7c8288'
const PAPER = '#f4f1ea'
const WALL = '#3d4348'
const FLOOR = '#e7e2d7'

const px = (percentX) => (percentX / 100) * PICTURE_WIDTH
const py = (percentY) => (percentY / 100) * PICTURE_HEIGHT

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A filled block with a hairline border and a small caption in its top-left. */
function block(shape, { fill, caption, captionSize = 20 }) {
  const w = px(shape.w)
  const h = py(shape.h)
  const x = px(shape.x) - w / 2
  const y = py(shape.y) - h / 2
  const parts = [
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${fill}" stroke="${WALL}" stroke-width="2.5"/>`,
  ]
  if (caption) {
    parts.push(
      `<text x="${(x + 12).toFixed(1)}" y="${(y + captionSize + 6).toFixed(1)}" font-family="Helvetica, Arial, sans-serif" font-size="${captionSize}" fill="${INK_SOFT}" letter-spacing="0.5">${esc(caption)}</text>`,
    )
  }
  return parts.join('\n')
}

/** The paper, the outer wall, a faint structural grid, and the title block. */
function frame(map, inner) {
  const gridLines = []
  for (let gx = 100; gx < PICTURE_WIDTH; gx += 100) {
    gridLines.push(
      `<line x1="${gx}" y1="0" x2="${gx}" y2="${PICTURE_HEIGHT}" stroke="${INK}" stroke-opacity="0.05" stroke-width="1"/>`,
    )
  }
  for (let gy = 100; gy < PICTURE_HEIGHT; gy += 100) {
    gridLines.push(
      `<line x1="0" y1="${gy}" x2="${PICTURE_WIDTH}" y2="${gy}" stroke="${INK}" stroke-opacity="0.05" stroke-width="1"/>`,
    )
  }

  // A north arrow and a scale bar, because a plan without them does not read as
  // a plan.
  const northX = PICTURE_WIDTH - 90
  const northY = 96
  const north = `
    <g>
      <line x1="${northX}" y1="${northY + 34}" x2="${northX}" y2="${northY - 22}" stroke="${INK}" stroke-width="3"/>
      <polygon points="${northX},${northY - 34} ${northX - 9},${northY - 16} ${northX + 9},${northY - 16}" fill="${INK}"/>
      <text x="${northX}" y="${northY + 56}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="${INK}">N</text>
    </g>`

  const scaleX = PICTURE_WIDTH - 300
  const scaleY = PICTURE_HEIGHT - 52
  const scale = `
    <g>
      <line x1="${scaleX}" y1="${scaleY}" x2="${scaleX + 180}" y2="${scaleY}" stroke="${INK}" stroke-width="3"/>
      <line x1="${scaleX}" y1="${scaleY - 8}" x2="${scaleX}" y2="${scaleY + 8}" stroke="${INK}" stroke-width="3"/>
      <line x1="${scaleX + 180}" y1="${scaleY - 8}" x2="${scaleX + 180}" y2="${scaleY + 8}" stroke="${INK}" stroke-width="3"/>
      <text x="${scaleX + 90}" y="${scaleY - 16}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${INK_SOFT}">20 m</text>
    </g>`

  // A title block, drawn opaque and bordered the way a real plan carries one.
  // Without the panel behind it the outer wall runs straight through the
  // subtitle, which is how the first render came out.
  const title = `
    <g>
      <rect x="40" y="${PICTURE_HEIGHT - 124}" width="560" height="96" fill="${PAPER}" stroke="${WALL}" stroke-width="2.5"/>
      <text x="66" y="${PICTURE_HEIGHT - 74}" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="600" fill="${INK}">${esc(map.name)}</text>
      <text x="66" y="${PICTURE_HEIGHT - 44}" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="${INK_SOFT}">${esc(map.subtitle)}</text>
    </g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PICTURE_WIDTH}" height="${PICTURE_HEIGHT}" viewBox="0 0 ${PICTURE_WIDTH} ${PICTURE_HEIGHT}">
  <rect width="${PICTURE_WIDTH}" height="${PICTURE_HEIGHT}" fill="${PAPER}"/>
  ${gridLines.join('\n  ')}
  <rect x="28" y="28" width="${PICTURE_WIDTH - 56}" height="${PICTURE_HEIGHT - 56}" fill="none" stroke="${WALL}" stroke-width="6"/>
  ${inner}
  ${north}
  ${scale}
  ${title}
</svg>`
}

// ─── The three drawings ───────────────────────────────────────────────────────

function drawExhibitHall(map, stands) {
  const parts = []

  // The hall floor, then the stands, then aisle markings between the rows.
  parts.push(
    `<rect x="${px(8)}" y="${py(12)}" width="${px(84)}" height="${py(80)}" fill="${FLOOR}" stroke="${WALL}" stroke-width="3"/>`,
  )

  // Entrance, drawn as a gap in the bottom wall with a label.
  parts.push(
    `<rect x="${px(42)}" y="${py(91)}" width="${px(16)}" height="14" fill="${PAPER}"/>`,
    `<text x="${px(50)}" y="${py(96)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="${INK}">ENTRANCE</text>`,
  )

  const rowYs = [...new Set(stands.map(s => s.y))].sort((a, b) => a - b)
  rowYs.forEach((rowY, i) => {
    if (i === 0) return
    const previous = rowYs[i - 1]
    const aisleY = (rowY + previous) / 2
    parts.push(
      `<line x1="${px(10)}" y1="${py(aisleY)}" x2="${px(90)}" y2="${py(aisleY)}" stroke="${INK}" stroke-opacity="0.18" stroke-width="2" stroke-dasharray="14 10"/>`,
    )
  })

  for (const stand of stands) {
    parts.push(
      block(stand, {
        fill: stand.tier === 'P' ? '#dfe6ea' : stand.tier === 'G' ? '#e6e2d5' : '#eae7e0',
        caption: stand.sponsor.boothNumber,
      }),
    )
  }

  return frame(map, parts.join('\n  '))
}

function drawBallroomLevel(map, rooms) {
  const parts = []
  parts.push(
    `<rect x="${px(8)}" y="${py(10)}" width="${px(84)}" height="${py(82)}" fill="${FLOOR}" stroke="${WALL}" stroke-width="3"/>`,
  )
  for (const room of rooms) {
    parts.push(block(room, { fill: '#e2e8ea', caption: room.label, captionSize: 22 }))
  }
  // A corridor running between the two banks of rooms.
  parts.push(
    `<line x1="${px(50)}" y1="${py(12)}" x2="${px(50)}" y2="${py(70)}" stroke="${INK}" stroke-opacity="0.16" stroke-width="2" stroke-dasharray="14 10"/>`,
  )
  return frame(map, parts.join('\n  '))
}

function drawMeetingRooms(map, rooms) {
  const parts = []
  parts.push(
    `<rect x="${px(10)}" y="${py(12)}" width="${px(80)}" height="${py(78)}" fill="${FLOOR}" stroke="${WALL}" stroke-width="3"/>`,
  )
  for (const room of rooms) {
    parts.push(
      block(room, {
        fill: room.capacity > 1 ? '#e3e9e2' : '#e9e6de',
        caption: room.label,
        captionSize: 20,
      }),
    )
  }
  return frame(map, parts.join('\n  '))
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function main() {
  const db = new DatabaseSync(DB_PATH)

  // The SAME query the seed uses, scoped to the SAME single active conference.
  // Raised by adversarial review round 2: an earlier version of this script read
  // every company carrying a booth number regardless of which conference it
  // belonged to, while the seed read only the active conference's. Today there
  // is exactly one conference so the two agreed by luck. With a second one, the
  // drawn hall could show stands that no marker points at, or shift the stand
  // order out from under the markers — which is precisely the picture-and-pins
  // disagreement this whole shared-module arrangement exists to prevent.
  const conference = db.prepare(`select id, name from Conference where active = 1`).get()
  if (!conference) {
    console.error('No active conference. There is no venue to draw.')
    process.exit(1)
  }

  const boothSponsors = db
    .prepare(
      `select id, name, boothNumber from Sponsor
        where conferenceId = ?
          and boothNumber is not null and trim(boothNumber) <> ''
        order by boothNumber asc`,
    )
    .all(conference.id)
  db.close()

  if (boothSponsors.length === 0) {
    console.error(
      `No exhibiting company at "${conference.name}" carries a booth number — nothing to draw on the hall map.`,
    )
    process.exit(1)
  }

  const stands = layoutBooths(boothSponsors)
  const meetingRooms = layoutMeetingRooms(MEETING_ROOMS)

  const drawings = {
    'exhibit-hall': (map) => drawExhibitHall(map, stands),
    'ballroom-level': (map) => drawBallroomLevel(map, BALLROOM_ROOMS),
    'meeting-rooms': (map) => drawMeetingRooms(map, meetingRooms),
  }

  mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: PICTURE_WIDTH, height: PICTURE_HEIGHT },
    deviceScaleFactor: 1,
  })

  for (const map of MAPS) {
    const draw = drawings[map.slug]
    if (!draw) {
      console.error(`No drawing defined for ${map.slug}`)
      process.exitCode = 1
      continue
    }
    const svg = draw(map)
    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:0;overflow:hidden">${svg}</body></html>`,
      { waitUntil: 'load' },
    )
    const target = join(OUT_DIR, `${map.slug}.png`)
    const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: PICTURE_WIDTH, height: PICTURE_HEIGHT } })
    writeFileSync(target, shot)
    console.log(`✓ ${map.name.padEnd(16)} → apps/attendee/public/maps/${map.slug}.png  (${(shot.length / 1024).toFixed(0)} KB)`)
  }

  await browser.close()

  console.log(`\n${stands.length} stands drawn on the hall, ${BALLROOM_ROOMS.length} rooms on the ballroom level, ${meetingRooms.length} on the meeting floor.`)
}

main().catch((e) => {
  console.error('Drawing failed:', e)
  process.exit(1)
})
