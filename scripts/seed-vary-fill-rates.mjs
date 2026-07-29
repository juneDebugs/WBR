#!/usr/bin/env node
// Demo-data reshaping: vary the per-sponsor confirmed-meeting counts so the
// Master Schedule "Sponsor Meeting Fill Rate" strip shows a realistic mix of
// over-filled, exactly-filled, and under-filled sponsors (FILL_TARGET = 10)
// instead of every sponsor sitting at or above target.
//
// Reduction mirrors meeting-engine cancelMeeting semantics exactly:
//   - surplus SponsorMeeting rows flip to CANCELLED with a realistic reason
//   - the linked CONFIRMED MeetingRequest (same pair, either direction) goes
//     back to the bank (APPROVED, timeBlockId NULL) for ~60% of cancellations
//     and to CANCELLED for the rest — like real late drop-outs.
// Meetings that were already checked in on the floor are never cancelled.
//
// Targets Turso when TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are present (in env or
// apps/*/.env.local), else the local packages/db/prisma/dev.db fallback — the
// same connection strategy the other seed/migrate scripts use.
//
//   node scripts/seed-vary-fill-rates.mjs            # auto-detect Turso, else local
//   node scripts/seed-vary-fill-rates.mjs --local    # force local dev.db
//   node scripts/seed-vary-fill-rates.mjs --dry-run  # report, change nothing
//
import { readFileSync, copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORCE_LOCAL = process.argv.includes('--local')
const DRY_RUN = process.argv.includes('--dry-run')

// Desired confirmed-meeting count per sponsor (FILL_TARGET = 10). Big-name
// sponsors stay oversubscribed, a middle band lands exactly on target, and the
// tail is undersold. Sponsors absent from this map are left untouched; a
// sponsor already at or below its target is left untouched (we only cancel).
const TARGETS = {
  'Shopify': 14,
  'Tailor ERP': 12,
  'Klaviyo': 13,
  'ShipStation': 11,
  'Gorgias': 10,
  'Recharge': 9,
  'BigCommerce': 10,
  'Yotpo': 8,
  'Attentive': 12,
  'Google Cloud': 10,
  'Okendo': 7,
  'Loop Returns': 9,
  'Narvar': 6,
  'Rebuy Engine': 11,
  'Ordergroove': 5,
  'AfterShip': 8,
  'Searchspring': 7,
  'Postscript': 10,
  'Extensiv': 6,
  'Skio': 4,
}

const CANCEL_REASONS = [
  'Attendee schedule conflict',
  'Sponsor rep double-booked',
  'Attendee cancelled conference attendance',
  'No mutual slot found after reschedule request',
  'Sponsor withdrew the meeting',
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

// Mirrors meeting-engine findLinkedRequest: the pair's live CONFIRMED request,
// in either direction (attendee → sponsor, or sponsor rep → attendee).
async function findLinkedRequest(db, sponsorId, userId) {
  const res = await db.execute({
    sql: `SELECT mr.id FROM "MeetingRequest" mr
          LEFT JOIN "User" u ON u.id = mr.requesterId
          WHERE mr.status = 'CONFIRMED'
            AND ((mr.targetSponsorId = ? AND mr.requesterId = ?)
              OR (u.sponsorId = ? AND mr.targetUserId = ?))
          ORDER BY mr.updatedAt DESC LIMIT 1`,
    args: [sponsorId, userId, sponsorId, userId],
  })
  return res.rows[0] ? String(res.rows[0].id) : null
}

async function main() {
  const { db, isLocal } = openDb()

  const sponsorsRes = await db.execute(
    `SELECT s.id, s.name, COUNT(sm.id) AS confirmed
     FROM "Sponsor" s
     LEFT JOIN "SponsorMeeting" sm ON sm.sponsorId = s.id AND sm.status = 'CONFIRMED'
     GROUP BY s.id, s.name
     ORDER BY confirmed DESC, s.name ASC`
  )
  const sponsors = sponsorsRes.rows.map(r => ({
    id: String(r.id), name: String(r.name), confirmed: Number(r.confirmed),
  }))

  let cancelled = 0
  let requestsPreserved = 0
  let requestsCancelled = 0

  for (const s of sponsors) {
    const target = TARGETS[s.name]
    if (target == null) { console.log(`  = ${s.name}: ${s.confirmed} (no target — untouched)`); continue }
    const surplus = s.confirmed - target
    if (surplus <= 0) { console.log(`  = ${s.name}: ${s.confirmed} → ${s.confirmed} (already ≤ target ${target})`); continue }

    // Latest-created, never-checked-in meetings are the "late cancellations".
    const victims = await db.execute({
      sql: `SELECT id, userId FROM "SponsorMeeting"
            WHERE sponsorId = ? AND status = 'CONFIRMED'
              AND sponsorArrivedAt IS NULL AND buyerArrivedAt IS NULL
            ORDER BY createdAt DESC, id DESC LIMIT ?`,
      args: [s.id, surplus],
    })
    if (victims.rows.length < surplus) {
      console.warn(`  ! ${s.name}: only ${victims.rows.length}/${surplus} cancellable (rest checked in)`)
    }

    for (const [i, row] of victims.rows.entries()) {
      const meetingId = String(row.id)
      const userId = String(row.userId)
      const reason = CANCEL_REASONS[(cancelled + i) % CANCEL_REASONS.length]
      const preserve = (cancelled + i) % 5 < 3 // ~60% go back to the bank

      if (!DRY_RUN) {
        await db.execute({
          sql: `UPDATE "SponsorMeeting" SET status = 'CANCELLED', reason = ? WHERE id = ?`,
          args: [reason, meetingId],
        })
        const linkedId = await findLinkedRequest(db, s.id, userId)
        if (linkedId) {
          if (preserve) {
            await db.execute({
              sql: `UPDATE "MeetingRequest" SET status = 'APPROVED', timeBlockId = NULL WHERE id = ?`,
              args: [linkedId],
            })
            requestsPreserved++
          } else {
            await db.execute({
              sql: `UPDATE "MeetingRequest" SET status = 'CANCELLED' WHERE id = ?`,
              args: [linkedId],
            })
            requestsCancelled++
          }
        }
      }
    }
    cancelled += victims.rows.length
    console.log(`  ${DRY_RUN ? '(dry) ' : ''}- ${s.name}: ${s.confirmed} → ${s.confirmed - victims.rows.length} (target ${target})`)
  }

  const after = await db.execute(
    `SELECT s.name, COUNT(sm.id) AS confirmed
     FROM "Sponsor" s
     LEFT JOIN "SponsorMeeting" sm ON sm.sponsorId = s.id AND sm.status = 'CONFIRMED'
     GROUP BY s.id, s.name ORDER BY confirmed DESC, s.name ASC`
  )
  console.log('\nFill rates now (target 10):')
  for (const r of after.rows) {
    const n = Number(r.confirmed)
    const tag = n > 10 ? 'over' : n === 10 ? 'exact' : 'under'
    console.log(`  ${String(r.name).padEnd(16)} ${String(n).padStart(2)}/10  ${tag}`)
  }

  if (!DRY_RUN && isLocal && cancelled > 0) fanOutLocal()
  console.log(
    `\nDone — ${cancelled} meeting(s) ${DRY_RUN ? 'would be' : ''} cancelled; ` +
    `${requestsPreserved} request(s) back to bank, ${requestsCancelled} request(s) cancelled.`
  )
}

main().catch(err => { console.error('Reshape failed:', err); process.exit(1) })
