#!/usr/bin/env node
// Seeds the People→Feed home feed (room-general) with 20 unique event posts
// from 20 distinct users, timestamps staggered over the last ~36 hours.
// Mirrors the connection pattern of migrate-feed-social.mjs. Idempotent-ish:
// seeded rows get 'seedfeed' ids so --clean can remove a previous run first.
//
// Usage: node scripts/seed-feed-posts.mjs [--local <path/to/dev.db>] [--clean]
//   Default: seed Turso using TURSO_DATABASE_URL/TURSO_AUTH_TOKEN from env
//   or apps/web/.env.local. With --local, seed a local sqlite file instead.
//   --clean deletes previously seeded posts (id LIKE 'seedfeed%') first.

import { createRequire } from 'module'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = require('@libsql/client')

const GENERAL_ROOM_ID = 'room-general'

// 20 unique posts about the event. Order = oldest → newest.
const POSTS = [
  "Touched down for WBR 2027! Who else is grabbing badges early? The lanyards are actually gorgeous this year 👏",
  "Day-one keynote was worth the 7am alarm. The retention-economics framework is going straight into our Q3 planning.",
  "Hall A is buzzing. If you're into composable commerce, the panel at 2pm is the one to queue for.",
  "Shoutout to whoever decided the coffee carts should be next to the demo hall. Genius placement, dangerous for my schedule ☕",
  "Just walked the sponsor floor — the personalization demos this year are on another level. Three follow-ups booked already.",
  "The 1:1 meeting matching actually works?! Two of my three morning meetings were spot-on. Whoever built that queue, thank you.",
  "Hot take from the fireside chat: loyalty programs are the new paid acquisition. Discuss 👇",
  "Lost: one water bottle, navy, probably in Workshop Room 3. Found: about six new ideas for our checkout flow. Fair trade.",
  "The supply-chain resilience session deserved a bigger room. Standing-room only and people were still taking notes on the floor.",
  "If you haven't tried the AR fitting-room demo on the sponsor floor yet, go now. I'll wait.",
  "Networking lunch tip: the tables by the windows are where the founders are sitting. You didn't hear it from me 🤫",
  "Slides from my retail-media talk are going up tonight — DM me if you want the extended data cut.",
  "Speaker dinner last night turned into a two-hour debate about first-party data. This is my kind of conference.",
  "Booth tip: we're running live unboxing teardowns at the top of every hour. Come roast our packaging, we can take it.",
  "The quiet workroom on level 2 is the best-kept secret of WBR 2027. Inbox zero achieved between sessions.",
  "Panel quote of the day: 'Your best merchandiser is your returns data.' Still thinking about that one.",
  "Met three future partners in the coffee line this morning. The hallway track is undefeated 🤝",
  "Reminder: session recordings drop in the app 24h after each talk — stop photographing every slide, friends.",
  "Whoever programmed tomorrow's 9am 'Death of the Discount' debate opposite the CX masterclass: I need a time-turner.",
  "Closing-party venue just leaked in my DMs and all I'll say is… bring comfortable shoes 🕺",
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

function seedId() {
  return `seedfeed${randomBytes(10).toString('hex')}`
}

async function main() {
  const localIdx = process.argv.indexOf('--local')
  const clean = process.argv.includes('--clean')
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
  console.log(`Seeding feed posts on ${target.replace(/\/\/.*@/, '//***@')}`)

  if (clean) {
    const del = await client.execute(
      `DELETE FROM "Message" WHERE "roomId" = '${GENERAL_ROOM_ID}' AND "id" LIKE 'seedfeed%'`
    )
    console.log(`--clean: removed ${del.rowsAffected} previously seeded posts`)
  }

  // Room must exist (same upsert semantics as ensureGeneralRoom).
  await client.execute({
    sql: `INSERT INTO "ChatRoom" ("id", "name", "type", "createdAt") VALUES (?, 'General', 'CHANNEL', CURRENT_TIMESTAMP)
          ON CONFLICT("id") DO NOTHING`,
    args: [GENERAL_ROOM_ID],
  })

  // 20 distinct users with a name + profile photo for a good-looking feed,
  // excluding the two well-known test accounts. Stride-sampled across the
  // alphabet (not the first 20 rows) so the cast has diverse names, and
  // deterministic so repeat runs pick the same people.
  const candidates = await client.execute(
    `SELECT "id", "name" FROM "User"
     WHERE "name" IS NOT NULL AND "image" IS NOT NULL
       AND "email" NOT IN ('wbr@test.com', 'stephcurry@test.com')
     ORDER BY "name" ASC`
  )
  if (candidates.rows.length < 20) {
    console.error(`Need 20 users with name+image, found ${candidates.rows.length}`)
    process.exit(1)
  }
  const users = { rows: Array.from({ length: 20 }, (_, i) =>
    candidates.rows[Math.floor((i * candidates.rows.length) / 20)]
  ) }

  const now = Date.now()
  const HOURS = 36
  let inserted = 0
  for (let i = 0; i < POSTS.length; i++) {
    const user = users.rows[i]
    // Oldest first: post i lands (HOURS - i*(HOURS/20)) hours ago, with jitter.
    const ageMs = (HOURS - i * (HOURS / POSTS.length)) * 3600_000
    const jitter = (Math.random() - 0.5) * 30 * 60_000
    const createdAt = new Date(now - ageMs + jitter).toISOString().replace('T', ' ').replace('Z', '')

    await client.execute({
      sql: `INSERT INTO "ChatMember" ("id", "roomId", "userId", "joinedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT("roomId", "userId") DO NOTHING`,
      args: [seedId(), GENERAL_ROOM_ID, user.id],
    })
    await client.execute({
      sql: `INSERT INTO "Message" ("id", "roomId", "senderId", "content", "createdAt") VALUES (?, ?, ?, ?, ?)`,
      args: [seedId(), GENERAL_ROOM_ID, user.id, POSTS[i], createdAt],
    })
    inserted++
    console.log(`  ✓ ${String(inserted).padStart(2)}/20 ${user.name}`)
  }

  const check = await client.execute(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT "senderId") AS senders FROM "Message"
     WHERE "roomId" = '${GENERAL_ROOM_ID}' AND "id" LIKE 'seedfeed%'`
  )
  const { n, senders } = check.rows[0]
  if (Number(n) < 20 || Number(senders) < 20) {
    console.error(`✗ expected ≥20 posts from 20 unique senders, got ${n} posts / ${senders} senders`)
    process.exit(1)
  }
  console.log(`✓ ${n} seeded posts from ${senders} unique users in ${GENERAL_ROOM_ID}`)
  client.close?.()
}

main().catch((e) => {
  console.error('Seeding failed:', e)
  process.exit(1)
})
