// Populate rich demo data for the Brand test account (stephcurry@test.com)
// across the Meetings portal and the Attendee (mobile) PWA.
//
// Idempotent + Steph-scoped: it wipes ONLY Steph's own rows, then recreates
// them, so the ~1,000 seeded directory users are never touched. Safe to re-run.
//
// What it creates for Steph Curry (Golden State Warriors, BRAND):
//   • Session bookmarks           → the Attendee "Schedule / Saved" list
//   • Peer Meeting rows           → the Attendee "Meetings" tab (scheduled)
//   • Peer MeetingRequests        → the Meetings portal (in/out, all statuses)
//   • Sponsor MeetingRequests     → the Meetings portal (in/out, all statuses)
//   • SponsorMeeting rows         → confirmed sponsor 1-on-1s
//
// Connects to the same Turso DB every app uses (TURSO_* from apps/web/.env.local
// or the environment).
//
// Usage:
//   node packages/db/scripts/seed-steph-demo.mjs          # apply to Turso
//   node packages/db/scripts/seed-steph-demo.mjs --dry    # preview only

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DRY = process.argv.includes('--dry')

const STEPH_EMAIL = 'stephcurry@test.com'
const CONFERENCE_ID = 'conf-2025'

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

// ── Sponsors (live Turso ids) ─────────────────────────────────────────────────
const S = {
  SHO: 'cmngb2h4h0000vm28ssjt1m0z', // Shopify — PLATINUM
  BC:  'cmngb2h4h0001vm2889slafvy', // BigCommerce — PLATINUM
  TER: 'cmngb2h4h0007vm28mbcpxjg5', // Tailor ERP — PLATINUM
  SS:  'cmngb2h4h0002vm28jsro8se9', // ShipStation — GOLD
  LR:  'cmngb2h4h0003vm281j76qc4e', // Loop Returns — GOLD
  KL:  'cmngb2h4h0004vm28nn3rme1o', // Klaviyo — GOLD
  GOR: 'cmngb2h4h0005vm28mg7g52fh', // Gorgias — GOLD
  RC:  'cmngb2h4h0006vm28enbuld34', // Recharge — GOLD
  YO:  'cmngb2h4h0008vm28i6338gp9', // Yotpo — SILVER
  GC:  'cmngbix6w0001fwpj6dwlwyri', // Google Cloud — SILVER
  PSC: 'cmngb2h4h000avm28j2vs0j0k', // Postscript — SILVER
  OG:  'cmngb2h4h000fvm28fzk7rs4l', // Ordergroove — BRONZE
  AS:  'cmngb2h4h000hvm28vn41ytgc', // AfterShip — BRONZE
  SR:  'cmngb2h4h000ivm281ido85fq', // Searchspring — BRONZE
  RE:  'cmngb2h4h000jvm28zwqqu86h', // Rebuy Engine — BRONZE
}

// ── Named peer partners (live Turso ids; verified at runtime, missing skipped) ─
const P = {
  JL: 'cmnf5o3zh0000o6gl8ph6p741', // Jordan Lee — VP Sales, Arhaus DTC
  MP: 'cmnf5o3zk0003o6gl1dkbwyba', // Maya Patel — Head of DTC, Urban Decay
  KO: 'cmnf5o4050010o6gly4ukzmah', // Kwesi Owusu — CEO, SK-II DTC
  AB: 'cmnf5o3zo0009o6gloybowz8b', // Aaliyah Brooks — VP Growth, Entireworld
  HS: 'cmnf5o4060013o6glxmcmr2r8', // Hana Suzuki — VP Growth, SSENSE
  CB: 'cmnf5o40g001lo6gld2txewt2', // Chloe Beaumont — Head of Wholesale, Kylie Cosmetics
  AD: 'cmnf5o4090019o6gl06nnhzc0', // Amara Diallo — VP Revenue, Depop
  RO: 'cmnf5o40b001co6gl8j8dafx3', // Ryan O'Brien — COO, Beautycounter
  // Directory attendees for inbound requests
  G1: 'gen-attendee-0000',         // Alex Adams — VP Marketing, Charlotte Tilbury DTC
  G2: 'gen-attendee-0080',         // Alex Baker — Director of Ecommerce, Glossier
  G3: 'gen-attendee-0002',         // Ben Adams — Director of DTC, Fenty Beauty DTC
}

const tb = (d, slot) => `tb-d${d}-s${slot}`

// ── Session bookmarks — a full, curated agenda across both days ────────────────
const BOOKMARKS = [
  'ses-1',                          // Opening Keynote: The Future of Commerce
  'cmnh270yl0001h91bl4e9zl10',      // Shopify Plus for Enterprise
  'cmngg3us00003t4n0ljqh8sbi',      // Klaviyo Email & SMS Masterclass
  'cmngg3urz0001t4n0g8smxi6a',      // Scaling Subscription Commerce with Recharge
  'cmnh270yq0009h91b4jhq9u1v',      // Customer Lifetime Value
  'cmnh270yu000lh91brhwicofs',      // Influencer & Affiliate Commerce
  'cmnh270yt000hh91bg22iaqnw',      // Video Commerce: Content into Conversions
  'ses-6',                          // Day 2 Keynote: Engineering at Scale
  'cmngg5zmc000551i70g4bb30x',      // Day 2 Keynote: AI-Powered Commerce in 2026
  'cmnh270yy000xh91bcxnc435f',      // Social Commerce: TikTok Shop & Instagram
  'cmngg5zme000951i7twrmtzuj',      // Loyalty & Reviews — Yotpo
  'cmnh270z3001dh91b7a5s0lim',      // Subscription Churn: Prediction & Win-Back
  'cmnh270z4001fh91b6vhbs383',      // Mobile-First Commerce Design
  'cmngg5zmi000h51i77uzfxr3e',      // Closing Keynote: The Next Decade of Commerce
]

// ── Confirmed sponsor 1-on-1s (MeetingRequest CONFIRMED + SponsorMeeting) ──────
// [sponsorId, timeBlockId, message]
const SPONSOR_CONFIRMED = [
  [S.SHO, tb(1,1), "Hi Shopify — Steph Curry from Golden State. We're launching a DTC merch line and need a platform that scales for drops and limited editions."],
  [S.KL,  tb(1,2), "Hey Klaviyo — Steph from Golden State. Email and SMS for the athlete brand. How do you handle celebrity-scale subscriber lists?"],
  [S.GOR, tb(1,3), "Hi Gorgias — Steph from Golden State. Customer support for merch drops is chaos. Need automation that still feels personal."],
  [S.RC,  tb(2,1), "Hey Recharge — Steph from Golden State. Subscription model for a monthly merch box. Premium tier for season ticket holders."],
  [S.LR,  tb(2,2), "Hi Loop Returns — Steph from Golden State. Jersey sizing returns are a huge volume. Exchange flow is critical to keep revenue."],
  [S.YO,  tb(2,3), "Hey Yotpo — Steph from Golden State. Fan reviews and UGC are our best marketing. How do you scale social proof for athlete brands?"],
]

// ── Approved sponsor requests (no time block yet) ──────────────────────────────
const SPONSOR_APPROVED = [
  [S.BC,  "Hi BigCommerce — Steph from Golden State. Evaluating headless commerce for our athlete brand platform."],
  [S.TER, "Hey Tailor — Steph from Golden State. Merch inventory across 50+ SKUs, seasonal drops, and arena retail. Need a real ERP."],
  [S.SS,  "Hi ShipStation — Steph from Golden State. Multi-carrier shipping for game day merch — speed is everything."],
]

// ── Pending sponsor requests ───────────────────────────────────────────────────
const SPONSOR_PENDING = [
  [S.RE,  "Hi Rebuy — Steph from Golden State. Post-purchase upsells for merch. Jersey buyers should see matching shorts and accessories."],
  [S.PSC, "Hey Postscript — Steph from Golden State. SMS for game day flash sales. What's the best practice for time-sensitive drops?"],
  [S.SR,  "Hi Searchspring — Steph from Golden State. Product discovery for a merch catalog. Size, color, player — lots of attributes."],
  [S.GC,  "Hey Google Cloud — Steph from Golden State. AI-powered merch recommendations and demand forecasting for drops."],
]

// ── Rejected sponsor requests ──────────────────────────────────────────────────
const SPONSOR_REJECTED = [
  [S.OG, "Hi Ordergroove — Steph from Golden State. Looked into embedded subscriptions but our merch model is drop-based, not replenishment."],
  [S.AS, "Hey AfterShip — Steph from Golden State. Already using Narvar for tracking. Decided to stay with our current setup."],
]

// ── Confirmed peer meetings → BOTH a Meeting row AND a CONFIRMED MeetingRequest ─
// dir: 'out' = Steph requested; 'in' = partner requested Steph
// [partnerKey, timeBlockId, dir, message]
const PEER_CONFIRMED = [
  [P.JL, tb(1,5), 'out', "Hey Jordan — Steph from Golden State. Both building DTC brands in very different categories. Would love to compare notes on scaling merch ops."],
  [P.KO, tb(1,6), 'out', "Hi Kwesi — Steph from Golden State. Premium brand positioning in DTC — luxury skincare and athlete brands have more in common than you'd think."],
  [P.MP, tb(1,7), 'out', "Hey Maya — Steph from Golden State. Urban Decay and athlete brands both rely on limited drops. Let's talk launch playbooks."],
  [P.AB, tb(2,5), 'in',  "Hey Steph — Aaliyah from Entireworld. Growth strategies for DTC brands with built-in audiences. Let's compare playbooks."],
  [P.RO, tb(2,6), 'in',  "Hey Steph — Ryan from Beautycounter. COO-to-founder chat on scaling ops when demand is unpredictable."],
]

// ── Outgoing peer requests (Steph → partner) ───────────────────────────────────
const PEER_OUT_APPROVED = [
  [P.HS, "Hi Hana — Steph from Golden State. SSENSE and athlete brands both play in premium streetwear. Would love to connect."],
  [P.CB, "Hey Chloe — Steph from Golden State. Both in the drop / limited-edition game. Kylie and Curry Brand have parallel challenges."],
]
const PEER_OUT_PENDING = [
  [P.AD, "Hi Amara — Steph from Golden State. Depop's resale model is interesting for authenticated athlete memorabilia."],
]

// ── Incoming peer requests (partner → Steph), PENDING ──────────────────────────
const PEER_IN_PENDING = [
  [P.G1, "Hi Steph — Alex from Charlotte Tilbury DTC. Your limited-drop strategy is legendary. Would love 15 minutes on building hype the right way."],
  [P.G2, "Hey Steph — Alex at Glossier. We both live and die by community-led launches. Coffee to trade playbooks?"],
  [P.G3, "Hi Steph — Ben from Fenty Beauty DTC. Athlete brands and celebrity beauty face the same scaling curve. Let's connect at eTail."],
]

async function main() {
  const prisma = createPrisma()
  try {
    const steph = await prisma.user.findFirst({ where: { email: STEPH_EMAIL }, select: { id: true, name: true } })
    if (!steph) throw new Error(`${STEPH_EMAIL} not found — run reset-test-accounts.mjs first`)
    const SC = steph.id
    console.log(`\n👤 ${steph.name} (${STEPH_EMAIL}) → id ${SC}`)

    const conf = await prisma.conference.findUnique({ where: { id: CONFERENCE_ID }, select: { id: true } })
    if (!conf) throw new Error(`Conference ${CONFERENCE_ID} not found`)

    // ── Resolve & filter partner ids that actually exist ─────────────────────
    const wantPartnerIds = [...new Set(Object.values(P))]
    const foundPartners = await prisma.user.findMany({ where: { id: { in: wantPartnerIds } }, select: { id: true, name: true } })
    const foundIds = new Set(foundPartners.map(p => p.id))
    const missing = wantPartnerIds.filter(id => !foundIds.has(id))
    if (missing.length) console.log(`⚠️  Skipping ${missing.length} missing partner id(s): ${missing.join(', ')}`)
    const hasPartner = (id) => foundIds.has(id)

    // Resolve time-block locations for SponsorMeeting.location
    const tbIds = [...new Set([...SPONSOR_CONFIRMED.map(r => r[1]), ...PEER_CONFIRMED.map(r => r[1])])]
    const tbRows = await prisma.timeBlock.findMany({ where: { id: { in: tbIds } }, select: { id: true, location: true } })
    const tbLoc = Object.fromEntries(tbRows.map(t => [t.id, t.location]))
    const missingTb = tbIds.filter(id => !(id in tbLoc))
    if (missingTb.length) throw new Error(`Missing time blocks: ${missingTb.join(', ')}`)

    // Filter valid bookmark session ids
    const foundSessions = await prisma.confSession.findMany({ where: { id: { in: BOOKMARKS } }, select: { id: true } })
    const validSessionIds = new Set(foundSessions.map(s => s.id))
    const missingSessions = BOOKMARKS.filter(id => !validSessionIds.has(id))
    if (missingSessions.length) console.log(`⚠️  Skipping ${missingSessions.length} missing session id(s)`)

    if (DRY) {
      console.log('\n(--dry) Would create:')
      console.log(`   Session bookmarks:        ${BOOKMARKS.length - missingSessions.length}`)
      console.log(`   Sponsor confirmed:        ${SPONSOR_CONFIRMED.length}  (+ SponsorMeeting each)`)
      console.log(`   Sponsor approved/pending/rejected: ${SPONSOR_APPROVED.length}/${SPONSOR_PENDING.length}/${SPONSOR_REJECTED.length}`)
      console.log(`   Peer confirmed (Meeting rows): ${PEER_CONFIRMED.filter(r => hasPartner(r[0])).length}`)
      console.log(`   Peer out approved/pending: ${PEER_OUT_APPROVED.filter(r => hasPartner(r[0])).length}/${PEER_OUT_PENDING.filter(r => hasPartner(r[0])).length}`)
      console.log(`   Peer inbound pending:     ${PEER_IN_PENDING.filter(r => hasPartner(r[0])).length}`)
      console.log('\nNo changes written.')
      return
    }

    // ── 1. Wipe Steph's existing rows (scoped to Steph only) ─────────────────
    console.log('\n🗑  Clearing Steph-owned rows…')
    const delMeeting = await prisma.meeting.deleteMany({ where: { OR: [{ organizerId: SC }, { attendeeAId: SC }, { attendeeBId: SC }] } })
    const delReq = await prisma.meetingRequest.deleteMany({ where: { OR: [{ requesterId: SC }, { targetUserId: SC }] } })
    const delSM = await prisma.sponsorMeeting.deleteMany({ where: { userId: SC } })
    const delBM = await prisma.sessionBookmark.deleteMany({ where: { userId: SC } })
    console.log(`   Meeting ${delMeeting.count} · MeetingRequest ${delReq.count} · SponsorMeeting ${delSM.count} · SessionBookmark ${delBM.count}`)

    // ── 2. Session bookmarks ─────────────────────────────────────────────────
    let bmN = 0
    for (const sessionId of BOOKMARKS) {
      if (!validSessionIds.has(sessionId)) continue
      await prisma.sessionBookmark.upsert({
        where: { userId_sessionId: { userId: SC, sessionId } },
        update: {},
        create: { userId: SC, sessionId },
      })
      bmN++
    }
    console.log(`📌 Session bookmarks: ${bmN}`)

    // ── 3. Confirmed sponsor meetings (request + SponsorMeeting) ──────────────
    let scN = 0
    for (const [sponsorId, tbId, msg] of SPONSOR_CONFIRMED) {
      await prisma.meetingRequest.create({
        data: { requesterId: SC, targetSponsorId: sponsorId, message: msg, status: 'CONFIRMED', priority: 'BEST_FIT', timeBlockId: tbId },
      })
      await prisma.sponsorMeeting.create({
        data: { sponsorId, userId: SC, timeBlockId: tbId, status: 'CONFIRMED', location: tbLoc[tbId] ?? null },
      })
      scN++
    }
    console.log(`🤝 Confirmed sponsor meetings: ${scN}`)

    // ── 4. Approved / pending / rejected sponsor requests ────────────────────
    for (const [sponsorId, msg] of SPONSOR_APPROVED)
      await prisma.meetingRequest.create({ data: { requesterId: SC, targetSponsorId: sponsorId, message: msg, status: 'APPROVED' } })
    for (const [sponsorId, msg] of SPONSOR_PENDING)
      await prisma.meetingRequest.create({ data: { requesterId: SC, targetSponsorId: sponsorId, message: msg, status: 'PENDING' } })
    for (const [sponsorId, msg] of SPONSOR_REJECTED)
      await prisma.meetingRequest.create({ data: { requesterId: SC, targetSponsorId: sponsorId, message: msg, status: 'REJECTED' } })
    console.log(`📨 Sponsor requests — approved ${SPONSOR_APPROVED.length} · pending ${SPONSOR_PENDING.length} · rejected ${SPONSOR_REJECTED.length}`)

    // ── 5. Confirmed peer meetings — Meeting row + CONFIRMED request ──────────
    let pcN = 0
    for (const [partnerId, tbId, dir, msg] of PEER_CONFIRMED) {
      if (!hasPartner(partnerId)) continue
      const requesterId = dir === 'in' ? partnerId : SC
      const targetUserId = dir === 'in' ? SC : partnerId
      await prisma.meeting.create({
        data: {
          conferenceId: CONFERENCE_ID, timeBlockId: tbId, organizerId: requesterId,
          attendeeAId: SC, attendeeBId: partnerId, status: 'CONFIRMED', notes: msg,
        },
      })
      await prisma.meetingRequest.create({
        data: { requesterId, targetUserId, message: msg, status: 'CONFIRMED', priority: 'BEST_FIT', timeBlockId: tbId },
      })
      pcN++
    }
    console.log(`👥 Confirmed peer meetings (Meeting + request): ${pcN}`)

    // ── 6. Outgoing peer requests (Steph → partner) ──────────────────────────
    let poA = 0, poP = 0
    for (const [partnerId, msg] of PEER_OUT_APPROVED) {
      if (!hasPartner(partnerId)) continue
      await prisma.meetingRequest.create({ data: { requesterId: SC, targetUserId: partnerId, message: msg, status: 'APPROVED' } })
      poA++
    }
    for (const [partnerId, msg] of PEER_OUT_PENDING) {
      if (!hasPartner(partnerId)) continue
      await prisma.meetingRequest.create({ data: { requesterId: SC, targetUserId: partnerId, message: msg, status: 'PENDING' } })
      poP++
    }

    // ── 7. Inbound peer requests (partner → Steph), PENDING ──────────────────
    let piN = 0
    for (const [partnerId, msg] of PEER_IN_PENDING) {
      if (!hasPartner(partnerId)) continue
      await prisma.meetingRequest.create({ data: { requesterId: partnerId, targetUserId: SC, message: msg, status: 'PENDING' } })
      piN++
    }
    console.log(`🔁 Peer requests — out approved ${poA} · out pending ${poP} · inbound pending ${piN}`)

    // ── 8. Verify ────────────────────────────────────────────────────────────
    console.log('\n🔎 Verifying Steph totals in Turso:')
    console.log('   SessionBookmark        :', await prisma.sessionBookmark.count({ where: { userId: SC } }))
    console.log('   Meeting (scheduled)    :', await prisma.meeting.count({ where: { OR: [{ attendeeAId: SC }, { attendeeBId: SC }] } }))
    console.log('   MeetingRequest out     :', await prisma.meetingRequest.count({ where: { requesterId: SC } }))
    console.log('   MeetingRequest inbound :', await prisma.meetingRequest.count({ where: { targetUserId: SC } }))
    console.log('   SponsorMeeting         :', await prisma.sponsorMeeting.count({ where: { userId: SC } }))
    console.log('\n✅ Steph demo data seeded.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
