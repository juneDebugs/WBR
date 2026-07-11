#!/usr/bin/env node
// Applies the feed-social DDL (Message.imageUrl + MessageLike + MessageComment)
// to the runtime database (Turso). Idempotent.
//
// The repo has no Prisma migration history — local SQLite files get schema via
// `prisma db push`, but `prisma db push` cannot target libsql:// URLs, so new
// tables must be replayed on Turso by hand. This script is that replay for the
// home-feed social features (image posts, likes, comments). Table DDL below is
// the exact output of `sqlite3 packages/db/prisma/dev.db '.schema MessageLike'`
// (and MessageComment) after push. The ALTER TABLE has no IF NOT EXISTS form
// in SQLite, so it is guarded by a pragma_table_info check instead.
//
// Usage: node scripts/migrate-feed-social.mjs [--local <path/to/dev.db>]
//   Default: migrate Turso using TURSO_DATABASE_URL/TURSO_AUTH_TOKEN from env
//   or apps/web/.env.local. With --local, migrate a local sqlite file instead.

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

// Not idempotent in SQLite — only run when pragma_table_info shows the column
// is missing (see main()).
const ADD_IMAGE_URL_COLUMN = `ALTER TABLE "Message" ADD COLUMN "imageUrl" TEXT`

const DDL = [
  `CREATE TABLE IF NOT EXISTS "MessageLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageLike_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MessageLike_messageId_userId_key" ON "MessageLike"("messageId", "userId")`,
  `CREATE TABLE IF NOT EXISTS "MessageComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageComment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE INDEX IF NOT EXISTS "MessageComment_messageId_createdAt_idx" ON "MessageComment"("messageId", "createdAt")`,
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

  console.log(`Applying feed-social DDL to ${target.replace(/\/\/.*@/, '//***@')}`)

  const columns = await client.execute(`SELECT name FROM pragma_table_info('Message')`)
  if (columns.rows.some((r) => r.name === 'imageUrl')) {
    console.log('Message.imageUrl already present — skipping ALTER TABLE')
  } else {
    await client.execute(ADD_IMAGE_URL_COLUMN)
  }

  for (const stmt of DDL) {
    await client.execute(stmt)
  }

  const check = await client.execute(
    `SELECT name FROM sqlite_master WHERE type IN ('table','index') AND (name LIKE 'MessageLike%' OR name LIKE 'MessageComment%') ORDER BY name`
  )
  const names = check.rows.map((r) => r.name)
  const expected = [
    'MessageComment',
    'MessageComment_messageId_createdAt_idx',
    'MessageLike',
    'MessageLike_messageId_userId_key',
  ]
  const missing = expected.filter((n) => !names.includes(n))
  const columnsAfter = await client.execute(`SELECT name FROM pragma_table_info('Message')`)
  if (!columnsAfter.rows.some((r) => r.name === 'imageUrl')) {
    missing.push('Message.imageUrl')
  }
  if (missing.length) {
    console.error('✗ Missing after migration:', missing.join(', '))
    process.exit(1)
  }
  console.log('✓ Message.imageUrl column + like/comment tables and indexes present:', names.join(', '))
  client.close?.()
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
