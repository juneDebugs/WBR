// Enrich demo data for the Sponsor test account (sponsor@test.com), a rep for
// the Tailor ERP sponsor company, across the Meetings portal and Attendee PWA.
//
// Tailor ERP is a SHARED seeded sponsor that already carries a confirmed-meeting
// schedule from the main seed. This script does NOT touch that existing data —
// it only tops up Tailor's INBOUND request queue (what the sponsor sees in their
// inbox) plus a few fresh confirmed 1-on-1s, using a fixed, non-overlapping set
// of directory attendees so it stays idempotent and re-runnable.
//
// What the Sponsor account sees (all Tailor rows, regardless of rep):
//   • Attendee PWA  → getSponsorMeetings(): confirmed schedule + PENDING/APPROVED inbox
//   • Meetings portal → getMeetingsData(): every request to Tailor, all statuses
//
// Connects to the same Turso DB every app uses (TURSO_* from apps/web/.env.local
// or the environment).
//
// Usage:
//   node packages/db/scripts/seed-sponsor-demo.mjs          # apply to Turso
//   node packages/db/scripts/seed-sponsor-demo.mjs --dry    # preview only

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DRY = process.argv.includes('--dry')

const SPONSOR_EMAIL = 'sponsor@test.com'
const TAILOR_ID = 'cmngb2h4h0007vm28mbcpxjg5' // Tailor ERP — PLATINUM

const tb = (d, slot) => `tb-d${d}-s${slot}`

// ── Fresh confirmed 1-on-1s (MeetingRequest CONFIRMED + SponsorMeeting) ────────
// Free time blocks (existing Tailor schedule leaves these open). [requesterId, tbId, message]
const CONFIRMED = [
  ['gen-attendee-0003', tb(1,8),  "Hi Tailor — Beth from Florence by Mills. Gen-Z beauty brand scaling fast. Our spreadsheet-and-QuickBooks stack is breaking. Ready to talk real ERP."],
  ['gen-attendee-0004', tb(1,10), "Hey Tailor — Blake at Glossier. Wholesale + DTC + retail on three disconnected systems. We need one source of truth for inventory."],
  ['gen-attendee-0005', tb(2,6),  "Hi Tailor — Brooke from Haus Labs. Lot tracking, expiration dates, and regulatory holds for cosmetics. Can Tailor handle beauty compliance natively?"],
]

// ── Approved inbound (no time block yet) ───────────────────────────────────────
const APPROVED = [
  ['gen-attendee-0006', "Hi Tailor — Caleb from Huda Beauty DTC. Global brand, multi-currency, regional tax. Our current ERP can't keep pace with our launch calendar."],
  ['gen-attendee-0007', "Hey Tailor — Cara at IL MAKIAGE. Quiz-driven personalization means huge SKU velocity. Need demand forecasting tied to the ERP."],
  ['gen-attendee-0008', "Hi Tailor — Chase from Ilia Beauty. Clean beauty ops — ingredient sourcing, batch traceability, and sustainability reporting all in one place."],
  ['gen-attendee-0009', "Hey Tailor — Clara at Jones Road. Founder-led brand growing past our systems. When is the right time to invest in a composable ERP?"],
]

// ── Pending inbound ────────────────────────────────────────────────────────────
const PENDING = [
  ['gen-attendee-0010', "Hi Tailor — Cole from Kosas. Retention is my world but our data lives in five tools. Curious how Tailor unifies orders, inventory, and finance."],
  ['gen-attendee-0011', "Hey Tailor — Dana at Kylie Cosmetics. Limited drops create inventory chaos. How does Tailor handle spike demand and allocation?"],
  ['gen-attendee-0012', "Hi Tailor — Dean from Milk Makeup. Multi-channel (DTC, Sephora, Ulta). One ERP to reconcile all of it — is that realistic?"],
  ['gen-attendee-0013', "Hey Tailor — Diana at Morphe. High-SKU palette business. Bundle and kit BOM management is a nightmare today. Can Tailor solve it?"],
  ['gen-attendee-0014', "Hi Tailor — Drew from NARS DTC. Evaluating ERP replacements for 2026. Where does Tailor fit for prestige beauty?"],
]

// ── Rejected inbound (visible in the Meetings portal history) ──────────────────
const REJECTED = [
  ['gen-attendee-0015', "Hi Tailor — Elena from Saie Beauty. Explored a switch but we just re-signed with NetSuite for two more years. Timing isn't right."],
  ['gen-attendee-0016', "Hey Tailor — Eli at Summer Fridays. Small ops team — decided to stay lean for now. Will revisit once we cross the next revenue tier."],
]

const ALL_REQUESTERS = [...new Set([...CONFIRMED, ...APPROVED, ...PENDING, ...REJECTED].map(r => r[0]))]

async function main() {
  const prisma = createPrisma()
  try {
    const rep = await prisma.user.findFirst({ where: { email: SPONSOR_EMAIL }, select: { id: true, name: true, sponsorId: true } })
    if (!rep) throw new Error(`${SPONSOR_EMAIL} not found — run reset-test-accounts.mjs first`)
    if (rep.sponsorId !== TAILOR_ID) throw new Error(`${SPONSOR_EMAIL} is linked to sponsor ${rep.sponsorId}, expected Tailor ${TAILOR_ID}`)
    const tailor = await prisma.sponsor.findUnique({ where: { id: TAILOR_ID }, select: { name: true } })
    if (!tailor) throw new Error(`Tailor sponsor ${TAILOR_ID} not found`)
    console.log(`\n🏢 ${tailor.name} (rep ${SPONSOR_EMAIL} → ${rep.id})`)

    // Resolve requesters that actually exist
    const found = await prisma.user.findMany({ where: { id: { in: ALL_REQUESTERS } }, select: { id: true } })
    const foundIds = new Set(found.map(u => u.id))
    const missing = ALL_REQUESTERS.filter(id => !foundIds.has(id))
    if (missing.length) console.log(`⚠️  Skipping ${missing.length} missing requester(s): ${missing.join(', ')}`)
    const has = (id) => foundIds.has(id)

    // Resolve time-block locations for SponsorMeeting.location
    const tbIds = [...new Set(CONFIRMED.map(r => r[1]))]
    const tbRows = await prisma.timeBlock.findMany({ where: { id: { in: tbIds } }, select: { id: true, location: true } })
    const tbLoc = Object.fromEntries(tbRows.map(t => [t.id, t.location]))
    const missingTb = tbIds.filter(id => !(id in tbLoc))
    if (missingTb.length) throw new Error(`Missing time blocks: ${missingTb.join(', ')}`)

    if (DRY) {
      console.log('\n(--dry) Would upsert (Tailor inbound, scoped to a fixed requester set):')
      console.log(`   Confirmed (+ SponsorMeeting): ${CONFIRMED.filter(r => has(r[0])).length}`)
      console.log(`   Approved: ${APPROVED.filter(r => has(r[0])).length}`)
      console.log(`   Pending:  ${PENDING.filter(r => has(r[0])).length}`)
      console.log(`   Rejected: ${REJECTED.filter(r => has(r[0])).length}`)
      console.log('\nNo changes written.')
      return
    }

    // ── Idempotency: clear only Tailor rows from OUR curated requester set ────
    const targetIds = ALL_REQUESTERS.filter(has)
    const delReq = await prisma.meetingRequest.deleteMany({ where: { targetSponsorId: TAILOR_ID, requesterId: { in: targetIds } } })
    const delSM = await prisma.sponsorMeeting.deleteMany({ where: { sponsorId: TAILOR_ID, userId: { in: targetIds } } })
    console.log(`🗑  Cleared curated rows — MeetingRequest ${delReq.count} · SponsorMeeting ${delSM.count} (existing seed data untouched)`)

    // ── Confirmed: request + SponsorMeeting (rep = sponsor@test.com) ──────────
    let cN = 0
    for (const [reqId, tbId, msg] of CONFIRMED) {
      if (!has(reqId)) continue
      await prisma.meetingRequest.create({
        data: { requesterId: reqId, targetSponsorId: TAILOR_ID, message: msg, status: 'CONFIRMED', priority: 'BEST_FIT', timeBlockId: tbId },
      })
      await prisma.sponsorMeeting.create({
        data: { sponsorId: TAILOR_ID, userId: reqId, repId: rep.id, timeBlockId: tbId, status: 'CONFIRMED', location: tbLoc[tbId] ?? null },
      })
      cN++
    }
    console.log(`🤝 Confirmed 1-on-1s (request + SponsorMeeting): ${cN}`)

    // ── Approved / Pending / Rejected inbound ────────────────────────────────
    let aN = 0, pN = 0, rN = 0
    for (const [reqId, msg] of APPROVED) { if (!has(reqId)) continue; await prisma.meetingRequest.create({ data: { requesterId: reqId, targetSponsorId: TAILOR_ID, message: msg, status: 'APPROVED' } }); aN++ }
    for (const [reqId, msg] of PENDING)  { if (!has(reqId)) continue; await prisma.meetingRequest.create({ data: { requesterId: reqId, targetSponsorId: TAILOR_ID, message: msg, status: 'PENDING' } }); pN++ }
    for (const [reqId, msg] of REJECTED) { if (!has(reqId)) continue; await prisma.meetingRequest.create({ data: { requesterId: reqId, targetSponsorId: TAILOR_ID, message: msg, status: 'REJECTED' } }); rN++ }
    console.log(`📨 Inbound — approved ${aN} · pending ${pN} · rejected ${rN}`)

    // ── Verify Tailor totals ─────────────────────────────────────────────────
    const sm = await prisma.sponsorMeeting.count({ where: { sponsorId: TAILOR_ID, status: 'CONFIRMED' } })
    const inbox = await prisma.meetingRequest.count({ where: { targetSponsorId: TAILOR_ID, status: { in: ['PENDING', 'APPROVED'] } } })
    const allReq = await prisma.meetingRequest.count({ where: { targetSponsorId: TAILOR_ID } })
    console.log('\n🔎 Tailor totals in Turso:')
    console.log(`   Confirmed SponsorMeetings : ${sm}`)
    console.log(`   Inbox (pending+approved)  : ${inbox}`)
    console.log(`   All requests to Tailor    : ${allReq}`)
    console.log('\n✅ Sponsor demo data seeded.')
  } finally {
    await prisma.$disconnect()
  }
}

function readEnvLocal() {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, 'apps/web/.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}

function createPrisma() {
  const envLocal = readEnvLocal()
  const url = process.env.TURSO_DATABASE_URL ?? envLocal.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
  const { PrismaClient } = require('@prisma/client')
  if (url && token && url.startsWith('libsql://')) {
    const { PrismaLibSQL } = require('@prisma/adapter-libsql')
    const { createClient } = require('@libsql/client/web')
    const libsql = createClient({ url, authToken: token })
    console.log(`🌐 Connected to Turso (${url.slice(0, 44)}…)`)
    return new PrismaClient({ adapter: new PrismaLibSQL(libsql) })
  }
  throw new Error('No TURSO_DATABASE_URL / TURSO_AUTH_TOKEN found (checked env + apps/web/.env.local)')
}

main().catch((e) => { console.error(e); process.exit(1) })
