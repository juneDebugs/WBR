#!/usr/bin/env node
// Applies the ChatMessagingPermission DDL to the runtime database (Turso).
// Idempotent.
//
// The repo has no Prisma migration history — local SQLite files get schema via
// `prisma db push`, but `prisma db push` cannot target libsql:// URLs, so new
// tables must be replayed on Turso by hand. This script is that replay for the
// chat-settings (admin-controlled friend/message gating) feature. The DDL below
// matches the ChatMessagingPermission model in packages/db/prisma/schema.prisma
// exactly, and the same DDL is created defensively at runtime by
// packages/db/src/chat-settings.ts — this script just guarantees it up front.
//
// Usage: node scripts/migrate-chat-settings.mjs [--local <path/to/dev.db>]
//   Default: migrate Turso using TURSO_DATABASE_URL/TURSO_AUTH_TOKEN from env
//   or apps/web/.env.local. With --local, migrate a local sqlite file instead.

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

const DDL = [
  `CREATE TABLE IF NOT EXISTS "ChatMessagingPermission" (
    "scope" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "settings" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("scope", "subjectId")
)`,
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

  console.log(`Applying ChatMessagingPermission DDL to ${target.replace(/\/\/.*@/, '//***@')}`)
  for (const stmt of DDL) {
    await client.execute(stmt)
  }
  const check = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ChatMessagingPermission'`
  )
  if (check.rows.length !== 1) {
    console.error('✗ ChatMessagingPermission table missing after migration')
    process.exit(1)
  }
  console.log('✓ ChatMessagingPermission table present')
  client.close?.()
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
