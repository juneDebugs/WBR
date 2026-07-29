#!/usr/bin/env node
// Idempotent demo-data backfill: every CONFIRMED SponsorMeeting must have a
// table assigned. Fills SponsorMeeting.location for rows where it is NULL,
// picking the first free room from MEETING_ROOMS (Table 1–8 capacity 1 each,
// Networking Lounge capacity 4) scoped per sponsor per time block — the same
// occupancy rule the meeting engine enforces on assign/reschedule.
//
// Targets Turso when TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are present (in env or
// apps/*/.env.local), else the local packages/db/prisma/dev.db fallback — the
// same connection strategy the migrate-* scripts use.
//
//   node scripts/seed-meeting-locations.mjs            # auto-detect Turso, else local
//   node scripts/seed-meeting-locations.mjs --local    # force local dev.db
//   node scripts/seed-meeting-locations.mjs --dry-run  # report, change nothing
//
import { readFileSync, copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORCE_LOCAL = process.argv.includes('--local')
const DRY_RUN = process.argv.includes('--dry-run')

// Mirrors MEETING_ROOMS in packages/db/src/meeting-engine.ts (kept literal so
// this script stays runnable without a TS toolchain).
const MEETING_ROOMS = [
  { name: 'Table 1', capacity: 1 },
  { name: 'Table 2', capacity: 1 },
  { name: 'Table 3', capacity: 1 },
  { name: 'Table 4', capacity: 1 },
  { name: 'Table 5', capacity: 1 },
  { name: 'Table 6', capacity: 1 },
  { name: 'Table 7', capacity: 1 },
  { name: 'Table 8', capacity: 1 },
  { name: 'Networking Lounge', capacity: 4 },
]

function readEnvLocal(app) {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, 'apps', app, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const mm = line.match(/^([A-Z_]+)=(.*)$/)
      if (mm) env[mm[1]] = mm[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}

function openDb() {
  const req = createRequire(join(ROOT, 'packages/db/package.json'))
  const { createClient } = req('@libsql/client')
  const envLocal = { ...readEnvLocal('web'), ...readEnvLocal('meetings') }
  const url = process.env.TURSO_DATABASE_URL ?? envLocal.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
  if (!FORCE_LOCAL && url && token && url.startsWith('libsql://')) {
    console.log('→ target: Turso', url.replace(/(libsql:\/\/[^.]+).*/, '$1…'))
    return { db: createClient({ url, authToken: token }), isLocal: false }
  }
  const file = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
  console.log('→ target: local', file)
  return { db: createClient({ url: file }), isLocal: true }
}

// Keep every app's local dev.db copy in lockstep (db:seed does the same fan-out).
function fanOutLocal() {
  const src = join(ROOT, 'packages/db/prisma/dev.db')
  const targets = [
    'apps/attendee/dev.db', 'apps/web/dev.db', 'apps/sponsor/dev.db',
    'apps/meetings/dev.db', 'packages/db/dev.db',
  ]
  for (const t of targets) {
    const dest = join(ROOT, t)
    try {
      if (existsSync(dest)) { copyFileSync(src, dest); console.log(`  ↪ synced ${t}`) }
    } catch (e) { console.warn(`  ! could not sync ${t}: ${e.message}`) }
  }
}

async function main() {
  const { db, isLocal } = openDb()

  const res = await db.execute(
    `SELECT id, sponsorId, timeBlockId, location FROM "SponsorMeeting" WHERE status = 'CONFIRMED' ORDER BY createdAt, id`
  )
  const meetings = res.rows.map(r => ({
    id: String(r.id),
    sponsorId: String(r.sponsorId),
    timeBlockId: String(r.timeBlockId),
    location: r.location == null ? null : String(r.location),
  }))

  // occupancy: sponsorId ⨯ timeBlockId → Map(roomName → count), seeded from
  // rows that already have a location so reruns and partial fills stay valid.
  const occupancy = new Map()
  const cell = m => {
    const key = `${m.sponsorId}::${m.timeBlockId}`
    if (!occupancy.has(key)) occupancy.set(key, new Map())
    return occupancy.get(key)
  }
  for (const m of meetings) {
    if (m.location) cell(m).set(m.location, (cell(m).get(m.location) ?? 0) + 1)
  }

  const unassigned = meetings.filter(m => !m.location)
  console.log(`→ ${meetings.length} confirmed meeting(s), ${unassigned.length} without a table`)

  let filled = 0
  let overflow = 0
  for (const m of unassigned) {
    const taken = cell(m)
    let room = MEETING_ROOMS.find(r => (taken.get(r.name) ?? 0) < r.capacity)
    if (!room) {
      // Demo data can overbook a block; park extras in the lounge and say so.
      room = MEETING_ROOMS[MEETING_ROOMS.length - 1]
      overflow++
    }
    taken.set(room.name, (taken.get(room.name) ?? 0) + 1)
    if (!DRY_RUN) {
      await db.execute({
        sql: `UPDATE "SponsorMeeting" SET location = ? WHERE id = ?`,
        args: [room.name, m.id],
      })
    }
    filled++
    console.log(`  ${DRY_RUN ? '(dry) ' : ''}+ ${m.id} → ${room.name}`)
  }
  if (overflow) console.warn(`  ! ${overflow} meeting(s) exceeded block capacity — parked in Networking Lounge`)

  const check = await db.execute(
    `SELECT COUNT(*) AS n FROM "SponsorMeeting" WHERE status = 'CONFIRMED' AND location IS NULL`
  )
  const remaining = Number(check.rows[0].n)
  if (!DRY_RUN && isLocal && filled > 0) fanOutLocal()
  console.log(
    filled
      ? `Done — ${filled} table(s) ${DRY_RUN ? 'would be' : ''} assigned; ${remaining} confirmed meeting(s) still unassigned.`
      : 'Done — every confirmed meeting already has a table.'
  )
  if (!DRY_RUN && remaining > 0) process.exit(1)
}

main().catch(err => { console.error('Backfill failed:', err); process.exit(1) })
