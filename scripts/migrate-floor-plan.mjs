#!/usr/bin/env node
// Adds the floor-plan tables — VenueMap and Pin — to a runtime database.
// Idempotent: every statement carries IF NOT EXISTS, so a re-run is a no-op.
//
// Usage: node scripts/migrate-floor-plan.mjs [--local <path/to/dev.db>]
//   Default: migrate Turso using TURSO_DATABASE_URL/TURSO_AUTH_TOKEN from env
//   or apps/web/.env.local. With --local, migrate a local sqlite file instead.
//
//   pnpm db:migrate-floor-plan                       (deployed database)
//   node scripts/migrate-floor-plan.mjs --local packages/db/prisma/dev.db
//
// ── Why this script exists at all, when `prisma db push` is the local route ───
//
// Two reasons, and the second one was measured during this phase rather than
// assumed.
//
// 1. The long-standing reason, same as scripts/migrate-sponsor-tables.mjs:
//    `prisma db push` cannot target a libsql:// URL, so every schema change has
//    to be replayed on the deployed database by hand. This repo has no Prisma
//    migration history and creating one is out of scope.
//
// 2. `prisma db push` currently REFUSES to run against the local database, and
//    the reason has nothing to do with the floor plan. The schema file declares
//    a plain `@@unique([conferenceId, tableNumber])` on Sponsor, while the
//    database holds that index as a PARTIAL one — `WHERE "tableNumber" IS NOT
//    NULL` — because scripts/migrate-sponsor-tables.mjs deliberately created it
//    that way. Prisma sees a shape it did not write, warns about possible data
//    loss and demands --accept-data-loss. Forcing that flag would rewrite an
//    earlier phase's index as a silent side effect of this one, so it is not
//    used here. Measured 2026-08-01: 0 of 20 companies carry a table number and
//    there are no duplicate pairs, so nothing is at risk either way — the
//    objection is to changing another phase's work invisibly, not to the risk.
//
// The statements below are Prisma's own, taken verbatim from
//   prisma migrate diff --from-url file:./prisma/dev.db \
//     --to-schema-datamodel ./prisma/schema.prisma --script
// with IF NOT EXISTS added and the Sponsor index line deliberately left out.
// Keeping them identical to what Prisma generates is what lets a future
// `prisma db push` see these tables as already correct.

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

const STATEMENTS = [
  [
    'VenueMap table',
    `CREATE TABLE IF NOT EXISTS "VenueMap" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "conferenceId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "imageUrl" TEXT NOT NULL,
        "position" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "VenueMap_conferenceId_fkey" FOREIGN KEY ("conferenceId")
          REFERENCES "Conference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
     )`,
  ],
  [
    'Pin table',
    `CREATE TABLE IF NOT EXISTS "Pin" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "venueMapId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "label" TEXT,
        "x" REAL NOT NULL,
        "y" REAL NOT NULL,
        "sponsorId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Pin_venueMapId_fkey" FOREIGN KEY ("venueMapId")
          REFERENCES "VenueMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "Pin_sponsorId_fkey" FOREIGN KEY ("sponsorId")
          REFERENCES "Sponsor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
     )`,
  ],
  [
    'VenueMap conference index',
    `CREATE INDEX IF NOT EXISTS "VenueMap_conferenceId_idx" ON "VenueMap"("conferenceId")`,
  ],
  [
    'VenueMap switch-order uniqueness',
    `CREATE UNIQUE INDEX IF NOT EXISTS "VenueMap_conferenceId_position_key"
       ON "VenueMap"("conferenceId", "position")`,
  ],
  [
    'Pin map index',
    `CREATE INDEX IF NOT EXISTS "Pin_venueMapId_idx" ON "Pin"("venueMapId")`,
  ],
  [
    'Pin sponsor index',
    `CREATE INDEX IF NOT EXISTS "Pin_sponsorId_idx" ON "Pin"("sponsorId")`,
  ],
]

function tursoCredsFromEnvLocal() {
  const envPath = join(ROOT, 'apps/web/.env.local')
  const text = readFileSync(envPath, 'utf8')
  const get = (key) => {
    const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
  }
  return { url: get('TURSO_DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') }
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

  console.log(`Applying the floor-plan tables to ${target.replace(/\/\/.*@/, '//***@')}`)

  for (const [label, sql] of STATEMENTS) {
    await client.execute(sql)
    console.log(`✓ ${label}`)
  }

  // ── Verify the SHAPE, not just the names ──────────────────────────────────
  //
  // Raised by adversarial review round 1. Every statement above is written with
  // IF NOT EXISTS, which means a table or index that ALREADY EXISTS IN THE
  // WRONG SHAPE is left exactly as it was and the statement still succeeds. An
  // earlier version of this section then checked only that the column names and
  // the index names were present — so a VenueMap created by some earlier manual
  // attempt, with the right columns but no foreign key or the wrong delete
  // behaviour, would have been reported as a clean migration.
  //
  // That is the same defect class this project has recorded repeatedly: a check
  // that also passes in a state it was never meant to pass in. So the delete
  // behaviour, the referenced tables, the index columns and the uniqueness are
  // all read back and compared.

  let bad = 0

  const expectedColumns = {
    VenueMap: ['id', 'conferenceId', 'name', 'imageUrl', 'position', 'createdAt'],
    Pin: ['id', 'venueMapId', 'type', 'label', 'x', 'y', 'sponsorId', 'createdAt'],
  }
  for (const [table, columns] of Object.entries(expectedColumns)) {
    const info = await client.execute(`PRAGMA table_info("${table}")`)
    const present = info.rows.map((r) => r.name)
    const missing = columns.filter((c) => !present.includes(c))
    if (present.length === 0) {
      console.error(`✗ ${table} does not exist after migration`)
      bad++
    } else if (missing.length > 0) {
      console.error(`✗ ${table} is missing: ${missing.join(', ')}`)
      bad++
    } else {
      console.log(`✓ ${table} columns verified (${present.length})`)
    }
  }

  // Foreign keys, including what happens on delete. Getting these wrong is not
  // cosmetic: CASCADE versus SET NULL is the difference between deleting a
  // company removing an organizer's placed marker and leaving it in place.
  const expectedForeignKeys = {
    VenueMap: [{ from: 'conferenceId', table: 'Conference', to: 'id', on_delete: 'CASCADE' }],
    Pin: [
      { from: 'venueMapId', table: 'VenueMap', to: 'id', on_delete: 'CASCADE' },
      { from: 'sponsorId', table: 'Sponsor', to: 'id', on_delete: 'SET NULL' },
    ],
  }
  for (const [table, wantedKeys] of Object.entries(expectedForeignKeys)) {
    const info = await client.execute(`PRAGMA foreign_key_list("${table}")`)
    const actual = info.rows.map((r) => ({
      from: String(r.from),
      table: String(r.table),
      to: String(r.to),
      on_delete: String(r.on_delete).toUpperCase(),
    }))
    for (const wanted of wantedKeys) {
      const match = actual.find((a) => a.from === wanted.from)
      if (!match) {
        console.error(`✗ ${table}.${wanted.from} has no foreign key`)
        bad++
      } else if (
        match.table !== wanted.table ||
        match.to !== wanted.to ||
        match.on_delete !== wanted.on_delete
      ) {
        console.error(
          `✗ ${table}.${wanted.from} points at ${match.table}(${match.to}) ON DELETE ${match.on_delete}; ` +
          `expected ${wanted.table}(${wanted.to}) ON DELETE ${wanted.on_delete}`,
        )
        bad++
      } else {
        console.log(`✓ ${table}.${wanted.from} → ${wanted.table}(${wanted.to}) ON DELETE ${wanted.on_delete}`)
      }
    }
  }

  // Indexes, by the columns they actually cover and whether they are unique —
  // not by name. An index with the right name on the wrong column is worse than
  // a missing one, because it looks present.
  const expectedIndexes = [
    { table: 'VenueMap', name: 'VenueMap_conferenceId_idx', columns: ['conferenceId'], unique: false },
    { table: 'VenueMap', name: 'VenueMap_conferenceId_position_key', columns: ['conferenceId', 'position'], unique: true },
    { table: 'Pin', name: 'Pin_venueMapId_idx', columns: ['venueMapId'], unique: false },
    { table: 'Pin', name: 'Pin_sponsorId_idx', columns: ['sponsorId'], unique: false },
  ]
  for (const wanted of expectedIndexes) {
    const list = await client.execute(`PRAGMA index_list("${wanted.table}")`)
    const entry = list.rows.find((r) => String(r.name) === wanted.name)
    if (!entry) {
      console.error(`✗ index ${wanted.name} missing`)
      bad++
      continue
    }
    const isUnique = Number(entry.unique) === 1
    const isPartial = Number(entry.partial ?? 0) === 1
    const info = await client.execute(`PRAGMA index_info("${wanted.name}")`)
    const columns = info.rows.map((r) => String(r.name))

    if (JSON.stringify(columns) !== JSON.stringify(wanted.columns)) {
      console.error(`✗ index ${wanted.name} covers ${columns.join(', ')}; expected ${wanted.columns.join(', ')}`)
      bad++
    } else if (isUnique !== wanted.unique) {
      console.error(`✗ index ${wanted.name} is ${isUnique ? 'unique' : 'not unique'}; expected the opposite`)
      bad++
    } else if (isPartial) {
      // A partial index would silently stop enforcing the switch-order rule for
      // some rows. This is exactly the shape the Sponsor table's index has, and
      // the reason prisma db push refuses to run here.
      console.error(`✗ index ${wanted.name} is partial; Prisma expects a full index`)
      bad++
    } else {
      console.log(`✓ index ${wanted.name} on (${columns.join(', ')})${isUnique ? ' unique' : ''}`)
    }
  }

  client.close?.()
  if (bad > 0) process.exit(1)
  console.log('\nFloor-plan schema is present.')
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
