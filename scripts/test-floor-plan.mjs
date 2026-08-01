#!/usr/bin/env node
// Checks for the floor-plan data layer — the VenueMap and Pin models and the
// seeded demonstration venue.
//
//   node scripts/test-floor-plan.mjs
//   pnpm test:floor-plan
//
// Exits non-zero on any failure.
//
// ── Why this file exists ─────────────────────────────────────────────────────
//
// Phase 8 of the onboarding-and-floor-plan plan adds the first schema change in
// this body of work, plus seed data for a demonstration venue. The participant
// map screen is covered by a real browser through
// docs/smoketests/playwright/phase-8-floor-plan-viewer.mjs, and that is the
// primary evidence for anything a delegate can see.
//
// This file covers what a browser flow cannot reach:
//
//   1. Stored values that would render wrongly rather than fail — a pin
//      positioned off the picture, two markers stacked on the same spot, a map
//      whose picture file is missing from disk.
//   2. Whether the seed is CONSISTENT WITH DATA THAT ALREADY EXISTS, rather
//      than with strings someone typed. The meeting-room map's labels are
//      compared against MEETING_ROOMS in packages/db/src/meeting-engine.ts, and
//      the session-room map's labels against the rooms real agenda sessions
//      already use. A map naming rooms that no other part of the product knows
//      about would pass a browser test and still be wrong.
//   3. Enumeration rather than sampling. Every exhibiting company that carries
//      a booth number must have exactly one booth pin — the count is derived
//      from the database, never remembered.
//
// Same shape and same mechanism as scripts/test-onboarding-policy.mjs. Node
// imports the TypeScript module directly; no test runner is involved and none
// is introduced.
//
// ── Why booth pins link by sponsor id and never by booth number ──────────────
//
// Measured 2026-08-01 before this phase was written: packages/db/prisma/seed.ts
// sets eight booth numbers in `P1` form, while the local database holds ten in
// `P-01` form. The seed UPSERTS sponsors by id and its update branch does not
// write boothNumber, so the database values survive a re-seed and the two have
// drifted apart. Sponsor ids, by contrast, match exactly and the seed never
// deletes a sponsor row. A pin therefore stores sponsorId only, and the booth
// number is read through the relation at display time.

import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = join(ROOT, 'packages/db/prisma/dev.db')
const PUBLIC_DIR = join(ROOT, 'apps/attendee/public')

const { MEETING_ROOMS } = await import(join(ROOT, 'packages/db/src/meeting-engine.ts'))

let passes = 0
let failures = 0
function check(name, cond, detail = '') {
  if (cond) {
    passes++
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
function section(title) {
  console.log(`\n── ${title} ──`)
}

const db = new DatabaseSync(DB_PATH)

// A helper that answers "does this table exist" without throwing, so the first
// run against a tree with no schema change reports a clean failure rather than
// a stack trace.
function tableExists(name) {
  const row = db
    .prepare(`select name from sqlite_master where type = 'table' and name = ?`)
    .get(name)
  return Boolean(row)
}
function columnsOf(name) {
  if (!tableExists(name)) return []
  return db.prepare(`pragma table_info(${name})`).all().map(c => c.name)
}

// ─── 1. The two tables exist with the columns the rest of this file reads ─────
//
// Asserted by name rather than inferred from a query succeeding. A query that
// throws and a query that returns nothing look identical from the outside, and
// this phase's whole point is that neither table existed before it.

section('The schema change is applied to this database')

const hasVenueMap = tableExists('VenueMap')
const hasPin = tableExists('Pin')
check('table VenueMap exists', hasVenueMap)
check('table Pin exists', hasPin)

const VENUE_MAP_COLUMNS = ['id', 'conferenceId', 'name', 'imageUrl', 'position', 'createdAt']
const PIN_COLUMNS = ['id', 'venueMapId', 'type', 'label', 'x', 'y', 'sponsorId', 'createdAt']

const venueMapCols = columnsOf('VenueMap')
const pinCols = columnsOf('Pin')

for (const col of VENUE_MAP_COLUMNS) {
  check(`VenueMap has column ${col}`, venueMapCols.includes(col), `has: ${venueMapCols.join(', ') || 'nothing'}`)
}
for (const col of PIN_COLUMNS) {
  check(`Pin has column ${col}`, pinCols.includes(col), `has: ${pinCols.join(', ') || 'nothing'}`)
}

// Everything below reads those tables. Without them there is nothing to say, and
// continuing would report dozens of failures that all have one cause.
if (!hasVenueMap || !hasPin) {
  console.log('\n' + '─'.repeat(60))
  console.log(`  Results: ${passes} passed, ${failures} failed`)
  console.log('─'.repeat(60))
  console.error(
    '\n  Stopped early: the floor-plan tables are not in this database, so the\n' +
    '  seed and pin-placement checks below have nothing to read. Apply the\n' +
    '  schema change and run the seed, then run this again.\n',
  )
  db.close()
  process.exit(1)
}

// ─── 2. The maps ──────────────────────────────────────────────────────────────

section('Seeded maps')

const conference = db.prepare(`select id, name from Conference where active = 1`).get()
check('there is exactly one active conference to seed against', Boolean(conference), 'no active conference row')

const maps = db
  .prepare(`select id, conferenceId, name, imageUrl, position from VenueMap order by position asc`)
  .all()

check(
  `the active conference has 3 or 4 maps (found ${maps.length})`,
  maps.length >= 3 && maps.length <= 4,
  `got ${maps.length}`,
)

check(
  'every map belongs to the active conference',
  conference ? maps.every(m => m.conferenceId === conference.id) : false,
  maps.map(m => `${m.name}→${m.conferenceId}`).join(' | '),
)

const positions = maps.map(m => m.position)
check(
  'map positions are distinct',
  new Set(positions).size === positions.length,
  positions.join(', '),
)
check(
  'map positions run 1..N with no gap, so the switch order is total',
  positions.every((p, i) => p === i + 1),
  positions.join(', '),
)

const names = maps.map(m => m.name)
check(
  'every map name is non-blank',
  names.every(n => typeof n === 'string' && n.trim().length > 0),
  JSON.stringify(names),
)
check('every map name is distinct', new Set(names).size === names.length, JSON.stringify(names))

// ─── 3. The picture each map points at ────────────────────────────────────────
//
// A path stored in the column proves nothing on its own. A map whose file is
// missing renders as a broken picture with its pins floating over white space,
// and every check that only reads the database would still pass. So the file is
// opened and its first bytes are read.

section('Each map’s picture exists on disk and is a real PNG')

for (const m of maps) {
  check(
    `${m.name}: imageUrl is a path under /maps/ ending .png`,
    typeof m.imageUrl === 'string' && /^\/maps\/[a-z0-9-]+\.png$/.test(m.imageUrl),
    JSON.stringify(m.imageUrl),
  )

  const filePath = join(PUBLIC_DIR, m.imageUrl.replace(/^\//, ''))
  const present = existsSync(filePath)
  check(`${m.name}: the file exists at apps/attendee/public${m.imageUrl}`, present, filePath)

  if (present) {
    const size = statSync(filePath).size
    check(`${m.name}: the file is not empty (${size} bytes)`, size > 1000, `${size} bytes`)

    const head = readFileSync(filePath).subarray(0, 8)
    const isPng = head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    check(`${m.name}: the file really is a PNG, by its first bytes`, isPng, head.toString('hex'))
  }
}

// ─── 4. The pins ──────────────────────────────────────────────────────────────

section('Pin placement')

const pins = db
  .prepare(
    `select p.id, p.venueMapId, p.type, p.label, p.x, p.y, p.sponsorId, m.name as mapName
       from Pin p left join VenueMap m on m.id = p.venueMapId`,
  )
  .all()

check(`there are pins to check (found ${pins.length})`, pins.length > 0, `${pins.length}`)

check(
  'every pin belongs to a map that exists',
  pins.every(p => maps.some(m => m.id === p.venueMapId)),
  pins.filter(p => !maps.some(m => m.id === p.venueMapId)).map(p => p.id).join(', '),
)

check(
  'every map carries at least one pin',
  maps.every(m => pins.some(p => p.venueMapId === m.id)),
  maps.filter(m => !pins.some(p => p.venueMapId === m.id)).map(m => m.name).join(', '),
)

check(
  'every pin type is BOOTH or ROOM',
  pins.every(p => p.type === 'BOOTH' || p.type === 'ROOM'),
  [...new Set(pins.map(p => p.type))].join(', '),
)

const bothTypesPresent = pins.some(p => p.type === 'BOOTH') && pins.some(p => p.type === 'ROOM')
check('both pin types are represented in the seed', bothTypesPresent)

// Position. Stored as a percentage of the picture's width and height so a pin
// stays put on any screen. Two separate rules: the value must be a real number
// inside the picture at all, and a SEEDED pin must additionally sit far enough
// from the edge that its marker and label are not clipped.
//
// THE TWO PERCENTAGE RULES BELOW ARE A CHEAP FIRST FILTER, NOT THE AUTHORITY.
// Raised by adversarial review round 2, and the objection is correct: a
// percentage does not correspond to the size of a marker. On a 390-pixel phone
// the picture is about 366 pixels wide, so the 2% margin is roughly 7 pixels
// while a marker's half-width is 22, and the 4-point separation is about 15
// pixels against a 44-pixel target. Data could satisfy both and still show a
// clipped or stacked marker.
//
// What actually settles it is measured in real pixels by the Phase 8 browser
// check, at the smallest screen the app supports: every marker wholly inside
// the picture, and no two marker centres closer than one tap target. These
// rules are kept because they fail fast, without a browser or a running app,
// and they catch grossly wrong data before anything is built.
const badRange = pins.filter(
  p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100,
)
check(
  'every pin’s x and y are finite numbers between 0 and 100',
  badRange.length === 0,
  badRange.map(p => `${p.label ?? p.id}(${p.x},${p.y})`).join(', '),
)

const nearEdge = pins.filter(p => p.x < 2 || p.x > 98 || p.y < 2 || p.y > 98)
check(
  'no seeded pin sits within 2% of an edge, where its marker would be clipped',
  nearEdge.length === 0,
  nearEdge.map(p => `${p.label ?? p.id}(${p.x},${p.y})`).join(', '),
)

// Two markers on the same spot look like one marker, and the one underneath can
// never be tapped. Compared per map, since the same coordinates on two
// different pictures are two different places.
const tooClose = []
for (const m of maps) {
  const onMap = pins.filter(p => p.venueMapId === m.id)
  for (let i = 0; i < onMap.length; i++) {
    for (let j = i + 1; j < onMap.length; j++) {
      const a = onMap[i]
      const b = onMap[j]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (distance < 4) {
        tooClose.push(`${m.name}: ${a.label ?? a.id} and ${b.label ?? b.id} are ${distance.toFixed(1)} apart`)
      }
    }
  }
}
check(
  'no two pins on the same map are closer than 4 percentage points',
  tooClose.length === 0,
  tooClose.join(' | '),
)

// ─── 5. Room pins ─────────────────────────────────────────────────────────────

section('Room pins')

const roomPins = pins.filter(p => p.type === 'ROOM')

check(
  'every room pin has a non-blank label',
  roomPins.every(p => typeof p.label === 'string' && p.label.trim().length > 0),
  roomPins.filter(p => !p.label || !p.label.trim()).map(p => p.id).join(', '),
)
check(
  'no room pin carries a sponsor link',
  roomPins.every(p => p.sponsorId === null),
  roomPins.filter(p => p.sponsorId !== null).map(p => p.label).join(', '),
)

// Consistency with data that already exists, rather than with strings typed
// into a seed file. A room pin naming a place no other part of the product
// knows about would render perfectly and still be wrong.

const meetingTableNames = MEETING_ROOMS.map(r => r.name)
const roomLabels = roomPins.map(p => p.label)
const meetingTablePins = roomLabels.filter(l => meetingTableNames.includes(l))
check(
  `every one of the ${meetingTableNames.length} real meeting tables has a room pin`,
  meetingTableNames.every(n => roomLabels.includes(n)),
  `missing: ${meetingTableNames.filter(n => !roomLabels.includes(n)).join(', ')}`,
)
check(
  'the meeting-table pins are all on one map',
  new Set(roomPins.filter(p => meetingTableNames.includes(p.label)).map(p => p.venueMapId)).size === 1,
  `${meetingTablePins.length} pins`,
)

const agendaRooms = db
  .prepare(`select distinct room from ConfSession where room is not null and trim(room) <> ''`)
  .all()
  .map(r => r.room)
const sessionRoomPins = roomPins.filter(p => agendaRooms.includes(p.label))
check(
  `at least four room pins name a room the agenda actually uses (found ${sessionRoomPins.length})`,
  sessionRoomPins.length >= 4,
  `agenda rooms: ${agendaRooms.join(', ')}`,
)

// Every room pin must be one or the other, with no exception. A label matching
// neither is either a typo or a place invented for the map, and a delegate who
// walks to it finds nothing. An earlier draft of this file allowed an escape
// prefix for "venue features" like a registration desk; that was removed
// because it is exactly the kind of rule that passes whatever is put in front
// of it.
const unknownRooms = roomPins.filter(
  p => !meetingTableNames.includes(p.label) && !agendaRooms.includes(p.label),
)
check(
  'every room pin names either a real meeting table or a real agenda room',
  unknownRooms.length === 0,
  unknownRooms.map(p => p.label).join(', '),
)

// ─── 6. Booth pins ────────────────────────────────────────────────────────────
//
// Enumerated, not sampled. The expected count is derived from the database
// rather than written down here, so adding a booth number to a company makes
// this fail until the map gains its pin.

section('Booth pins')

const boothPins = pins.filter(p => p.type === 'BOOTH')
const sponsorsWithBooths = db
  .prepare(
    `select id, name, boothNumber, conferenceId from Sponsor
      where boothNumber is not null and trim(boothNumber) <> '' order by boothNumber`,
  )
  .all()

check(
  `there is one booth pin for each of the ${sponsorsWithBooths.length} companies carrying a booth number`,
  boothPins.length === sponsorsWithBooths.length,
  `${boothPins.length} pins vs ${sponsorsWithBooths.length} companies`,
)

check(
  'every company with a booth number has a pin',
  sponsorsWithBooths.every(s => boothPins.some(p => p.sponsorId === s.id)),
  sponsorsWithBooths.filter(s => !boothPins.some(p => p.sponsorId === s.id)).map(s => s.name).join(', '),
)

check(
  'every booth pin carries a sponsor link',
  boothPins.every(p => p.sponsorId !== null),
  boothPins.filter(p => p.sponsorId === null).map(p => p.id).join(', '),
)

const sponsorIds = new Set(sponsorsWithBooths.map(s => s.id))
check(
  'every booth pin’s sponsor exists and carries a booth number',
  boothPins.every(p => sponsorIds.has(p.sponsorId)),
  boothPins.filter(p => !sponsorIds.has(p.sponsorId)).map(p => p.sponsorId).join(', '),
)

check(
  'every booth pin’s sponsor belongs to the same conference as its map',
  boothPins.every(p => {
    const map = maps.find(m => m.id === p.venueMapId)
    const sponsor = sponsorsWithBooths.find(s => s.id === p.sponsorId)
    return map && sponsor && map.conferenceId === sponsor.conferenceId
  }),
)

check(
  'no two booth pins point at the same company',
  new Set(boothPins.map(p => p.sponsorId)).size === boothPins.length,
  `${new Set(boothPins.map(p => p.sponsorId)).size} companies across ${boothPins.length} pins`,
)

check(
  'the booth pins are all on one map',
  new Set(boothPins.map(p => p.venueMapId)).size === 1,
  `${new Set(boothPins.map(p => p.venueMapId)).size} maps`,
)

// ─── 7. Dates are stored the way the rest of this database stores them ────────
//
// Measured 2026-08-01: every existing table holds DateTime as INTEGER
// milliseconds. But the DDL default on both new tables is CURRENT_TIMESTAMP,
// which writes TEXT. An insert that leaves createdAt out therefore stores a
// value the apps cannot read back, and nothing else in this file would notice —
// the row is present, the pin is placed, every check above passes.

section('Stored dates match the rest of the database')

const dateTypes = db
  .prepare(
    `select 'VenueMap' as t, typeof(createdAt) as kind from VenueMap
      union all
     select 'Pin' as t, typeof(createdAt) as kind from Pin`,
  )
  .all()

const wrongType = dateTypes.filter(r => r.kind !== 'integer')
check(
  `every createdAt on the ${dateTypes.length} new rows is an integer, not the text the column default would write`,
  wrongType.length === 0,
  [...new Set(wrongType.map(r => `${r.t}:${r.kind}`))].join(', '),
)

db.close()

// ─── Result ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60))
console.log(`  Results: ${passes} passed, ${failures} failed`)
console.log('─'.repeat(60))
console.log(
  '\n  A pass here is evidence about the assertions listed above and nothing\n' +
  '  wider. It says nothing about whether a delegate can see a map, switch\n' +
  '  between maps, or tap a marker — that is what the Phase 8 Playwright\n' +
  '  script covers, through a real browser.\n',
)

process.exit(failures === 0 ? 0 : 1)
