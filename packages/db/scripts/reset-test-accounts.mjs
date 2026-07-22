// Reset the WBR test accounts against the live Turso database.
//
// What it does (idempotent):
//   1. Deletes the 5 legacy advertised demo login accounts.
//   2. Creates / upserts the 3 canonical test accounts: Brand, Sponsor, WBR.
//   3. Adds the 3 accounts to the General chat channel.
//   4. Self-verifies each new account's scrypt password + role/sponsor wiring.
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

const HEADSHOT = (id) => `https://images.unsplash.com/${id}?w=400&h=400&q=80&fit=crop&crop=face`

// ── The 3 canonical test accounts ─────────────────────────────────────────────
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
  },
  {
    id: 'test-brand',
    email: 'brand@test.com',
    password: 'password123',
    name: 'Brand',
    role: 'BRAND',
    company: 'Glossier',
    jobTitle: 'Head of DTC',
    sponsorId: null,
    image: HEADSHOT('photo-1580489944761-15a19d654956'),
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
  },
]

async function main() {
  const prisma = createPrisma()
  try {
    // Sanity: the Tailor sponsor the Sponsor account links to must exist.
    const tailor = await prisma.sponsor.findUnique({ where: { id: TAILOR_SPONSOR_ID }, select: { id: true, name: true } })
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

    // ── 2. Create the 3 canonical accounts ───────────────────────────────────
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

    // ── 3. Add the 3 accounts to the General chat channel ────────────────────
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
      console.log('\n💬 Added the 3 accounts to the General channel.')
    }

    // ── 4. Self-verify ───────────────────────────────────────────────────────
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
