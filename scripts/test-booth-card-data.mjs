#!/usr/bin/env node
// Checks for the data behind the booth company card — Phase 9.
//
//   node scripts/test-booth-card-data.mjs
//   pnpm test:booth-card
//
// Exits non-zero on any failure.
//
// ── Why this file exists, separately from test-floor-plan.mjs ────────────────
//
// Phase 8's file covers the seeded venue: the two tables, the three maps, the
// 25 markers and their positions. Its 57 assertions are a regression baseline
// and this file deliberately does not touch them, so that a failure after
// Phase 9 is attributable to Phase 9.
//
// What this file covers is the thing finding F-10 established that nothing
// covered: whether the values the card puts on screen exist, and whether a
// database rebuilt from packages/db/prisma/seed.ts would produce the same ones.
//
// ── The failure this exists to prevent, stated concretely ────────────────────
//
// Measured 2026-08-02, before any Phase 9 code was written:
//
//   * seed.ts upserts each exhibiting company with `update: { name, tier,
//     logoUrl }`. Tagline, website and booth number are written only when the
//     row is created, so on any database that already holds these rows the
//     seed cannot correct them and has not.
//   * `solutionsOffering` was never written to a Sponsor row by any script. All
//     20 companies carry offerings in the working database and those strings
//     appeared in no committed file.
//   * The seed carried eight booth numbers in `P1` form; the database holds ten
//     in `P-01` form, and a different set of companies.
//
// The last one is not merely a smaller map. scripts/build-floor-plan-maps.mjs
// and scripts/seed-floor-plan.mjs both read the booth roster from the database
// and share layoutBooths() from scripts/floor-plan-demo-venue.mjs, which groups
// companies into rows of at most three by the first character of the booth
// number and spreads the rows evenly down the hall. Every stand's height
// therefore depends on the TOTAL NUMBER OF ROWS. Ten companies give four rows
// at 28.5 / 45.5 / 62.5 / 79.5 percent; the old seed's eight gave three rows at
// 31.3 / 54.0 / 76.7. apps/attendee/public/maps/exhibit-hall.png is committed
// and was drawn from the four-row layout, so a rebuilt database would place
// every marker off every drawn stand — and Phase 8's suite would not say so,
// because every assertion in it compares a marker to the position stored for
// that marker rather than to the picture.
//
// Section 3 below is the check for exactly that, and it is the reason this file
// imports layoutBooths rather than re-deriving the arithmetic: a copy of the
// layout rule could drift from the real one and the check would still pass.

import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = join(ROOT, 'packages/db/prisma/dev.db')
const ATTENDEE_PUBLIC = join(ROOT, 'apps/attendee/public')

const { layoutBooths } = await import(join(ROOT, 'scripts/floor-plan-demo-venue.mjs'))

// The seed's exhibiting-company definitions, imported rather than re-typed or
// parsed out of the source. Re-typing them here would mean this file checks a
// copy against the database while the seed writes something else — the exact
// class of check this project has recorded passing while measuring nothing.
//
// packages/db/prisma/seed.ts calls main() at module scope, so importing that
// file would run the whole seed. The definitions therefore live in their own
// module, which the seed imports.
let seedModule = null
let seedImportError = null
try {
  seedModule = await import(join(ROOT, 'packages/db/prisma/seed-sponsors.ts'))
} catch (e) {
  seedImportError = e
}

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

// ─── The roster the card is built for, read from the database ────────────────
//
// Derived, never remembered. A hard-coded ten would keep passing after someone
// removed a company, which is the failure this whole file is about.

const boothRows = db
  .prepare(
    `select s.id, s.name, s.tagline, s.website, s.logoUrl, s.boothNumber,
            s.solutionsOffering, p.x, p.y
       from Pin p
       join Sponsor s on s.id = p.sponsorId
      where p.type = 'BOOTH'
      order by s.boothNumber asc`,
  )
  .all()

// ─── 1. Every card has something to show ─────────────────────────────────────
//
// Enumerated per company rather than sampled or counted. A count of ten
// non-empty taglines is satisfied by ten copies of one company's tagline.

section('Every exhibiting company with a booth marker has complete card data')

check(
  'at least one booth marker exists to build a card for',
  boothRows.length > 0,
  `found ${boothRows.length}`,
)

for (const r of boothRows) {
  const who = r.boothNumber ?? r.id

  check(`${who} — has a company name`, typeof r.name === 'string' && r.name.trim().length > 0)

  check(
    `${who} — has a tagline`,
    typeof r.tagline === 'string' && r.tagline.trim().length > 0,
    'the card renders a tagline line and would show an empty one',
  )

  check(
    `${who} — has a booth number`,
    typeof r.boothNumber === 'string' && r.boothNumber.trim().length > 0,
  )

  check(
    `${who} — website is an http(s) address`,
    typeof r.website === 'string' && /^https?:\/\/\S+$/.test(r.website.trim()),
    `stored: ${JSON.stringify(r.website)}`,
  )

  // The card shows the logo from the PARTICIPANT app's public folder. The same
  // path also exists under the other three apps, so checking "a file with this
  // name exists somewhere" would pass while the participant app served a 404.
  const logoOk =
    typeof r.logoUrl === 'string' &&
    r.logoUrl.startsWith('/') &&
    existsSync(join(ATTENDEE_PUBLIC, r.logoUrl.replace(/^\//, '')))
  check(
    `${who} — logo file exists under the participant app`,
    logoOk,
    `apps/attendee/public${r.logoUrl}`,
  )

  // Stored as a JSON-encoded array string. Finding F-7 in this same document
  // records a malformed array of exactly this kind blanking a whole screen, so
  // the shape is asserted rather than assumed.
  let offerings = null
  let parseError = null
  try {
    offerings = JSON.parse(r.solutionsOffering ?? 'null')
  } catch (e) {
    parseError = e
  }
  check(
    `${who} — offerings parse to an array`,
    parseError === null && Array.isArray(offerings),
    parseError ? `JSON.parse threw: ${parseError.message}` : `parsed to ${typeof offerings}`,
  )
  check(
    `${who} — offerings list is not empty`,
    Array.isArray(offerings) && offerings.length > 0,
    'the card renders an offerings section and would show an empty one',
  )
  check(
    `${who} — every offering is a non-empty string`,
    Array.isArray(offerings) &&
      offerings.length > 0 &&
      offerings.every(o => typeof o === 'string' && o.trim().length > 0),
  )
}

// ─── 2. A database rebuilt from the seed produces the same cards ─────────────
//
// This is finding F-10's check. It compares the seed's own exported
// definitions against the database, field by field, for every company that
// carries a booth number on either side.

section('The seed reproduces the exhibiting companies the card shows')

check(
  'packages/db/prisma/seed-sponsors.ts imports without running the seed',
  seedModule !== null,
  seedImportError ? seedImportError.message : '',
)

const defs = seedModule?.SPONSOR_DEFS ?? null

check(
  'it exports SPONSOR_DEFS as an array',
  Array.isArray(defs),
  defs === null ? 'absent — the module did not import or does not export it' : `got ${typeof defs}`,
)

// ── Why the guards below count a failure per skipped group ──────────────────
//
// Without this, every assertion in sections 2, 3 and 4 simply does not run when
// the seed module is missing, and the file prints a section heading with
// nothing under it. A block of assertions that VANISHES rather than fails is a
// recorded defect in this project — it reads as "nothing wrong here" at exactly
// the moment the most is wrong. Each group therefore declares how many checks
// it did not get to run, and that is itself a failure.
function skipGroup(label, count) {
  failures++
  console.error(
    `  ✗ ${label} — NOT RUN (${count} assertions skipped) because SPONSOR_DEFS is unavailable`,
  )
}

if (Array.isArray(defs)) {
  const seedBooths = defs.filter(d => typeof d.boothNumber === 'string' && d.boothNumber.trim())
  const seedByBooth = new Map(seedBooths.map(d => [d.boothNumber.trim(), d]))
  const dbByBooth = new Map(boothRows.map(r => [String(r.boothNumber).trim(), r]))

  check(
    'the seed carries the same number of exhibiting companies as the database',
    seedBooths.length === boothRows.length,
    `seed ${seedBooths.length}, database ${boothRows.length}`,
  )

  const missingFromSeed = [...dbByBooth.keys()].filter(b => !seedByBooth.has(b))
  const extraInSeed = [...seedByBooth.keys()].filter(b => !dbByBooth.has(b))

  check(
    'every booth number in the database is in the seed',
    missingFromSeed.length === 0,
    missingFromSeed.join(', '),
  )
  check(
    'the seed adds no booth number the database does not have',
    extraInSeed.length === 0,
    extraInSeed.join(', '),
  )

  // Field by field, per company. A set comparison on booth numbers alone would
  // pass while every tagline differed.
  for (const [booth, row] of dbByBooth) {
    const d = seedByBooth.get(booth)
    // A booth number present in the database and absent from the seed is
    // exactly the drift this file exists to catch. Skipping it here would let
    // five per-company assertions disappear at the moment they matter most —
    // the roster checks above would fail, but the field comparisons would
    // silently not run and the total would understate the damage.
    if (!d) {
      skipGroup(`${booth} — field comparison`, 5)
      continue
    }

    check(`${booth} — seed and database agree on the company name`, d.name === row.name,
      `seed ${JSON.stringify(d.name)}, database ${JSON.stringify(row.name)}`)

    check(`${booth} — seed and database agree on the tagline`, d.tagline === row.tagline,
      `seed ${JSON.stringify(d.tagline)}, database ${JSON.stringify(row.tagline)}`)

    check(`${booth} — seed and database agree on the website`, d.website === row.website,
      `seed ${JSON.stringify(d.website)}, database ${JSON.stringify(row.website)}`)

    check(`${booth} — seed and database agree on the logo path`, d.logoUrl === row.logoUrl,
      `seed ${JSON.stringify(d.logoUrl)}, database ${JSON.stringify(row.logoUrl)}`)

    // Compared as parsed arrays, not as strings. Two identical lists written
    // with different spacing are the same data, and a string comparison would
    // report a difference that does not exist.
    let seedOfferings = null
    let dbOfferings = null
    try { seedOfferings = JSON.parse(d.solutionsOffering ?? 'null') } catch {}
    try { dbOfferings = JSON.parse(row.solutionsOffering ?? 'null') } catch {}
    check(
      `${booth} — seed and database agree on the offerings`,
      Array.isArray(seedOfferings) &&
        Array.isArray(dbOfferings) &&
        seedOfferings.length === dbOfferings.length &&
        seedOfferings.every((o, i) => o === dbOfferings[i]),
      `seed ${JSON.stringify(seedOfferings)}, database ${JSON.stringify(dbOfferings)}`,
    )
  }
} else {
  // 3 roster checks + 5 field checks per company.
  skipGroup('seed-versus-database comparison', 3 + boothRows.length * 5)
}

// ─── 3. What the seed writes on create, and what it deliberately does not
//        write on update ───────────────────────────────────────────────────────
//
// Two opposite requirements, and both are asserted because satisfying either one
// alone produces a real failure.
//
//   CREATE must carry everything. That is what makes a database built from
//   nothing reproduce the same ten cards and the same hall layout, which is the
//   whole of finding F-10.
//
//   UPDATE must carry almost nothing. Raised by Phase 9's adversarial review as
//   a high finding, and it is a correction to F-10's first fix. ./seed.ts can
//   connect to the SHARED production database — createPrismaClient() prefers
//   TURSO_DATABASE_URL over DATABASE_URL — so an update branch carrying taglines
//   and descriptions lets one stray `pnpm db:seed` replace an organizer's edits
//   with the generated copy. Section 2 above is what catches drift now, and
//   scripts/migrate-sponsor-card-fields.mjs is what corrects it on purpose.
//
// Both are asserted from the functions the seed actually calls, not from reading
// its source text, which would only be a check on formatting.

section('The seed writes everything on create and almost nothing on update')

const createFields = seedModule?.sponsorCreateFields ?? null
const updateFields = seedModule?.sponsorUpdateFields ?? null

check('the seed exports sponsorCreateFields', typeof createFields === 'function',
  `got ${typeof createFields}`)
check('the seed exports sponsorUpdateFields', typeof updateFields === 'function',
  `got ${typeof updateFields}`)

// Everything the card shows, plus the two the seed has always owned.
const CREATE_MUST_INCLUDE = [
  'name', 'tier', 'logoUrl', 'tagline', 'website', 'description', 'boothNumber', 'solutionsOffering',
]
// Content an organizer can edit in the admin app. A stray seed run must not
// touch any of it.
const UPDATE_MUST_OMIT = ['tagline', 'description', 'website', 'boothNumber', 'solutionsOffering']
const UPDATE_MUST_INCLUDE = ['name', 'tier', 'logoUrl']

if (
  typeof createFields === 'function' &&
  typeof updateFields === 'function' &&
  Array.isArray(defs) &&
  defs.length > 0
) {
  const sample = defs.find(d => d.boothNumber) ?? defs[0]

  let onCreate = null
  let onUpdate = null
  let threw = null
  try {
    onCreate = createFields(sample)
    onUpdate = updateFields(sample)
  } catch (e) {
    threw = e
  }

  check('both return an object',
    onCreate !== null && typeof onCreate === 'object' &&
      onUpdate !== null && typeof onUpdate === 'object',
    threw ? `threw: ${threw.message}` : `create ${typeof onCreate}, update ${typeof onUpdate}`)

  for (const field of CREATE_MUST_INCLUDE) {
    check(
      `create writes ${field}`,
      onCreate !== null && Object.prototype.hasOwnProperty.call(onCreate, field),
      'a field absent here is a field a rebuilt database will not have',
    )
  }

  for (const field of UPDATE_MUST_OMIT) {
    check(
      `update does NOT write ${field}`,
      onUpdate !== null && !Object.prototype.hasOwnProperty.call(onUpdate, field),
      'organizer-editable content; writing it here lets a stray seed run destroy their edits',
    )
  }

  for (const field of UPDATE_MUST_INCLUDE) {
    check(
      `update writes ${field}`,
      onUpdate !== null && Object.prototype.hasOwnProperty.call(onUpdate, field),
      'the seed has always owned this field',
    )
  }
} else {
  skipGroup(
    'create-versus-update field-set checks',
    1 + CREATE_MUST_INCLUDE.length + UPDATE_MUST_OMIT.length + UPDATE_MUST_INCLUDE.length,
  )
}

// ─── 4. The hall layout is the same from either roster ───────────────────────
//
// The check the committed picture depends on. layoutBooths is imported from the
// module the drawing and the seeding scripts both use, so this compares against
// the real rule rather than a restatement of it.

section('A rebuilt database lays the stands out where the committed picture drew them')

if (Array.isArray(defs)) {
  const seedBooths = defs
    .filter(d => typeof d.boothNumber === 'string' && d.boothNumber.trim())
    .map(d => ({ id: d.id, name: d.name, boothNumber: d.boothNumber }))
    .sort((a, b) => a.boothNumber.localeCompare(b.boothNumber))

  const dbBooths = boothRows
    .map(r => ({ id: r.id, name: r.name, boothNumber: String(r.boothNumber) }))
    .sort((a, b) => a.boothNumber.localeCompare(b.boothNumber))

  const fromSeed = layoutBooths(seedBooths)
  const fromDb = layoutBooths(dbBooths)

  check(
    'both rosters produce the same number of stands',
    fromSeed.length === fromDb.length,
    `seed ${fromSeed.length}, database ${fromDb.length}`,
  )

  const seedRowHeights = [...new Set(fromSeed.map(s => s.y))].sort((a, b) => a - b)
  const dbRowHeights = [...new Set(fromDb.map(s => s.y))].sort((a, b) => a - b)

  check(
    'both rosters produce the same number of rows',
    seedRowHeights.length === dbRowHeights.length,
    `seed ${seedRowHeights.length} rows at ${seedRowHeights.join('/')}, ` +
      `database ${dbRowHeights.length} rows at ${dbRowHeights.join('/')}`,
  )

  check(
    'the rows sit at the same heights',
    seedRowHeights.length === dbRowHeights.length &&
      seedRowHeights.every((y, i) => y === dbRowHeights[i]),
    `seed ${seedRowHeights.join('/')}, database ${dbRowHeights.join('/')}`,
  )

  // Per stand, not only per row. Same rows with two companies swapped left to
  // right is a picture whose captions name the wrong stands.
  const byBoothSeed = new Map(fromSeed.map(s => [s.sponsor.boothNumber, s]))
  for (const stand of fromDb) {
    const other = byBoothSeed.get(stand.sponsor.boothNumber)
    check(
      `${stand.sponsor.boothNumber} — same stand position from either roster`,
      other != null && other.x === stand.x && other.y === stand.y,
      other
        ? `seed (${other.x}, ${other.y}), database (${stand.x}, ${stand.y})`
        : 'absent from the seed roster',
    )
  }

  // The stored marker positions must also match, or the seed and the drawing
  // agree with each other while both disagree with what is in the database now.
  for (const r of boothRows) {
    const stand = byBoothSeed.get(String(r.boothNumber))
    check(
      `${r.boothNumber} — the stored marker sits where the seed roster would put it`,
      stand != null && stand.x === r.x && stand.y === r.y,
      stand ? `layout (${stand.x}, ${stand.y}), stored (${r.x}, ${r.y})` : 'absent from the seed roster',
    )
  }
} else {
  // 3 layout-shape checks + 1 position check per company from each direction.
  skipGroup('hall-layout agreement checks', 3 + boothRows.length * 2)
}

// ─── Result ──────────────────────────────────────────────────────────────────

console.log(`\n  Results: ${passes} passed, ${failures} failed`)
db.close()
process.exit(failures === 0 ? 0 : 1)
