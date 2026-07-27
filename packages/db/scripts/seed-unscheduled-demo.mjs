// Guarantee every sponsor company a populated "Unscheduled" bank in the
// meeting-engine consoles (admin Meetings → Companies tab and /staff in
// apps/meetings): tops each active-conference sponsor up to a per-company
// floor of 3–6 APPROVED meeting requests (the floor varies by company so the
// demo doesn't look stamped out of one mold).
//
// Idempotent by construction: the script measures each company's CURRENT bank
// via the real engine (getSponsorScheduleMatrix) and only creates the missing
// difference, so re-running after banks drain (assign / auto-schedule) simply
// restores the floor and a run against a full bank creates nothing. Candidates
// are drawn deterministically from the gen-attendee directory pool, skipping
// anyone who already has a request or a confirmed meeting with that sponsor —
// interest levels then vary naturally via the attendees' solutions profiles.
//
// Connects to the same Turso DB every app uses (TURSO_* from apps/web/.env.local
// or the environment).
//
// Usage:
//   node packages/db/scripts/seed-unscheduled-demo.mjs          # apply to Turso
//   node packages/db/scripts/seed-unscheduled-demo.mjs --dry    # preview only

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DRY = process.argv.includes('--dry')

const FLOOR = 3 // every company ends with at least this many Unscheduled
const PRIORITIES = ['BEST_FIT', 'MED', 'LOW']

// Message templates — {sponsor} / {company} substituted per request.
const MESSAGES = [
  'Hi {sponsor} — we are re-platforming next quarter and {company} needs a partner who can keep pace. Keen to compare notes.',
  'Hello from {company}! Your booth demo caught our team’s eye — would love 30 minutes on integration timelines.',
  'Hey {sponsor} — {company} is consolidating vendors this year and you are on our shortlist. Can we talk pricing tiers?',
  '{company} here. We outgrew our current tooling and your roadmap looks like the right fit. Happy to meet any slot.',
  'Hi — leading ops at {company}. Two pain points I want your take on: attribution and retention. 1-on-1 would be great.',
  'Hello {sponsor} — evaluating solutions for our 2027 stack at {company}. A quick working session would save us weeks.',
  'Hey team — {company} saw your case study and the numbers speak for themselves. Would love to dig into the details.',
  '{sponsor} + {company} feels like an obvious conversation. Our CEO asked me to set up time this conference.',
]

function readEnvLocal() {
  const out = {}
  for (const p of [join(ROOT, 'apps/web/.env.local'), join(ROOT, 'apps/meetings/.env.local')]) {
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const i = line.indexOf('=')
        if (i > 0 && !line.trim().startsWith('#')) out[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^"|"$/g, '')
      }
    } catch { /* file optional */ }
  }
  return out
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
    console.log(`\u{1F310} Connected to Turso (${url.slice(0, 44)}…)`)
    return new PrismaClient({ adapter: new PrismaLibSQL(libsql) })
  }
  throw new Error('No TURSO_DATABASE_URL / TURSO_AUTH_TOKEN found (checked env + apps/web/.env.local)')
}

async function main() {
  const prisma = createPrisma()
  const E = await import(pathToFileURL(join(ROOT, 'packages/db/src/meeting-engine.ts')).href)
  try {
    const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true, name: true } })
    if (!conf) throw new Error('No active conference found')
    const sponsors = await prisma.sponsor.findMany({
      where: { conferenceId: conf.id },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    console.log(`\n\u{1F3E2} ${conf.name ?? conf.id}: ${sponsors.length} sponsor companies · floor ${FLOOR}+ Unscheduled each\n`)

    // Deterministic candidate pool: the generated attendee directory.
    const pool = await prisma.user.findMany({
      where: { id: { startsWith: 'gen-attendee-' }, sponsorId: null },
      orderBy: { id: 'asc' },
      select: { id: true, company: true },
    })
    if (pool.length < 50) throw new Error(`gen-attendee pool too small (${pool.length}) — run the main seed first`)

    let createdTotal = 0
    for (const [i, sponsor] of sponsors.entries()) {
      const target = FLOOR + (i % 4) // 3..6, varies per company
      const matrix = await E.getSponsorScheduleMatrix(prisma, sponsor.id, conf.id)
      const have = matrix.bank.length
      const missing = Math.max(0, target - have)
      if (missing === 0) {
        console.log(`   ${sponsor.name.padEnd(20)} bank ${have} ≥ target ${target} — nothing to do`)
        continue
      }

      // Users already tied to this sponsor (any request, or a confirmed
      // meeting) are ineligible — a new request would dupe or never reach the bank.
      const [reqRows, smRows] = await Promise.all([
        prisma.meetingRequest.findMany({ where: { targetSponsorId: sponsor.id }, select: { requesterId: true } }),
        prisma.sponsorMeeting.findMany({ where: { sponsorId: sponsor.id, status: 'CONFIRMED' }, select: { userId: true } }),
      ])
      const taken = new Set([...reqRows.map(r => r.requesterId), ...smRows.map(m => m.userId)])

      // Walk the pool from a per-company offset so different companies draw
      // different candidates (and different interest-score mixes).
      const picks = []
      for (let step = 0; step < pool.length && picks.length < missing; step++) {
        const cand = pool[(i * 37 + step) % pool.length]
        if (!taken.has(cand.id) && !picks.some(p => p.id === cand.id)) picks.push(cand)
      }
      if (picks.length < missing) throw new Error(`Not enough free candidates for ${sponsor.name}`)

      if (DRY) {
        console.log(`   ${sponsor.name.padEnd(20)} bank ${have} → would create ${missing} (target ${target})`)
        continue
      }

      for (const [k, cand] of picks.entries()) {
        const priority = PRIORITIES[(i + k) % PRIORITIES.length]
        const message = MESSAGES[(i * 3 + k) % MESSAGES.length]
          .replaceAll('{sponsor}', sponsor.name)
          .replaceAll('{company}', cand.company ?? 'our team')
        await prisma.meetingRequest.create({
          data: { requesterId: cand.id, targetSponsorId: sponsor.id, status: 'APPROVED', priority, message },
        })
      }
      createdTotal += picks.length
      console.log(`   ${sponsor.name.padEnd(20)} bank ${have} → ${have + picks.length} (target ${target}, +${picks.length}, priorities vary)`)
    }

    if (DRY) { console.log('\n(--dry) No changes written.'); return }
    console.log(`\n➕ Created ${createdTotal} APPROVED requests`)

    // Verify through the real engine: every company's directory row must now
    // report at least FLOOR unscheduled.
    const dir = await E.getCompanyDirectory(prisma, conf.id)
    const short = dir.filter(r => r.unscheduled < FLOOR)
    for (const r of dir) console.log(`   ✓ ${r.name.padEnd(20)} unscheduled=${r.unscheduled}`)
    if (short.length) {
      console.error(`\n❌ ${short.length} compan${short.length === 1 ? 'y' : 'ies'} below the floor: ${short.map(r => r.name).join(', ')}`)
      process.exit(1)
    }
    console.log(`\n✅ All ${dir.length} companies have ≥ ${FLOOR} Unscheduled requests`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
