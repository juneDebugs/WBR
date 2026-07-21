#!/usr/bin/env node
// Enforcement test for checkMessagingPermission (packages/db/src/chat-settings.ts)
// — the single composite gate wired into the attendee app's friend-request and
// new-DM code paths. Runs against a scratch SQLite DB cloned from the real dev
// DB, with real User + Sponsor rows, so it exercises the full load-classify-
// read-evaluate path (not just the pure decision function).
//
// Covers:
//   1. Neutral actors (attendee/organizer) are never gated → allow, and do so
//      without needing any settings rows.
//   2. Vendor rep (User.sponsorId set) → attendee/speaker gated by the global
//      switch and the per-vendor row; blocked target carries a reason code.
//   3. SPONSOR-role demo account (no sponsorId) still blocked by the global off.
//   4. Staff → attendee/vendor/speaker gated by the per-staff row.
//   5. Missing target → allow (downstream surfaces "User not found").
//   6. Fail-open default: with no rows written, every vendor/staff send allowed.
//
//   node scripts/test-chat-permission-enforcement.mjs
//
// Exits 0 on all-pass, 1 on failure.

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DB = join(ROOT, 'packages/db/prisma/dev.db')

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const { checkMessagingPermission, saveChatMessagingSettings } = await import(join(ROOT, 'packages/db/src/chat-settings.ts'))

// ─── Scratch DB ───────────────────────────────────────────────────────────────
const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')
const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-chat-enforce-'))
const scratchPath = join(scratchDir, 'test.db')

const source = createClient({ url: `file:${SOURCE_DB}` })
const ddl = await source.execute(
  `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
   ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid`,
)
source.close?.()
const scratch = createClient({ url: `file:${scratchPath}` })
for (const row of ddl.rows) await scratch.execute(row.sql)
scratch.close?.()

process.env.DATABASE_URL = `file:${scratchPath}`
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
const { PrismaClient } = req('@prisma/client')
const prisma = new PrismaClient()

// A Sponsor company + a conference it belongs to (Sponsor.conferenceId is NOT NULL).
const conf = await prisma.conference.create({
  data: { name: 'Test Conf', startDate: new Date(), endDate: new Date() },
})
const acme = await prisma.sponsor.create({ data: { conferenceId: conf.id, name: 'Acme Corp', tier: 'GOLD' } })

async function mkUser(name, role, sponsorId = null) {
  return prisma.user.create({
    data: { email: `${name.toLowerCase()}@example.com`, name, role, sponsorId },
  })
}
const attendee = await mkUser('Attendee', 'ATTENDEE')
const speaker = await mkUser('Speaker', 'SPEAKER')
const vendorRep = await mkUser('VendorRep', 'ATTENDEE', acme.id) // genuine rep: role ATTENDEE + sponsorId
const demoSponsor = await mkUser('DemoSponsor', 'SPONSOR') // placeholder account, no sponsorId
const staff = await mkUser('Staffer', 'STAFF')
const organizer = await mkUser('Organizer', 'ORGANIZER')

const asActor = u => ({ id: u.id, role: u.role, sponsorId: u.sponsorId })

// ─── 6 / 1. Fail-open defaults + neutral actors ───────────────────────────────
console.log('[defaults & neutral actors]')
{
  check('vendor→attendee allowed by default', (await checkMessagingPermission(prisma, asActor(vendorRep), attendee.id)).allowed === true)
  check('vendor→speaker allowed by default', (await checkMessagingPermission(prisma, asActor(vendorRep), speaker.id)).allowed === true)
  check('staff→attendee allowed by default', (await checkMessagingPermission(prisma, asActor(staff), attendee.id)).allowed === true)
  check('attendee→attendee always allowed', (await checkMessagingPermission(prisma, asActor(attendee), speaker.id)).allowed === true)
  check('organizer→attendee always allowed', (await checkMessagingPermission(prisma, asActor(organizer), attendee.id)).allowed === true)
}

// ─── 2. Per-vendor + global switch ────────────────────────────────────────────
console.log('\n[vendor gating]')
{
  await saveChatMessagingSettings(prisma, {
    vendors: [{ sponsorId: acme.id, settings: { toAttendees: false, toSpeakers: true } }],
  })
  const a = await checkMessagingPermission(prisma, asActor(vendorRep), attendee.id)
  check('vendor→attendee blocked by per-vendor row', a.allowed === false && a.code === 'VENDOR_BLOCKED_ATTENDEES', JSON.stringify(a))
  check('vendor→speaker still allowed', (await checkMessagingPermission(prisma, asActor(vendorRep), speaker.id)).allowed === true)

  // Global off overrides everything.
  await saveChatMessagingSettings(prisma, { vendorGlobal: { enabled: false } })
  const g = await checkMessagingPermission(prisma, asActor(vendorRep), speaker.id)
  check('global off blocks vendor→speaker (overrides per-vendor allow)', g.allowed === false && g.code === 'VENDOR_MESSAGING_DISABLED', JSON.stringify(g))

  // ─── 3. Demo SPONSOR account (no sponsorId) still blocked by global ─────────
  const d = await checkMessagingPermission(prisma, asActor(demoSponsor), attendee.id)
  check('SPONSOR-role demo account blocked by global off', d.allowed === false && d.code === 'VENDOR_MESSAGING_DISABLED')

  // Restore global on for later checks.
  await saveChatMessagingSettings(prisma, { vendorGlobal: { enabled: true } })
  check('vendor→attendee still blocked by lingering per-vendor row after global re-enabled',
    (await checkMessagingPermission(prisma, asActor(vendorRep), attendee.id)).allowed === false)
}

// ─── 4. Per-staff ─────────────────────────────────────────────────────────────
console.log('\n[staff gating]')
{
  await saveChatMessagingSettings(prisma, {
    staff: [{ userId: staff.id, settings: { toAttendees: false, toVendors: false, toSpeakers: true } }],
  })
  const a = await checkMessagingPermission(prisma, asActor(staff), attendee.id)
  check('staff→attendee blocked', a.allowed === false && a.code === 'STAFF_BLOCKED_ATTENDEES', JSON.stringify(a))
  const v = await checkMessagingPermission(prisma, asActor(staff), vendorRep.id)
  check('staff→vendor blocked (target vendorRep classified as vendor)', v.allowed === false && v.code === 'STAFF_BLOCKED_VENDORS', JSON.stringify(v))
  check('staff→speaker still allowed', (await checkMessagingPermission(prisma, asActor(staff), speaker.id)).allowed === true)

  // A different staffer with no row is unaffected (defaults on).
  const staff2 = await mkUser('Staffer2', 'STAFF')
  check('staffer without a row is unrestricted', (await checkMessagingPermission(prisma, asActor(staff2), attendee.id)).allowed === true)
}

// ─── 5. Missing target ────────────────────────────────────────────────────────
console.log('\n[missing target]')
{
  check('missing target → allow (downstream handles not-found)',
    (await checkMessagingPermission(prisma, asActor(vendorRep), 'does-not-exist')).allowed === true)
}

await prisma.$disconnect()

console.log(failures === 0 ? '\n✓ all enforcement checks passed' : `\n✗ ${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
