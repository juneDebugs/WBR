#!/usr/bin/env node
// Creates the partial unique indexes that enforce the EXCLUSIVE time-slot
// invariant at the database — the durable backstop for the application guards
// (assertBlockOpen + the pairExisting checks), closing the sub-millisecond
// TOCTOU window where two truly-simultaneous writes both pass a read-then-write
// check. Names mirror EXCLUSIVE_SLOT_INDEXES in packages/db/src/meeting-engine.ts.
//
//   (sponsorId, timeBlockId) WHERE status='CONFIRMED'  — one meeting per sponsor per block
//   (userId,    timeBlockId) WHERE status='CONFIRMED'  — attendee not double-booked across sponsors
//   (sponsorId, userId)      WHERE status='CONFIRMED'  — one confirmed meeting per pair
//
// The repo has no Prisma migration history and Prisma's schema DSL can't express
// SQLite partial indexes, so this is a hand replay like the other migrate-*.mjs
// DDL scripts. Idempotent (CREATE ... IF NOT EXISTS).
//
// IMPORTANT: a unique index fails to create while duplicate CONFIRMED rows still
// exist, so this script REFUSES to run until the data is clean. Run the repair
// first:  node scripts/migrate-exclusive-slots.mjs --apply
//
// Usage: node scripts/migrate-exclusive-slot-indexes.mjs [--local <path/to/dev.db>]

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

// (index name, column list, human label) — WHERE status='CONFIRMED' on each.
const INDEXES = [
  ['SponsorMeeting_sponsor_block_confirmed_uq', ['sponsorId', 'timeBlockId'], 'one meeting per sponsor per block'],
  ['SponsorMeeting_user_block_confirmed_uq', ['userId', 'timeBlockId'], 'attendee not double-booked across sponsors'],
  ['SponsorMeeting_sponsor_user_confirmed_uq', ['sponsorId', 'userId'], 'one confirmed meeting per pair'],
]

function tursoCredsFromEnvLocal() {
  const text = readFileSync(join(ROOT, 'apps/web/.env.local'), 'utf8')
  const get = (key) => {
    const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
  }
  return { url: get('TURSO_DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') }
}

async function main() {
  const localIdx = process.argv.indexOf('--local')
  let client, target
  if (localIdx !== -1) {
    const path = process.argv[localIdx + 1]
    if (!path) { console.error('--local requires a path to a sqlite file'); process.exit(2) }
    target = `file:${path}`
    client = createClient({ url: target })
  } else {
    let url = process.env.TURSO_DATABASE_URL
    let authToken = process.env.TURSO_AUTH_TOKEN
    if (!url || !authToken) ({ url, authToken } = tursoCredsFromEnvLocal())
    if (!url || !authToken) { console.error('No TURSO_DATABASE_URL/TURSO_AUTH_TOKEN in env or apps/web/.env.local'); process.exit(2) }
    target = url
    client = createClient({ url, authToken })
  }
  console.log(`Applying exclusive-slot indexes to ${target.replace(/\/\/.*@/, '//***@')}`)

  // Precheck: a unique index fails to create over existing duplicates, and the
  // resulting SQLite error is opaque. Detect violations first and abort with a
  // clear pointer to the repair script instead.
  let blocked = false
  for (const [name, cols, label] of INDEXES) {
    const groupBy = cols.join(', ')
    const res = await client.execute(
      `SELECT ${groupBy}, COUNT(*) AS c FROM "SponsorMeeting" WHERE status = 'CONFIRMED' GROUP BY ${groupBy} HAVING c > 1`,
    )
    if (res.rows.length) {
      blocked = true
      console.error(`  ✗ ${res.rows.length} duplicate group(s) violate "${label}" (${groupBy}) — cannot create ${name}`)
    } else {
      console.log(`  ✓ no duplicates for "${label}" (${groupBy})`)
    }
  }
  if (blocked) {
    console.error('\nRefusing to create indexes over duplicate CONFIRMED rows.')
    console.error('Run the data repair first:  node scripts/migrate-exclusive-slots.mjs --apply')
    process.exit(1)
  }

  for (const [name, cols] of INDEXES) {
    const colList = cols.map(c => `"${c}"`).join(', ')
    await client.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${name}" ON "SponsorMeeting" (${colList}) WHERE status = 'CONFIRMED'`,
    )
    console.log(`  ✓ created ${name}`)
  }

  const check = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'SponsorMeeting_%_confirmed_uq' ORDER BY name`,
  )
  const got = check.rows.map(r => r.name)
  const missing = INDEXES.map(i => i[0]).filter(n => !got.includes(n))
  if (missing.length) { console.error(`\n✗ missing after apply: ${missing.join(', ')}`); process.exit(1) }
  console.log(`\n✅ all ${INDEXES.length} exclusive-slot indexes present`)
}

main().catch(e => { console.error(e); process.exit(1) })
