#!/usr/bin/env node
// Seeds 3 sample PENDING scheduled broadcasts so the Chat page's "Scheduled
// messages" subsection has content to show. Idempotent: rows use fixed ids
// and are replaced on re-run. Requires the ScheduledMessage table (run
// scripts/migrate-scheduled-messages.mjs first) and an existing admin user.
//
// Usage: node scripts/seed-scheduled-samples.mjs [--local <path/to/dev.db>]
//   Default: seed Turso using TURSO_DATABASE_URL/TURSO_AUTH_TOKEN from env
//   or apps/web/.env.local. With --local, seed a local sqlite file instead.
//
// DateTime format note: plain-SQLite Prisma stores DateTime columns as epoch
// milliseconds, but the libsql driver adapter (Turso) stores ISO-8601 text.
// SQLite orders integers below ALL text, so seeding the wrong format makes
// every row compare as "due" and the dispatcher broadcasts it immediately.
// The script sniffs the target's format from an existing datetime value.

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

const SENDER_EMAIL = process.env.SMOKE_EMAIL ?? 'june@tailor.tech'
const GENERAL_ROOM_ID = 'room-general'

function at(hoursFromNow, atHour = null) {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000)
  if (atHour !== null) d.setHours(atHour, 0, 0, 0)
  return d.getTime()
}

// Match how the target database's Prisma client serializes DateTime.
async function datetimeEncoder(client, isLocalFile) {
  const probe = await client.execute(
    "SELECT createdAt FROM Message LIMIT 1"
  ).catch(() => ({ rows: [] }))
  const sample = probe.rows[0]?.createdAt
  const asText = sample !== undefined
    ? typeof sample === 'string'
    : !isLocalFile // no data to sniff: adapter (Turso) writes text, plain sqlite writes ints
  return (ms) => (asText ? new Date(ms).toISOString().replace('Z', '+00:00') : ms)
}

const SAMPLES = [
  {
    id: 'sample-sched-doors',
    content: '📣 Doors open at 8 AM tomorrow — grab your badge at Registration Desk B before the rush.',
    scheduledFor: at(2),
  },
  {
    id: 'sample-sched-keynote',
    content: 'Day 2 keynote kicks off at 9:15 AM in the Grand Hall. Seats fill up fast — come early!',
    scheduledFor: at(24, 9),
  },
  {
    id: 'sample-sched-reception',
    content: '🥂 Closing reception at 6 PM on the Skyline Terrace. All attendees welcome.',
    scheduledFor: at(48, 18),
  },
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
  let client
  if (localIdx !== -1) {
    const path = process.argv[localIdx + 1]
    if (!path) {
      console.error('--local requires a path to a sqlite file')
      process.exit(2)
    }
    client = createClient({ url: `file:${path}` })
  } else {
    let url = process.env.TURSO_DATABASE_URL
    let authToken = process.env.TURSO_AUTH_TOKEN
    if (!url || !authToken) ({ url, authToken } = tursoCredsFromEnvLocal())
    if (!url || !authToken) {
      console.error('No TURSO_DATABASE_URL/TURSO_AUTH_TOKEN in env or apps/web/.env.local')
      process.exit(2)
    }
    client = createClient({ url, authToken })
  }

  const table = await client.execute(
    "SELECT name FROM sqlite_master WHERE name = 'ScheduledMessage'"
  )
  if (!table.rows.length) {
    console.error('✗ ScheduledMessage table missing — run scripts/migrate-scheduled-messages.mjs first')
    process.exit(1)
  }

  const enc = await datetimeEncoder(client, localIdx !== -1)

  const sender = await client.execute({
    sql: 'SELECT id FROM User WHERE email = ?',
    args: [SENDER_EMAIL],
  })
  if (!sender.rows.length) {
    console.error(`✗ No user with email ${SENDER_EMAIL}`)
    process.exit(1)
  }
  const senderId = sender.rows[0].id

  await client.execute({
    sql: `INSERT OR IGNORE INTO ChatRoom (id, name, type, createdAt) VALUES (?, 'General', 'CHANNEL', ?)`,
    args: [GENERAL_ROOM_ID, enc(Date.now())],
  })

  const now = Date.now()
  for (const s of SAMPLES) {
    await client.execute({
      sql: `INSERT OR REPLACE INTO ScheduledMessage
              (id, roomId, senderId, content, scheduledFor, status, sentAt, sentMessageId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, NULL, ?, ?)`,
      args: [s.id, GENERAL_ROOM_ID, senderId, s.content, enc(s.scheduledFor), enc(now), enc(now)],
    })
    console.log(`✓ ${s.id} — "${s.content.slice(0, 50)}…" at ${new Date(s.scheduledFor).toLocaleString()}`)
  }

  const count = await client.execute(
    "SELECT COUNT(*) AS n FROM ScheduledMessage WHERE status = 'PENDING'"
  )
  console.log(`Done — ${count.rows[0].n} pending scheduled message(s) in the queue.`)
  client.close?.()
}

main().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
