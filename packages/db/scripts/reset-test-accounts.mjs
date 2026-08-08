// Reset the WBR test accounts against the live Turso database.
//
// What it does (idempotent):
//   1. Deletes the 5 legacy advertised demo login accounts.
//   2. Recreates the Gate Demo Exhibitor company, in its incomplete state.
//   3. Creates / upserts the 5 canonical accounts: Brand, Sponsor, WBR, and the
//      two gate demonstration accounts that are deliberately left blocked.
//   4. Adds them to the General chat channel.
//   5. Self-verifies each account's scrypt password + role/sponsor wiring.
//
// STEP 2 IS THE STATED RECOVERY PATH FOR A DELETED DEMONSTRATION COMPANY, and
// it is why that step exists at all. ensureCanonicalTestAccount() in
// ../src/test-accounts.ts restores that company's pinned columns on the sign-in
// path, but deliberately does NOT create the row when it is missing — a Sponsor
// belongs to a Conference, and writing event content from a login is a bigger
// act than a self-heal should take. This script is what puts it back, and it
// must run before step 3 because the sponsor demonstration account holds a
// foreign key to it.
//
// The ~1,000 seeded directory users are left untouched, so every app stays
// populated and demoable.
//
// Roles (see packages/db/src/app-access.ts for the access matrix):
//   WBR     → ORGANIZER (full admin RBAC in the web dashboard)
//   BRAND   → BRAND     (brand-side participant)
//   SPONSOR → SPONSOR   (sponsor rep, linked to the Tailor ERP sponsor company)
//
// Usage:
//   node packages/db/scripts/reset-test-accounts.mjs           # apply to Turso
//   node packages/db/scripts/reset-test-accounts.mjs --dry     # preview only
//
// Connects to the same Turso DB the apps use (TURSO_* from apps/web/.env.local,
// or from the environment if already set).

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const require = createRequire(import.meta.url)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DRY = process.argv.includes('--dry')

const scryptAsync = promisify(scrypt)
// Must match packages/db/src/index.ts hashPassword/verifyPassword defaults so the
// apps' verifyPassword() accepts these hashes.
const SCRYPT_N = 2048
const SCRYPT_R = 8
const SCRYPT_P = 1

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const buf = await scryptAsync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `${buf.toString('hex')}.${salt}.${SCRYPT_N}`
}

async function verifyPassword(password, stored) {
  const [hashed, salt, costStr] = stored.split('.')
  if (!hashed || !salt) return false
  const N = costStr ? parseInt(costStr, 10) : 16384
  const buf = await scryptAsync(password, salt, 64, { N, r: SCRYPT_R, p: SCRYPT_P })
  const a = Buffer.from(hashed, 'hex')
  return a.length === buf.length && timingSafeEqual(a, buf)
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

// ── The 5 legacy demo login accounts to erase ────────────────────────────────
const LEGACY_EMAILS = [
  'june@tailor.tech',
  'steph@curry.com',
  'staff@wbr.com',
  'sponsor@shopify.com',
  'sponsor@klaviyo.com',
]

// ── The Tailor ERP sponsor company (from seed.ts sponsorDefs) ─────────────────
const TAILOR_SPONSOR_ID = 'cmngb2h4h0007vm28mbcpxjg5'

// ── The gate demonstration company, read rather than copied ──────────────────
// Imported from the module that defines it instead of being restated here, so
// this script and the sign-in restore in ../src/test-accounts.ts cannot drift
// into two different ideas of what "incomplete" means. Node strips the types
// natively; scripts/migrate-sponsor-card-fields.mjs already imports
// prisma/seed-sponsors.ts the same way. The module imports nothing itself, so
// this pulls in no database client.
const { GATE_DEMO_SPONSOR, GATE_DEMO_SPONSOR_ID } = await import(
  join(ROOT, 'packages/db/src/gate-demo-sponsor.ts')
)

// The one owner of the MeetingRequirementSetting table. Imported rather than
// reimplemented as raw SQL here, for the reason stated at that model in
// prisma/schema.prisma: the table is created defensively at runtime rather than
// by a migration, and the column shape must match that module's DDL exactly, so
// a second copy of it in this file is precisely the drift the warning is about.
// The module is self-contained by its own rule — type-only imports, client
// always injected by the caller — so this pulls in no database client.
const { saveMeetingRequirementSettings } = await import(
  join(ROOT, 'packages/db/src/meeting-engine.ts')
)

const HEADSHOT = (id) => `https://images.unsplash.com/${id}?w=400&h=400&q=80&fit=crop&crop=face`

// ── The 5 canonical test accounts ─────────────────────────────────────────────
// Keep in sync with packages/db/src/test-accounts.ts (the runtime-enforced copy)
// and packages/db/prisma/seed.ts (demoUsers).
//
// companySize / annualRevenue / solutionsSeeking are REQUIRED by the attendee
// app's onboarding gate. An account missing any of them is routed to the
// onboarding checklist instead of the app — including the ORGANIZER and SPONSOR
// accounts, since the attendee app admits those roles too.
const ACCOUNTS = [
  {
    id: 'test-wbr',
    email: 'wbr@test.com',
    password: 'password123',
    name: 'WBR',
    role: 'ORGANIZER', // full admin — the WBR tier
    company: 'WBR',
    jobTitle: 'Conference Organizer',
    sponsorId: null,
    image: HEADSHOT('photo-1560250097-0b93528c311a'),
    companySize: 'SMB',
    annualRevenue: '1M-10M',
    solutionsSeeking: JSON.stringify(['Analytics & Reporting', 'AI & Automation']),
  },
  {
    // The Brand-tier account, restored as Steph Curry (was demo-attendee-steph).
    id: 'test-brand',
    email: 'stephcurry@test.com',
    password: 'password123',
    name: 'Steph Curry',
    role: 'BRAND',
    company: 'Golden State Warriors',
    jobTitle: 'Point Guard',
    bio: 'Point guard for the Golden State Warriors. At WBR to scout commerce, brand, and loyalty tooling for the next signature drop.',
    sponsorId: null,
    image: HEADSHOT('photo-1507003211169-0a1dd7228f2d'),
    companySize: 'ENTERPRISE',
    annualRevenue: '250M+',
    solutionsSeeking: JSON.stringify(['AI & Automation', 'Personalization', 'Analytics & Reporting']),
    solutionsOffering: JSON.stringify(['Email Marketing', 'Loyalty & Rewards']),
  },
  {
    id: 'test-sponsor',
    email: 'sponsor@test.com',
    password: 'password123',
    name: 'Sponsor',
    role: 'SPONSOR',
    company: 'Tailor ERP',
    jobTitle: 'Partner Manager',
    sponsorId: TAILOR_SPONSOR_ID,
    image: HEADSHOT('photo-1519085360753-af0119f7cbe7'),
    companySize: 'MIDMARKET',
    annualRevenue: '10M-50M',
    solutionsSeeking: JSON.stringify(['B2B Commerce', 'Marketplace Integration']),
  },
  {
    // DELIBERATELY INCOMPLETE — the one account meant to hit the onboarding
    // gate, so it can be demonstrated on cue. Do NOT "fix" it; it is working
    // when it is blocked. solutionsSeeking is an explicitly empty array.
    id: 'test-onboarding-demo',
    email: 'onboarding-demo@test.com',
    password: 'password123',
    name: 'Onboarding Gate Demo',
    role: 'ATTENDEE',
    company: 'Gate Demo Co',
    jobTitle: 'Head of eCommerce',
    sponsorId: null,
    image: HEADSHOT('photo-1507003211169-0a1dd7228f2d'),
    companySize: 'MIDMARKET',
    annualRevenue: '10M-50M',
    solutionsSeeking: JSON.stringify([]),
  },
  {
    // DELIBERATELY BLOCKED ON THE SPONSOR PORTAL — the sponsor-side counterpart
    // of the account above. What is incomplete is the Gate Demo Exhibitor
    // COMPANY it links to, not this person: the six fields below are all filled
    // on purpose, because the attendee app admits the SPONSOR role and short
    // fields here would block this account there too.
    id: 'test-sponsor-onboarding-demo',
    email: 'sponsor-onboarding-demo@test.com',
    password: 'password123',
    name: 'Sponsor Gate Demo',
    role: 'SPONSOR',
    company: 'Gate Demo Exhibitor',
    jobTitle: 'Exhibitor Manager',
    sponsorId: GATE_DEMO_SPONSOR_ID,
    image: HEADSHOT('photo-1500648767791-00dcc994a43e'),
    companySize: 'SMB',
    annualRevenue: '1M-10M',
    solutionsSeeking: JSON.stringify(['Analytics & Reporting']),
  },
]

async function main() {
  const prisma = createPrisma()
  try {
    // Sanity: the Tailor sponsor the Sponsor account links to must exist.
    const tailor = await prisma.sponsor.findUnique({
      where: { id: TAILOR_SPONSOR_ID },
      select: { id: true, name: true, conferenceId: true },
    })
    if (!tailor) throw new Error(`Tailor sponsor ${TAILOR_SPONSOR_ID} not found — cannot wire the Sponsor account`)
    console.log(`   Sponsor company link: ${tailor.name} (${tailor.id})`)

    // ── 1. Erase the legacy demo accounts ────────────────────────────────────
    const doomed = await prisma.user.findMany({
      where: { email: { in: LEGACY_EMAILS } },
      select: { id: true, email: true },
    })
    console.log(`\n🗑  Legacy accounts found to erase: ${doomed.length}`)
    doomed.forEach((u) => console.log(`   - ${u.email} (${u.id})`))

    if (!DRY && doomed.length) {
      const ids = doomed.map((u) => u.id)
      // Meeting is the only relation without an onDelete cascade — clear any
      // rows first so the user delete can never hit a Restrict.
      await prisma.meeting.deleteMany({
        where: { OR: [{ organizerId: { in: ids } }, { attendeeAId: { in: ids } }, { attendeeBId: { in: ids } }] },
      })
      const { count } = await prisma.user.deleteMany({ where: { id: { in: ids } } })
      console.log(`   Deleted ${count} user(s) (dependent rows cascaded).`)
    }

    // ── 2. Recreate the gate demonstration company ───────────────────────────
    //
    // Full overwrite on an existing row, unlike the twenty real exhibitors,
    // whose seed update branch is deliberately narrow so a stray run cannot
    // destroy an organizer's edits (finding F-10). Nothing on this row is
    // organizer-authored — every value it should hold is in
    // ../src/gate-demo-sponsor.ts — so returning it to that state is the whole
    // point, including putting a hand-completed contact back to empty.
    {
      const { id, ...fields } = GATE_DEMO_SPONSOR
      // The SAME conference the real exhibitors are on, taken from Tailor ERP
      // above rather than from `conference.findFirst()`. findFirst has no
      // ordering, so on a database holding more than one conference row — which
      // the shared one may — it can return a previous event, and the
      // demonstration company would be created against that instead. It would
      // still link to its account by id and still block the gate, but it would
      // be absent from every exhibitor screen that filters by the current
      // conference, which is where the demonstration looks for it. Anchoring to
      // a company that is definitely on the right conference removes the
      // question.
      const conferenceId = tailor.conferenceId
      const before = await prisma.sponsor.findUnique({
        where: { id },
        select: { contactName: true, contactEmail: true, conferenceId: true },
      })
      console.log(
        `\n🎭 Gate demonstration company: ${GATE_DEMO_SPONSOR.name} (${id}) on conference ${conferenceId}` +
          (before
            ? `\n   exists — contactName ${JSON.stringify(before.contactName)}, contactEmail ${JSON.stringify(before.contactEmail)}, conference ${before.conferenceId}`
            : `\n   absent — will be created`),
      )
      if (!DRY) {
        await prisma.sponsor.upsert({
          where: { id },
          // `conferenceId` is in the update as well as the create, so a row
          // created earlier against the wrong conference is corrected rather
          // than left where it is. Safe here for the same reason the wide
          // update branch is: nothing on this row is organizer-authored.
          update: { conferenceId, ...fields },
          create: { id, conferenceId, ...fields },
        })
        const after = await prisma.sponsor.findUnique({
          where: { id },
          select: { contactName: true, contactEmail: true, boothNumber: true },
        })
        // Asserted rather than assumed: this row is only useful to the
        // demonstration while it is short its contact, and only safe while it
        // holds no booth number (UF-60 — an eleventh booth-carrying company
        // moves every marker on the drawn exhibit hall map).
        if (after?.contactName !== null || after?.contactEmail !== null) {
          throw new Error(
            `Gate demonstration company is not incomplete after the write: ` +
              `contactName ${JSON.stringify(after?.contactName)}, contactEmail ${JSON.stringify(after?.contactEmail)}`,
          )
        }
        if (after?.boothNumber !== null) {
          throw new Error(
            `Gate demonstration company carries a booth number (${JSON.stringify(after?.boothNumber)}) — it must not exhibit`,
          )
        }
        // Its meeting requirement, pinned to zero through the same per-company
        // override the seed writes. Without this the recovery path is
        // incomplete in a way that is easy to miss: the company comes back but
        // its override does not, `requiredMeetingsForSponsor()` falls through
        // to the sponsor default, and the showtime fill-rate screens start
        // counting a prop as an exhibitor with unmet meetings.
        await saveMeetingRequirementSettings(prisma, {
          sponsorOverrides: [{ sponsorId: GATE_DEMO_SPONSOR_ID, required: 0 }],
        })
        console.log('   written — holds no contact name, no contact email, no booth number, meeting requirement 0')
      }
    }

    // ── 3. Create the canonical accounts ─────────────────────────────────────
    console.log(`\n✨ Creating ${ACCOUNTS.length} test accounts:`)
    for (const a of ACCOUNTS) {
      const passwordHash = await hashPassword(a.password)
      const data = {
        email: a.email,
        name: a.name,
        role: a.role,
        password: passwordHash,
        company: a.company,
        jobTitle: a.jobTitle,
        sponsorId: a.sponsorId,
        image: a.image,
        ...(a.bio ? { bio: a.bio } : {}),
        // Required by the attendee onboarding gate — without these, a reset
        // recreates accounts that are immediately blocked by it.
        ...(a.companySize ? { companySize: a.companySize } : {}),
        ...(a.annualRevenue ? { annualRevenue: a.annualRevenue } : {}),
        ...(a.solutionsSeeking ? { solutionsSeeking: a.solutionsSeeking } : {}),
        ...(a.solutionsOffering ? { solutionsOffering: a.solutionsOffering } : {}),
      }
      console.log(`   - ${a.name.padEnd(8)} ${a.email} / ${a.password}  (role ${a.role}${a.sponsorId ? `, sponsor ${a.sponsorId}` : ''})`)
      if (DRY) continue

      // Upsert-by-email, with an id-collision fallback (mirrors seed.ts).
      const byEmail = await prisma.user.findUnique({ where: { email: a.email } })
      if (byEmail) {
        await prisma.user.update({ where: { email: a.email }, data })
      } else {
        const byId = await prisma.user.findUnique({ where: { id: a.id } })
        if (byId) await prisma.user.update({ where: { id: a.id }, data })
        else await prisma.user.create({ data: { id: a.id, ...data } })
      }
    }

    if (DRY) {
      console.log('\n(--dry) No changes written.')
      return
    }

    // ── 4. Add the accounts to the General chat channel ──────────────────────
    const general = await prisma.chatRoom.findFirst({ where: { type: 'CHANNEL', name: 'General' }, select: { id: true } })
    if (general) {
      for (const a of ACCOUNTS) {
        const u = await prisma.user.findUnique({ where: { email: a.email }, select: { id: true } })
        if (u) {
          await prisma.chatMember
            .upsert({ where: { roomId_userId: { roomId: general.id, userId: u.id } }, update: {}, create: { roomId: general.id, userId: u.id } })
            .catch(() => {})
        }
      }
      console.log(`\n💬 Added the ${ACCOUNTS.length} accounts to the General channel.`)
    }

    // ── 5. Self-verify ───────────────────────────────────────────────────────
    console.log('\n🔎 Verifying…')
    let ok = true
    for (const a of ACCOUNTS) {
      const u = await prisma.user.findUnique({
        where: { email: a.email },
        select: { id: true, email: true, role: true, sponsorId: true, password: true },
      })
      const passOk = u?.password ? await verifyPassword(a.password, u.password) : false
      const roleOk = u?.role === a.role
      const sponsorOk = (u?.sponsorId ?? null) === (a.sponsorId ?? null)
      const good = !!u && passOk && roleOk && sponsorOk
      ok = ok && good
      console.log(`   ${good ? '✓' : '✗'} ${a.email} — role ${u?.role ?? '∅'}, sponsor ${u?.sponsorId ?? '∅'}, password ${passOk ? 'valid' : 'INVALID'}`)
    }
    const stillThere = await prisma.user.count({ where: { email: { in: LEGACY_EMAILS } } })
    console.log(`   ${stillThere === 0 ? '✓' : '✗'} Legacy accounts remaining: ${stillThere}`)
    const total = await prisma.user.count()
    console.log(`   Total users now: ${total}`)

    if (!ok || stillThere !== 0) {
      console.error('\n❌ Verification FAILED')
      process.exit(1)
    }
    console.log('\n✅ Test accounts reset complete.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
