#!/usr/bin/env node
// Adds the per-sponsor meeting-table column to the runtime database (Turso).
// Idempotent.
//
// The repo has no Prisma migration history — local SQLite files get schema via
// `prisma db push`, but `prisma db push` cannot target libsql:// URLs, so schema
// changes must be replayed on Turso by hand. This script is that replay for the
// per-sponsor Meeting Tables feature: it adds Sponsor.tableNumber and the
// per-conference uniqueness index. The same column is added defensively at
// runtime by packages/db/src/meeting-engine.ts (ensureSponsorTableColumn) — this
// script just guarantees it (and the unique index) up front.
//
// Usage: node scripts/migrate-sponsor-tables.mjs [--local <path/to/dev.db>]
//   Default: migrate Turso using TURSO_DATABASE_URL/TURSO_AUTH_TOKEN from env
//   or apps/web/.env.local. With --local, migrate a local sqlite file instead.

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

// ALTER TABLE ADD COLUMN has no IF NOT EXISTS in SQLite — a re-run throws
// "duplicate column name", which we treat as success. The unique index does
// support IF NOT EXISTS. A partial index (WHERE ... IS NOT NULL) keeps the many
// unassigned sponsors (tableNumber = NULL) from colliding with each other.
const ADD_COLUMN = `ALTER TABLE "Sponsor" ADD COLUMN "tableNumber" INTEGER`
const CREATE_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS "Sponsor_conferenceId_tableNumber_key"
  ON "Sponsor" ("conferenceId", "tableNumber") WHERE "tableNumber" IS NOT NULL`

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

  console.log(`Applying Sponsor.tableNumber to ${target.replace(/\/\/.*@/, '//***@')}`)
  try {
    await client.execute(ADD_COLUMN)
    console.log('✓ added Sponsor.tableNumber')
  } catch (e) {
    if (/duplicate column name/i.test(String(e?.message ?? e))) {
      console.log('• Sponsor.tableNumber already present')
    } else {
      throw e
    }
  }
  await client.execute(CREATE_INDEX)
  console.log('✓ unique index present')

  const cols = await client.execute(`PRAGMA table_info("Sponsor")`)
  if (!cols.rows.some((r) => r.name === 'tableNumber')) {
    console.error('✗ Sponsor.tableNumber missing after migration')
    process.exit(1)
  }
  console.log('✓ Sponsor.tableNumber verified')
  client.close?.()
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
