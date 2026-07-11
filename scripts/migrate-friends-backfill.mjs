#!/usr/bin/env node
// Backfills mutual Follow edges for the friend-request system. Idempotent.
//
// The People-page social model changed from one-directional follows to
// friendships represented as MUTUAL Follow edges (A→B and B→A). Rows created
// under the old model are one-directional, which the new code reads as a
// *pending* friend request — silently downgrading every existing "Following"
// relationship and revoking DM access those users already had. This script
// preserves the old behavior across the cutover by mirroring every existing
// edge: for each A→B without a B→A, insert the reverse edge, making the pair
// friends. Requests created *after* the cutover stay pending until accepted.
//
// Mirrored rows get the deterministic id 'bf-<original id>' so a rerun (or a
// concurrent run) cannot double-insert even mid-transaction; the NOT EXISTS
// guard makes reruns no-ops regardless.
//
// Usage: node scripts/migrate-friends-backfill.mjs [--local <path/to/dev.db>]
//   Default: backfill Turso using TURSO_DATABASE_URL/TURSO_AUTH_TOKEN from env
//   or apps/web/.env.local. With --local, backfill a local sqlite file instead.

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

const MIRROR_EDGES = `
  INSERT INTO "Follow" ("id", "followerId", "followingId", "createdAt")
  SELECT 'bf-' || f."id", f."followingId", f."followerId", f."createdAt"
  FROM "Follow" f
  WHERE NOT EXISTS (
    SELECT 1 FROM "Follow" r
    WHERE r."followerId" = f."followingId" AND r."followingId" = f."followerId"
  )`

const UNMIRRORED_COUNT = `
  SELECT COUNT(*) AS n
  FROM "Follow" f
  WHERE NOT EXISTS (
    SELECT 1 FROM "Follow" r
    WHERE r."followerId" = f."followingId" AND r."followingId" = f."followerId"
  )`

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

  console.log(`Backfilling mutual Follow edges on ${target.replace(/\/\/.*@/, '//***@')}`)

  const before = await client.execute(UNMIRRORED_COUNT)
  const pending = Number(before.rows[0].n)
  if (pending === 0) {
    console.log('✓ All Follow edges already mutual — nothing to do')
    client.close?.()
    return
  }

  const result = await client.execute(MIRROR_EDGES)
  const after = await client.execute(UNMIRRORED_COUNT)
  if (Number(after.rows[0].n) !== 0) {
    console.error(`✗ ${after.rows[0].n} one-directional edges remain after backfill`)
    process.exit(1)
  }
  console.log(`✓ Mirrored ${result.rowsAffected ?? pending} edge(s); every follow pair is now mutual`)
  client.close?.()
}

main().catch((e) => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
