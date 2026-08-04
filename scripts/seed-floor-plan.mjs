#!/usr/bin/env node
// Seeds the demonstration venue: three maps and their pins.
// Idempotent — re-running replaces the seeded rows rather than duplicating them.
//
// Usage: node scripts/seed-floor-plan.mjs [--local <path/to/dev.db>]
//   Default: seed Turso using TURSO_DATABASE_URL/TURSO_AUTH_TOKEN from env
//   or apps/web/.env.local. With --local, seed a local sqlite file instead.
//
//   node scripts/seed-floor-plan.mjs --local packages/db/prisma/dev.db
//   pnpm seed:floor-plan
//
// Run scripts/migrate-floor-plan.mjs first; this script only writes rows.
//
// ── What it writes, and where the values come from ───────────────────────────
//
// Nothing here is typed in by hand except the ballroom-level room names, and
// those are checked against the agenda by scripts/test-floor-plan.mjs.
//
//   Exhibit Hall   — one booth pin per exhibiting company that carries a booth
//                    number, read from the database in booth-number order and
//                    laid out by scripts/floor-plan-demo-venue.mjs. The picture
//                    drawn by scripts/build-floor-plan-maps.mjs uses the same
//                    layout, so a marker sits on its stand rather than beside it.
//   Ballroom Level — room pins for rooms that seeded agenda sessions run in.
//   Meeting Rooms  — one room pin per entry in MEETING_ROOMS, the constant the
//                    meetings product uses to place a booking, so a delegate
//                    whose booking says Table 5 can find Table 5.
//
// ── Two traps this script is written around ──────────────────────────────────
//
// 1. Dates are stored as INTEGER milliseconds, measured 2026-08-01 against the
//    existing Sponsor and Conference rows. The table's own DDL default is
//    CURRENT_TIMESTAMP, which writes TEXT. An insert that leaves createdAt out
//    would therefore store a value the apps cannot read back, so createdAt is
//    always supplied explicitly.
// 2. A booth pin stores a sponsor id and never a booth number. The seed file
//    and the database have already drifted apart on booth numbers — the file
//    sets eight in `P1` form, the database holds ten in `P-01` form, and the
//    seed's upsert does not rewrite them — while ids match exactly and no
//    sponsor row is ever deleted.

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import {
  MAPS,
  BALLROOM_ROOMS,
  layoutBooths,
  layoutMeetingRooms,
  imagePathFor,
} from './floor-plan-demo-venue.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

const { MEETING_ROOMS } = await import(join(ROOT, 'packages/db/src/meeting-engine.ts'))

// Stable, readable ids so a re-run updates the same rows instead of adding a
// second copy of the venue. The column is plain text; the cuid default only
// applies to rows this script does not write.
const mapId = (slug) => `venuemap-${slug}`
const pinId = (slug, key) => `pin-${slug}-${key}`
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function tursoCredsFromEnvLocal() {
  const envPath = join(ROOT, 'apps/web/.env.local')
  const text = readFileSync(envPath, 'utf8')
  const get = (key) => {
    const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
  }
  return { url: get('TURSO_DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') }
}

// The local database uses `delete` journalling, so a write while an app is
// running can hit a lock. Wait rather than fail.
async function withRetry(fn, what) {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (!/database is locked|SQLITE_BUSY/i.test(String(e?.message ?? e))) throw e
      console.log(`  … ${what} is waiting on a lock (attempt ${attempt})`)
      await new Promise(r => setTimeout(r, 400 * attempt))
    }
  }
  throw lastError
}

async function main() {
  const localIdx = process.argv.indexOf('--local')
  let client
  let target
  if (localIdx !== -1) {
    const path = process.argv[localIdx + 1]
    if (!path) {
      console.error('--local requires a path to a sqlite file')
      process.exit(2)
    }
    target = `file:${path}`
    client = createClient({ url: target })
  } else {
    let url = process.env.TURSO_DATABASE_URL
    let authToken = process.env.TURSO_AUTH_TOKEN
    if (!url || !authToken) {
      ;({ url, authToken } = tursoCredsFromEnvLocal())
    }
    if (!url || !authToken) {
      console.error('No TURSO_DATABASE_URL/TURSO_AUTH_TOKEN in env or apps/web/.env.local')
      process.exit(2)
    }
    target = url
    client = createClient({ url, authToken })
  }

  // ── Only for a local file, and this was found by running it for real ────────
  //
  // busy_timeout exists because four apps share one local SQLite file, so a write
  // can arrive while another holds the lock; without it that throws "database is
  // locked" instead of waiting. A remote database has no such lock to wait on, and
  // Turso REFUSES the statement outright: "SQL not allowed statement: PRAGMA
  // busy_timeout = 5000", raised as SQL_PARSE_ERROR.
  //
  // It used to be issued unconditionally, which means this script's DEFAULT mode —
  // the one its own usage line documents as "seed Turso" — failed on its first
  // statement and had never once worked. Every run had used --local. Found
  // 2026-08-03 the first time it was pointed at the deployed database.
  //
  // It fails before writing, so nothing was ever half-seeded by this.
  if (target.startsWith('file:')) {
    await client.execute('PRAGMA busy_timeout = 5000')
  }

  // ── What we are seeding against ────────────────────────────────────────────

  const conferences = await client.execute(`SELECT id, name FROM Conference WHERE active = 1`)
  if (conferences.rows.length !== 1) {
    console.error(
      `Expected exactly one active conference to seed against, found ${conferences.rows.length}.`,
    )
    process.exit(1)
  }
  const conference = conferences.rows[0]

  const boothResult = await client.execute(
    `SELECT id, name, boothNumber FROM Sponsor
      WHERE conferenceId = ? AND boothNumber IS NOT NULL AND trim(boothNumber) <> ''
      ORDER BY boothNumber ASC`,
    [conference.id],
  )
  const boothSponsors = boothResult.rows.map(r => ({
    id: r.id,
    name: r.name,
    boothNumber: r.boothNumber,
  }))

  if (boothSponsors.length === 0) {
    console.error('No exhibiting company carries a booth number — there is nothing to pin.')
    process.exit(1)
  }

  const stands = layoutBooths(boothSponsors)
  const meetingRoomShapes = layoutMeetingRooms(MEETING_ROOMS)

  console.log(`Seeding the floor plan for "${conference.name}" into ${target.replace(/\/\/.*@/, '//***@')}`)
  console.log(
    `  ${boothSponsors.length} companies with a booth number, ` +
    `${BALLROOM_ROOMS.length} ballroom-level rooms, ${meetingRoomShapes.length} meeting tables`,
  )

  // ── The pins for each map ──────────────────────────────────────────────────

  const pinsBySlug = {
    'exhibit-hall': stands.map(stand => ({
      key: `booth-${stand.sponsor.id}`,
      type: 'BOOTH',
      // A booth pin takes its display name from the linked company, so this is
      // not what the screen shows. It is the fallback for a pin whose link is
      // later broken — deleting a company sets sponsorId to null and leaves the
      // marker in place — and the company's own name is the best fallback the
      // seed has.
      label: stand.sponsor.name,
      x: stand.x,
      y: stand.y,
      sponsorId: stand.sponsor.id,
    })),
    'ballroom-level': BALLROOM_ROOMS.map(room => ({
      key: `room-${slugify(room.label)}`,
      type: 'ROOM',
      label: room.label,
      x: room.x,
      y: room.y,
      sponsorId: null,
    })),
    'meeting-rooms': meetingRoomShapes.map(room => ({
      key: `room-${slugify(room.label)}`,
      type: 'ROOM',
      label: room.label,
      x: room.x,
      y: room.y,
      sponsorId: null,
    })),
  }

  const now = Date.now()
  let mapCount = 0
  let pinCount = 0

  // ── Every write is ONE atomic batch ────────────────────────────────────────
  //
  // Raised by adversarial review round 1 and it is the most serious thing found
  // in this phase. An earlier version ran each statement on its own: for each
  // map it deleted that map's markers, then upserted the map, then inserted the
  // markers back one at a time. A failure anywhere in the middle — a dropped
  // connection, a constraint error, the process being killed — left a map
  // published with some or none of its markers, and this script targets the
  // DEPLOYED database by default. A delegate would have seen an empty venue map
  // until somebody noticed and ran it again.
  //
  // libsql's batch runs every statement inside a single transaction and rolls
  // the whole thing back if any one of them fails, so the venue is either
  // wholly replaced or wholly untouched. There is no intermediate state a
  // delegate can load.
  const statements = []

  for (const map of MAPS) {
    const id = mapId(map.slug)
    const pins = pinsBySlug[map.slug]
    if (!pins) {
      console.error(`No pins defined for ${map.slug}`)
      process.exit(1)
    }

    // Markers are cleared before the map row is written, so a marker removed
    // from the seed does not survive as an orphan on the published map. Both
    // are in the same transaction, so the cleared state is never observable.
    statements.push({ sql: `DELETE FROM Pin WHERE venueMapId = ?`, args: [id] })

    statements.push({
      sql: `INSERT INTO VenueMap (id, conferenceId, name, imageUrl, position, createdAt)
              VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              conferenceId = excluded.conferenceId,
              name         = excluded.name,
              imageUrl     = excluded.imageUrl,
              position     = excluded.position`,
      args: [id, conference.id, map.name, imagePathFor(map.slug), map.position, now],
    })
    mapCount++

    for (const pin of pins) {
      statements.push({
        sql: `INSERT INTO Pin (id, venueMapId, type, label, x, y, sponsorId, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [pinId(map.slug, pin.key), id, pin.type, pin.label, pin.x, pin.y, pin.sponsorId, now],
      })
      pinCount++
    }

    console.log(`  ${map.name.padEnd(16)} ${pins.length} pins prepared`)
  }

  await withRetry(
    () => client.batch(statements, 'write'),
    `writing ${mapCount} maps and ${pinCount} pins in one transaction`,
  )
  console.log(`✓ ${statements.length} statements committed as one transaction`)

  // ── Verify rather than assume ──────────────────────────────────────────────
  //
  // An insert that ran without throwing is not the same as a row that is there.

  const writtenMaps = await client.execute(
    `SELECT id, name, position, imageUrl FROM VenueMap WHERE conferenceId = ? ORDER BY position ASC`,
    [conference.id],
  )
  const writtenPins = await client.execute(
    `SELECT count(*) AS c FROM Pin WHERE venueMapId IN (SELECT id FROM VenueMap WHERE conferenceId = ?)`,
    [conference.id],
  )

  const gotMaps = writtenMaps.rows.length
  const gotPins = Number(writtenPins.rows[0].c)

  console.log(`\nWrote ${mapCount} maps and ${pinCount} pins; the database now holds ${gotMaps} maps and ${gotPins} pins.`)

  client.close?.()

  if (gotMaps !== mapCount || gotPins !== pinCount) {
    console.error('✗ What is stored does not match what was written.')
    process.exit(1)
  }
  console.log('Seeded.')
}

main().catch((e) => {
  console.error('Seeding failed:', e)
  process.exit(1)
})
