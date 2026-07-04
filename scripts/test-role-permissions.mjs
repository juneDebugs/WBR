#!/usr/bin/env node
// Unit tests for the role permissions engine (apps/web/lib/permissions.ts).
//
// These are pure-logic tests — no server, no database. They import the REAL
// module (Node 24 strips the TypeScript types natively) so there is no second
// copy of the rules to drift out of sync. They lock in the two guarantees the
// Staff → Roles & Permissions feature depends on:
//
//   1. The permission universe stays in lockstep with the sidebar sections.
//   2. Anti-lockout: an Organizer can never lose access to the role manager
//      (`staff`), no matter what payload is thrown at normalizePermissions().
//
//   node scripts/test-role-permissions.mjs
//
// See scripts/test-role-permissions-api.mjs for the over-HTTP integration test.

import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const modUrl = pathToFileURL(join(ROOT, 'apps/web/lib/permissions.ts')).href

let failures = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const eqSet = (a, b) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')

const m = await import(modUrl)

const {
  PERMISSION_SECTIONS, ALL_PERMISSION_KEYS, MANAGEABLE_ROLES,
  LOCKED_KEYS_BY_ROLE, DEFAULT_PERMISSIONS, DEFAULT_DESCRIPTIONS,
  isManageableRole, normalizePermissions, defaultRoleConfig,
  hasPermission, visibleKeysFor,
} = m

// The 14 nav destinations that carry a permission, grouped as in the sidebar.
// This is the INDEPENDENT oracle — if the module and the sidebar drift, this
// literal is what forces the discussion.
const EXPECTED_KEYS = [
  'calendar', 'agenda', 'speakers',
  'meetings', 'timeBlocks',
  'attendees', 'staff', 'sponsors',
  'chat', 'email',
  'integrations', 'appSettings', 'access', 'export',
]
const ADMIN_SECTION_KEYS = ['integrations', 'appSettings', 'access', 'export']

console.log('[universe]')
check('14 permission keys', ALL_PERMISSION_KEYS.length === 14, `got ${ALL_PERMISSION_KEYS.length}`)
check('keys match the expected sidebar universe', eqSet(ALL_PERMISSION_KEYS, EXPECTED_KEYS),
  `got ${JSON.stringify(ALL_PERMISSION_KEYS)}`)
check('keys are unique', new Set(ALL_PERMISSION_KEYS).size === ALL_PERMISSION_KEYS.length)
const flatFromSections = PERMISSION_SECTIONS.flatMap(s => s.items.map(i => i.key))
check('ALL_PERMISSION_KEYS == flattened sections (order-preserving)',
  flatFromSections.join(',') === ALL_PERMISSION_KEYS.join(','))
const hrefs = PERMISSION_SECTIONS.flatMap(s => s.items.map(i => i.href))
check('every item has a unique href', new Set(hrefs).size === hrefs.length)
check('no item points at /dashboard (Overview is always-on, not a key)',
  !hrefs.includes('/dashboard'))
check('5 sections', PERMISSION_SECTIONS.length === 5, `got ${PERMISSION_SECTIONS.length}`)

console.log('\n[roles & defaults]')
check('manageable roles are exactly STAFF, ORGANIZER', eqSet(MANAGEABLE_ROLES, ['STAFF', 'ORGANIZER']))
check('isManageableRole STAFF/ORGANIZER true', isManageableRole('STAFF') && isManageableRole('ORGANIZER'))
check('isManageableRole ATTENDEE/ADMIN/"" false',
  !isManageableRole('ATTENDEE') && !isManageableRole('ADMIN') && !isManageableRole(''))
check('ORGANIZER default = every key', eqSet(DEFAULT_PERMISSIONS.ORGANIZER, ALL_PERMISSION_KEYS))
check('STAFF default excludes the whole Administration section',
  ADMIN_SECTION_KEYS.every(k => !DEFAULT_PERMISSIONS.STAFF.includes(k)),
  `got ${JSON.stringify(DEFAULT_PERMISSIONS.STAFF)}`)
check('STAFF default still includes operational keys (calendar, meetings, staff)',
  ['calendar', 'meetings', 'staff'].every(k => DEFAULT_PERMISSIONS.STAFF.includes(k)))
check('every role has a default description',
  MANAGEABLE_ROLES.every(r => typeof DEFAULT_DESCRIPTIONS[r] === 'string' && DEFAULT_DESCRIPTIONS[r].length > 0))
check('ORGANIZER locks the `staff` key', eqSet(LOCKED_KEYS_BY_ROLE.ORGANIZER, ['staff']))
check('STAFF locks nothing', LOCKED_KEYS_BY_ROLE.STAFF.length === 0)

console.log('\n[normalizePermissions]')
check('drops unknown keys',
  eqSet(normalizePermissions('STAFF', ['calendar', 'bogus', 'nope']), ['calendar']))
check('de-dupes',
  normalizePermissions('STAFF', ['calendar', 'calendar', 'email']).filter(k => k === 'calendar').length === 1)
check('ORGANIZER always keeps `staff` (anti-lockout) even from []',
  normalizePermissions('ORGANIZER', []).includes('staff'))
check('ORGANIZER keeps `staff` even when only other keys are passed',
  normalizePermissions('ORGANIZER', ['calendar']).includes('staff'))
check('STAFF does NOT get `staff` force-added (not locked for STAFF)',
  !normalizePermissions('STAFF', ['calendar']).includes('staff'))
check('output is in canonical ALL_PERMISSION_KEYS order',
  (() => {
    const out = normalizePermissions('ORGANIZER', ['export', 'calendar', 'access'])
    const idx = out.map(k => ALL_PERMISSION_KEYS.indexOf(k))
    return idx.every((v, i) => i === 0 || idx[i - 1] < v)
  })())

console.log('\n[hasPermission]')
check('ADMIN passes any key regardless of list', hasPermission('ADMIN', 'export', []))
check('ORGANIZER passes locked `staff` even if absent from list',
  hasPermission('ORGANIZER', 'staff', []))
check('ORGANIZER denied a non-locked key absent from list',
  !hasPermission('ORGANIZER', 'export', []))
check('STAFF default denies export', !hasPermission('STAFF', 'export', DEFAULT_PERMISSIONS.STAFF))
check('STAFF granted export passes', hasPermission('STAFF', 'export', ['export']))
check('unknown role denied everything', !hasPermission('ATTENDEE', 'calendar', ALL_PERMISSION_KEYS))

console.log('\n[visibleKeysFor]')
check('ADMIN sees all keys', eqSet([...visibleKeysFor('ADMIN', [])], ALL_PERMISSION_KEYS))
check('STAFF default hides the Administration section',
  ADMIN_SECTION_KEYS.every(k => !visibleKeysFor('STAFF', DEFAULT_PERMISSIONS.STAFF).has(k)))
check('ORGANIZER with [] still sees `staff` (locked)',
  visibleKeysFor('ORGANIZER', []).has('staff') && visibleKeysFor('ORGANIZER', []).size === 1)
check('unknown role sees nothing', visibleKeysFor('ATTENDEE', ALL_PERMISSION_KEYS).size === 0)

console.log('\n[defaultRoleConfig]')
for (const role of MANAGEABLE_ROLES) {
  const cfg = defaultRoleConfig(role)
  check(`${role} config has role/description/permissions`,
    cfg.role === role && typeof cfg.description === 'string' && Array.isArray(cfg.permissions))
  check(`${role} config permissions are normalized`,
    eqSet(cfg.permissions, normalizePermissions(role, DEFAULT_PERMISSIONS[role])))
}

console.log(`\n${failures === 0 ? '✅ all unit checks passed' : `❌ ${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
