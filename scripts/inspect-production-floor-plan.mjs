#!/usr/bin/env node
// Read-only look at the deployed database, before anything is written to it.
//
//   node scripts/inspect-production-floor-plan.mjs [path-to-env-file]
//
// Default env file: apps/web/.env.production.local
//
// ── Why this exists rather than just running the migration ───────────────────
//
// The migration script is idempotent and safe, and that is still not a reason to
// point it at a production database without looking first. This prints what is
// there so a person can compare it against what they expect, and it writes
// nothing at all — no CREATE, no INSERT, no PRAGMA that changes anything.
//
// It also confirms the two tables the new ones reference — Conference and Sponsor
// — actually exist. A foreign key to a missing table is a failure that surfaces
// later and reads as something else entirely.
//
// No secret is ever printed. The database host is shown so the reader can confirm
// which database this is; the token is never included in any output.

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Resolved from packages/db, exactly as scripts/migrate-floor-plan.mjs does.
// @libsql/client is a dependency of that package, not of the repository root, so
// resolving from this file's own location fails.
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')
const ENV_FILE = process.argv[2] ?? join(ROOT, 'apps/web/.env.production.local')

function readEnv(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    console.error(`Could not read ${path}`)
    process.exit(2)
  }
  const out = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const env = readEnv(ENV_FILE)
const url = env.TURSO_DATABASE_URL
const authToken = env.TURSO_AUTH_TOKEN

if (!url || !authToken) {
  console.error(`No TURSO_DATABASE_URL / TURSO_AUTH_TOKEN in ${ENV_FILE}`)
  console.error(`Keys present: ${Object.keys(env).join(', ')}`)
  process.exit(2)
}

let host = '(unparseable)'
try {
  host = new URL(url.replace(/^libsql:/, 'https:')).host
} catch {}

console.log('\n════════════════════════════════════════════════════════════')
console.log('  The deployed database, read-only')
console.log('════════════════════════════════════════════════════════════')
console.log(`\n  host: ${host}`)
console.log(`  credentials from: ${ENV_FILE.replace(ROOT + '/', '')}\n`)

const client = createClient({ url, authToken })

const NEEDED_BY_FLOOR_PLAN = ['Conference', 'Sponsor']
const FLOOR_PLAN_TABLES = ['VenueMap', 'Pin']

try {
  const tables = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  )
  const names = tables.rows.map(r => String(r.name))

  console.log(`  ${names.length} tables present:`)
  console.log(`    ${names.join(', ')}\n`)

  console.log('  ── the two tables the floor plan needs ──')
  for (const t of FLOOR_PLAN_TABLES) {
    if (!names.includes(t)) {
      console.log(`    ${t.padEnd(10)} MISSING`)
      continue
    }
    const c = await client.execute(`SELECT COUNT(*) AS n FROM "${t}"`)
    console.log(`    ${t.padEnd(10)} present, ${c.rows[0].n} row(s)`)
  }

  console.log('\n  ── the tables those two point at, which must already exist ──')
  for (const t of NEEDED_BY_FLOOR_PLAN) {
    if (!names.includes(t)) {
      console.log(`    ${t.padEnd(10)} MISSING — the migration would create a broken link`)
      continue
    }
    const c = await client.execute(`SELECT COUNT(*) AS n FROM "${t}"`)
    console.log(`    ${t.padEnd(10)} present, ${c.rows[0].n} row(s)`)
  }

  if (names.includes('Conference')) {
    const active = await client.execute(`SELECT id, name FROM "Conference" WHERE active = 1`)
    console.log('\n  ── what the seed will attach to ──')
    if (active.rows.length === 0) {
      console.log('    NO ACTIVE CONFERENCE — the seed has nothing to attach maps to')
    } else {
      for (const r of active.rows) console.log(`    active conference: ${r.name}  (${r.id})`)
      if (active.rows.length > 1) console.log('    more than one active conference, which the seed does not expect')
    }
  }
  if (names.includes('Sponsor')) {
    const booths = await client.execute(
      `SELECT COUNT(*) AS n FROM "Sponsor" WHERE boothNumber IS NOT NULL AND boothNumber != ''`,
    )
    const total = await client.execute(`SELECT COUNT(*) AS n FROM "Sponsor"`)
    console.log(`    companies: ${total.rows[0].n}, of which ${booths.rows[0].n} carry a booth number`)
    console.log('    (the exhibit-hall map places one booth marker per company with a booth number)')
  }

  console.log('\n  Nothing was written. This run only read.\n')
} catch (err) {
  console.error(`\n  Could not read the database: ${String(err?.message ?? err).split('\n')[0]}\n`)
  process.exit(1)
}
