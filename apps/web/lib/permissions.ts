// Role permissions — the single source of truth for what each admin role can
// reach in the dashboard. Pure module: NO server-only imports (prisma, next
// server APIs) so it is safe to import from client components (Sidebar, the
// Roles & Permissions editor) and from Node test scripts.
//
// A "permission key" maps 1:1 to a sidebar nav destination. The Overview home
// (/dashboard) is always reachable and is intentionally NOT a key. Sections
// mirror the sidebar grouping so the editor UI and the nav stay in lockstep.

export type PermissionKey =
  | 'calendar' | 'agenda' | 'speakers'
  | 'meetings' | 'timeBlocks'
  | 'attendees' | 'staff' | 'sponsors'
  | 'chat' | 'email'
  | 'integrations' | 'appSettings' | 'access' | 'export'

export type PermissionItem = { key: PermissionKey; label: string; href: string }
export type PermissionSection = { section: string; items: PermissionItem[] }

// Grouped exactly like the sidebar. Order here is the canonical display order.
export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    section: 'Program',
    items: [
      { key: 'calendar', label: 'Calendar', href: '/dashboard/calendar' },
      { key: 'agenda', label: 'Agenda', href: '/dashboard/sessions' },
      { key: 'speakers', label: 'Speakers', href: '/dashboard/speakers' },
    ],
  },
  {
    section: 'Meetings',
    items: [
      { key: 'meetings', label: 'Meetings', href: '/dashboard/meetings' },
      { key: 'timeBlocks', label: 'Time Blocks', href: '/dashboard/time-blocks' },
    ],
  },
  {
    section: 'People',
    items: [
      { key: 'attendees', label: 'Attendees', href: '/dashboard/attendees' },
      { key: 'staff', label: 'Staff', href: '/dashboard/staff' },
      { key: 'sponsors', label: 'Sponsors', href: '/dashboard/sponsors' },
    ],
  },
  {
    section: 'Communications',
    items: [
      { key: 'chat', label: 'Chat', href: '/dashboard/chat' },
      { key: 'email', label: 'Email', href: '/dashboard/email' },
    ],
  },
  {
    section: 'Administration',
    items: [
      { key: 'integrations', label: 'Integrations', href: '/dashboard/integrations' },
      { key: 'appSettings', label: 'App Settings', href: '/dashboard/app-settings' },
      { key: 'access', label: 'Access', href: '/dashboard/access' },
      { key: 'export', label: 'Export', href: '/dashboard/export' },
    ],
  },
]

export const ALL_PERMISSION_KEYS: PermissionKey[] =
  PERMISSION_SECTIONS.flatMap(s => s.items.map(i => i.key))

// The two admin roles whose settings/permissions are editable on the Staff page.
// ADMIN is a legacy superuser handled separately (always full access) and is not
// listed as an editable role.
export const MANAGEABLE_ROLES = ['STAFF', 'ORGANIZER'] as const
export type ManageableRole = (typeof MANAGEABLE_ROLES)[number]

export function isManageableRole(role: string): role is ManageableRole {
  return (MANAGEABLE_ROLES as readonly string[]).includes(role)
}

// Anti-lockout: the role manager lives behind the `staff` permission, so an
// Organizer must always retain it. This key cannot be turned off for ORGANIZER.
export const LOCKED_KEYS_BY_ROLE: Record<ManageableRole, PermissionKey[]> = {
  ORGANIZER: ['staff'],
  STAFF: [],
}

// Defaults applied when a role has no stored config yet. Organizer is a full
// administrator; Staff gets broad operational access but NOT the sensitive
// Administration section (integrations/app settings/access/export).
export const DEFAULT_PERMISSIONS: Record<ManageableRole, PermissionKey[]> = {
  ORGANIZER: [...ALL_PERMISSION_KEYS],
  STAFF: ['calendar', 'agenda', 'speakers', 'meetings', 'timeBlocks', 'attendees', 'staff', 'sponsors', 'chat', 'email'],
}

export const DEFAULT_DESCRIPTIONS: Record<ManageableRole, string> = {
  ORGANIZER: 'Full administrative access to every section of the dashboard.',
  STAFF: 'Day-to-day operational access. Excludes sensitive administration tools by default.',
}

export type RoleConfig = {
  role: ManageableRole
  description: string
  permissions: PermissionKey[]
}

// Coerce an arbitrary permissions list to valid keys, de-duped and forced to
// include any locked-on keys for the role. Used by both the API (before persist)
// and when materializing stored rows.
export function normalizePermissions(role: ManageableRole, keys: string[]): PermissionKey[] {
  const valid = new Set<PermissionKey>()
  for (const k of keys) {
    if ((ALL_PERMISSION_KEYS as string[]).includes(k)) valid.add(k as PermissionKey)
  }
  for (const locked of LOCKED_KEYS_BY_ROLE[role]) valid.add(locked)
  // Return in canonical order for stable output/tests.
  return ALL_PERMISSION_KEYS.filter(k => valid.has(k))
}

export function defaultRoleConfig(role: ManageableRole): RoleConfig {
  return {
    role,
    description: DEFAULT_DESCRIPTIONS[role],
    permissions: normalizePermissions(role, DEFAULT_PERMISSIONS[role]),
  }
}

// Does `role` have access to `key`, given its effective permission list?
// - ADMIN (legacy) always passes.
// - Locked keys always pass for the role (anti-lockout).
// - Unknown/unmanaged roles get no access.
export function hasPermission(role: string, key: PermissionKey, permissions: PermissionKey[]): boolean {
  if (role === 'ADMIN') return true
  if (!isManageableRole(role)) return false
  if (LOCKED_KEYS_BY_ROLE[role].includes(key)) return true
  return permissions.includes(key)
}

// Which sidebar sections/items a role should see, given its effective perms.
// ADMIN sees everything. Overview is always included by the caller.
export function visibleKeysFor(role: string, permissions: PermissionKey[]): Set<PermissionKey> {
  if (role === 'ADMIN') return new Set(ALL_PERMISSION_KEYS)
  const out = new Set<PermissionKey>()
  for (const key of ALL_PERMISSION_KEYS) {
    if (hasPermission(role, key, permissions)) out.add(key)
  }
  return out
}
