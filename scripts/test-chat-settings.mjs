#!/usr/bin/env node
// Logic + persistence test for the admin chat-settings feature
// (packages/db/src/chat-settings.ts). No server needed — exercises the pure
// decision functions and the DB layer against a scratch SQLite database whose
// DDL is cloned from the real dev DB, so schema drift is impossible. The
// ChatMessagingPermission table itself is created defensively at runtime by the
// module under test (mirrors the production Turso path).
//
// Covers:
//   1. '@conference/db' re-exports './chat-settings' (index.ts static check).
//   2. classifyActor / classifyTarget / isVendorAffiliated.
//   3. evaluateMessagingPermission — full vendor + staff + neutral matrix,
//      incl. the global master switch overriding per-vendor rules.
//   4. Normalizers coerce partial/hostile input to strict booleans (default on).
//   5. Persistence: defaults before any write; save + read-back roundtrip for
//      global, per-vendor and per-staff; targeted single-row readers.
//
//   node scripts/test-chat-settings.mjs
//
// Exits 0 on all-pass, 1 on failure.

import { mkdtempSync, readFileSync } from 'node:fs'
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

const mod = await import(join(ROOT, 'packages/db/src/chat-settings.ts'))
const {
  classifyActor,
  classifyTarget,
  isVendorAffiliated,
  evaluateMessagingPermission,
  normalizeVendorGlobal,
  normalizeVendorSettings,
  normalizeStaffSettings,
  getAllChatMessagingSettings,
  saveChatMessagingSettings,
  getVendorGlobalEnabled,
  getVendorSettings,
  getStaffSettings,
  DEFAULT_VENDOR_SETTINGS,
  DEFAULT_STAFF_SETTINGS,
} = mod

// ─── 1. re-export ─────────────────────────────────────────────────────────────
console.log('[@conference/db re-export]')
{
  const indexSrc = readFileSync(join(ROOT, 'packages/db/src/index.ts'), 'utf8')
  check("index.ts re-exports './chat-settings'", /export\s+\*\s+from\s+['"]\.\/chat-settings['"]/.test(indexSrc))
}

// ─── 2. classification ────────────────────────────────────────────────────────
console.log('\n[classification]')
{
  check('vendor by sponsorId', isVendorAffiliated({ role: 'ATTENDEE', sponsorId: 'sp1' }) === true)
  check('vendor by SPONSOR role', isVendorAffiliated({ role: 'SPONSOR', sponsorId: null }) === true)
  check('plain attendee is not vendor', isVendorAffiliated({ role: 'ATTENDEE', sponsorId: null }) === false)

  check('actor: staff', classifyActor({ role: 'STAFF' }) === 'staff')
  check('actor: vendor rep (sponsorId + ATTENDEE role)', classifyActor({ role: 'ATTENDEE', sponsorId: 'sp1' }) === 'vendor')
  check('actor: plain attendee → other', classifyActor({ role: 'ATTENDEE' }) === 'other')
  check('actor: organizer → other', classifyActor({ role: 'ORGANIZER' }) === 'other')

  check('target: attendee', classifyTarget({ role: 'ATTENDEE' }) === 'attendee')
  check('target: speaker', classifyTarget({ role: 'SPEAKER' }) === 'speaker')
  check('target: vendor (sponsorId wins over role)', classifyTarget({ role: 'SPEAKER', sponsorId: 'sp1' }) === 'vendor')
  check('target: staff', classifyTarget({ role: 'STAFF' }) === 'staff')
  check('target: organizer → other', classifyTarget({ role: 'ORGANIZER' }) === 'other')
}

// ─── 3. evaluate matrix ───────────────────────────────────────────────────────
console.log('\n[evaluateMessagingPermission — vendor]')
{
  const allOn = { vendorGlobalEnabled: true, vendorSettings: { toAttendees: true, toSpeakers: true }, staffSettings: DEFAULT_STAFF_SETTINGS }
  check('vendor→attendee allowed when on', evaluateMessagingPermission({ actorKind: 'vendor', targetKind: 'attendee', ...allOn }).allowed === true)
  check('vendor→speaker allowed when on', evaluateMessagingPermission({ actorKind: 'vendor', targetKind: 'speaker', ...allOn }).allowed === true)

  const globalOff = { ...allOn, vendorGlobalEnabled: false }
  const gA = evaluateMessagingPermission({ actorKind: 'vendor', targetKind: 'attendee', ...globalOff })
  check('global off blocks vendor→attendee', gA.allowed === false && gA.code === 'VENDOR_MESSAGING_DISABLED')
  check('global off blocks vendor→speaker', evaluateMessagingPermission({ actorKind: 'vendor', targetKind: 'speaker', ...globalOff }).allowed === false)
  check('global off overrides per-vendor allow', evaluateMessagingPermission({
    actorKind: 'vendor', targetKind: 'attendee',
    vendorGlobalEnabled: false, vendorSettings: { toAttendees: true, toSpeakers: true }, staffSettings: DEFAULT_STAFF_SETTINGS,
  }).allowed === false)

  const attOff = { vendorGlobalEnabled: true, vendorSettings: { toAttendees: false, toSpeakers: true }, staffSettings: DEFAULT_STAFF_SETTINGS }
  const r1 = evaluateMessagingPermission({ actorKind: 'vendor', targetKind: 'attendee', ...attOff })
  check('per-vendor attendees off blocks attendee', r1.allowed === false && r1.code === 'VENDOR_BLOCKED_ATTENDEES')
  check('per-vendor attendees off still allows speaker', evaluateMessagingPermission({ actorKind: 'vendor', targetKind: 'speaker', ...attOff }).allowed === true)
  check('vendor→vendor never gated by this feature', evaluateMessagingPermission({ actorKind: 'vendor', targetKind: 'vendor', ...attOff }).allowed === true)
}

console.log('\n[evaluateMessagingPermission — staff]')
{
  const base = { vendorGlobalEnabled: true, vendorSettings: DEFAULT_VENDOR_SETTINGS }
  const allOn = { ...base, staffSettings: { toAttendees: true, toVendors: true, toSpeakers: true } }
  check('staff→attendee allowed when on', evaluateMessagingPermission({ actorKind: 'staff', targetKind: 'attendee', ...allOn }).allowed === true)

  const vOff = { ...base, staffSettings: { toAttendees: true, toVendors: false, toSpeakers: true } }
  const rv = evaluateMessagingPermission({ actorKind: 'staff', targetKind: 'vendor', ...vOff })
  check('staff→vendor blocked when vendors off', rv.allowed === false && rv.code === 'STAFF_BLOCKED_VENDORS')
  check('staff→attendee still allowed', evaluateMessagingPermission({ actorKind: 'staff', targetKind: 'attendee', ...vOff }).allowed === true)

  const sOff = { ...base, staffSettings: { toAttendees: false, toVendors: true, toSpeakers: false } }
  check('staff→attendee blocked', evaluateMessagingPermission({ actorKind: 'staff', targetKind: 'attendee', ...sOff }).allowed === false)
  check('staff→speaker blocked', evaluateMessagingPermission({ actorKind: 'staff', targetKind: 'speaker', ...sOff }).allowed === false)
}

console.log('\n[evaluateMessagingPermission — neutral]')
{
  const cfg = { vendorGlobalEnabled: false, vendorSettings: { toAttendees: false, toSpeakers: false }, staffSettings: { toAttendees: false, toVendors: false, toSpeakers: false } }
  check('attendee actor never restricted', evaluateMessagingPermission({ actorKind: 'other', targetKind: 'attendee', ...cfg }).allowed === true)
}

// ─── 4. normalizers ───────────────────────────────────────────────────────────
console.log('\n[normalizers]')
{
  check('vendorGlobal default enabled', normalizeVendorGlobal(undefined).enabled === true)
  check('vendorGlobal explicit false', normalizeVendorGlobal({ enabled: false }).enabled === false)
  check('vendorSettings default all true', (() => { const v = normalizeVendorSettings(undefined); return v.toAttendees && v.toSpeakers })())
  check('vendorSettings partial keeps default for missing', (() => { const v = normalizeVendorSettings({ toAttendees: false }); return v.toAttendees === false && v.toSpeakers === true })())
  check('staffSettings coerces truthy junk to strict bool', (() => { const s = normalizeStaffSettings({ toAttendees: 'yes', toVendors: false }); return s.toAttendees === true && s.toVendors === false && s.toSpeakers === true })())
}

// ─── 5. persistence (scratch DB) ──────────────────────────────────────────────
console.log('\n[persistence]')

const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')
const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-chat-settings-'))
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

{
  // Defaults before any write (table auto-created by ensureChatSettingsTable).
  check('vendor global defaults enabled', (await getVendorGlobalEnabled(prisma)) === true)
  const vdef = await getVendorSettings(prisma, 'nonexistent')
  check('vendor settings default all-on', vdef.toAttendees === true && vdef.toSpeakers === true)
  const sdef = await getStaffSettings(prisma, 'nobody')
  check('staff settings default all-on', sdef.toAttendees && sdef.toVendors && sdef.toSpeakers)

  const empty = await getAllChatMessagingSettings(prisma)
  check('empty snapshot: global on, no rows', empty.vendorGlobal.enabled === true && Object.keys(empty.vendors).length === 0 && Object.keys(empty.staff).length === 0)

  // Write a mix.
  await saveChatMessagingSettings(prisma, {
    vendorGlobal: { enabled: false },
    vendors: [{ sponsorId: 'sp-acme', settings: { toAttendees: false, toSpeakers: true } }],
    staff: [{ userId: 'u-staff', settings: { toAttendees: true, toVendors: false, toSpeakers: true } }],
  })

  check('vendor global persisted false', (await getVendorGlobalEnabled(prisma)) === false)
  const v = await getVendorSettings(prisma, 'sp-acme')
  check('vendor row persisted', v.toAttendees === false && v.toSpeakers === true)
  const s = await getStaffSettings(prisma, 'u-staff')
  check('staff row persisted', s.toAttendees === true && s.toVendors === false && s.toSpeakers === true)

  const snap = await getAllChatMessagingSettings(prisma)
  check('snapshot reflects all writes',
    snap.vendorGlobal.enabled === false &&
    snap.vendors['sp-acme']?.toAttendees === false &&
    snap.staff['u-staff']?.toVendors === false)

  // Idempotent update (ON CONFLICT).
  await saveChatMessagingSettings(prisma, { vendorGlobal: { enabled: true } })
  check('vendor global updated back to true (upsert)', (await getVendorGlobalEnabled(prisma)) === true)
  const v2 = await getVendorSettings(prisma, 'sp-acme')
  check('untouched vendor row unchanged after global update', v2.toAttendees === false && v2.toSpeakers === true)
}

await prisma.$disconnect()

console.log(failures === 0 ? '\n✓ all chat-settings logic/persistence checks passed' : `\n✗ ${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
