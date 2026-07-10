#!/usr/bin/env node
// Applies the ScheduledMessage DDL to the runtime database (Turso). Idempotent.
//
// The repo has no Prisma migration history — local SQLite files get schema via
// `prisma db push`, but `prisma db push` cannot target libsql:// URLs, so new
// tables must be replayed on Turso by hand. This script is that replay for the
// scheduled-messages feature. DDL below is the exact output of
// `sqlite3 packages/db/prisma/dev.db '.schema ScheduledMessage'` after push.
//
// Usage: node scripts/migrate-scheduled-messages.mjs [--local <path/to/dev.db>]
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
  `CREATE TABLE IF NOT EXISTS "ScheduledMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" DATETIME,
    "sentMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE INDEX IF NOT EXISTS "ScheduledMessage_status_scheduledFor_idx" ON "ScheduledMessage"("status", "scheduledFor")`,
  `CREATE INDEX IF NOT EXISTS "ScheduledMessage_roomId_status_scheduledFor_idx" ON "ScheduledMessage"("roomId", "status", "scheduledFor")`,
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

  console.log(`Applying ScheduledMessage DDL to ${target.replace(/\/\/.*@/, '//***@')}`)
  for (const stmt of DDL) {
    await client.execute(stmt)
  }
  const check = await client.execute(
    `SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name LIKE 'ScheduledMessage%' ORDER BY name`
  )
  const names = check.rows.map((r) => r.name)
  const expected = [
    'ScheduledMessage',
    'ScheduledMessage_roomId_status_scheduledFor_idx',
    'ScheduledMessage_status_scheduledFor_idx',
  ]
  const missing = expected.filter((n) => !names.includes(n))
  if (missing.length) {
    console.error('✗ Missing after migration:', missing.join(', '))
    process.exit(1)
  }
  console.log('✓ ScheduledMessage table + indexes present:', names.join(', '))
  client.close?.()
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
