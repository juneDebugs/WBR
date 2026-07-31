import 'server-only'
import { cache } from 'react'
import { unstable_cache, revalidateTag } from 'next/cache'
import { prisma } from '@conference/db'
import {
  MANAGEABLE_ROLES,
  DEFAULT_DESCRIPTIONS,
  type ManageableRole,
  type RoleConfig,
  type PermissionKey,
  defaultRoleConfig,
  normalizePermissions,
} from './permissions'

// Persistence for per-role settings + permissions.
//
// The repo has no migration history — schema changes go through `prisma db
// push`. To avoid coupling this feature to a manual push against the live Turso
// database, we own the table with a defensive `CREATE TABLE IF NOT EXISTS`. The
// column shape matches exactly what Prisma would generate for the RolePermission
// model declared in schema.prisma, so a future `prisma db push` is a no-op
// rather than an ALTER. Raw SQL (not the generated Prisma model) keeps this
// working even before the client is regenerated with the new model.

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "RolePermission" (
  "role" TEXT NOT NULL PRIMARY KEY,
  "description" TEXT NOT NULL,
  "permissions" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
)`

let ensured: Promise<void> | null = null
function ensureTable(): Promise<void> {
  // Memoize per process; IF NOT EXISTS makes re-runs harmless if a serverless
  // instance resets the module.
  if (!ensured) {
    ensured = prisma.$executeRawUnsafe(CREATE_TABLE_SQL).then(() => undefined).catch(err => {
      // Reset so a transient failure can be retried on the next call.
      ensured = null
      throw err
    })
  }
  return ensured
}

type Row = { role: string; description: string; permissions: string }

function rowToConfig(row: Row): RoleConfig | null {
  if (!(MANAGEABLE_ROLES as readonly string[]).includes(row.role)) return null
  const role = row.role as ManageableRole
  let parsed: unknown = []
  try {
    parsed = JSON.parse(row.permissions)
  } catch {
    parsed = []
  }
  const keys = Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  return {
    role,
    description: row.description ?? '',
    permissions: normalizePermissions(role, keys),
  }
}

// Fallback used when the permissions row can't be read. It must fail CLOSED for
// restrictable roles: returning a role's broad defaults on a transient DB error
// would silently re-grant permissions an organizer had revoked. ORGANIZER is a
// superuser whose default already is full access, so defaults are correct there;
// STAFF degrades to no permissions (they keep only always-on Overview) until the
// DB recovers.
function safeFallback(role: ManageableRole): RoleConfig {
  if (role === 'ORGANIZER') return defaultRoleConfig(role)
  return { role, description: DEFAULT_DESCRIPTIONS[role], permissions: [] }
}

// Cross-request cache of the raw RolePermission rows. This gate is read on
// EVERY admin API request (via roleHasPermission) and every dashboard page
// load (via the sidebar/page guards); against Turso the SELECT is a ~80ms
// round-trip, so serving it per-request was the dominant floor once the
// Meetings boards were cached. `saveRoleConfig` invalidates the `role-
// permissions` tag on every write, so a permission grant/revoke takes effect
// on the very next request; the 60s revalidate is only a backstop for
// out-of-band DB edits. On a read error we throw so the caller's try/catch
// still fails CLOSED (unstable_cache never caches a rejection).
const getRoleRowsCached = unstable_cache(
  async (): Promise<Row[]> => {
    await ensureTable()
    return prisma.$queryRawUnsafe<Row[]>(
      `SELECT "role", "description", "permissions" FROM "RolePermission" WHERE "role" IN ('STAFF','ORGANIZER')`,
    )
  },
  ['role-configs'],
  { revalidate: 60, tags: ['role-permissions'] },
)

// Effective config for every manageable role. Missing rows fall back to
// defaults, so the caller always gets a complete, ordered set.
// Wrapped in React cache() so the layout guard and a page guard in the same
// request share one call instead of two (on top of the cross-request cache).
export const getRoleConfigs = cache(async (): Promise<RoleConfig[]> => {
  try {
    const rows = await getRoleRowsCached()
    const byRole = new Map<string, RoleConfig>()
    for (const row of rows) {
      const cfg = rowToConfig(row)
      if (cfg) byRole.set(cfg.role, cfg)
    }
    return MANAGEABLE_ROLES.map(role => byRole.get(role) ?? defaultRoleConfig(role))
  } catch (err) {
    // Never hard-fail the dashboard on a permissions read — fail closed instead.
    console.error('[role-permissions] read failed, failing closed for STAFF:', err)
    return MANAGEABLE_ROLES.map(safeFallback)
  }
})

export async function getRoleConfig(role: ManageableRole): Promise<RoleConfig> {
  const all = await getRoleConfigs()
  return all.find(c => c.role === role) ?? defaultRoleConfig(role)
}

// Effective permission keys for a single role, for guards/sidebar. Non-manageable
// roles (e.g. ADMIN) return an empty list here; callers use hasPermission()/
// visibleKeysFor() which special-case ADMIN as full access.
export async function getPermissionsForRole(role: string): Promise<PermissionKey[]> {
  if (!(MANAGEABLE_ROLES as readonly string[]).includes(role)) return []
  const cfg = await getRoleConfig(role as ManageableRole)
  return cfg.permissions
}

export async function saveRoleConfig(input: {
  role: ManageableRole
  description: string
  permissions: string[]
}): Promise<RoleConfig> {
  await ensureTable()
  const permissions = normalizePermissions(input.role, input.permissions)
  const description = String(input.description ?? '').slice(0, 500)
  const updatedAt = new Date().toISOString()
  await prisma.$executeRawUnsafe(
    `INSERT INTO "RolePermission" ("role", "description", "permissions", "updatedAt")
     VALUES (?, ?, ?, ?)
     ON CONFLICT("role") DO UPDATE SET
       "description" = excluded."description",
       "permissions" = excluded."permissions",
       "updatedAt" = excluded."updatedAt"`,
    input.role,
    description,
    JSON.stringify(permissions),
    updatedAt,
  )
  // Bust the cross-request gate cache so the new grant/revoke is enforced on
  // the next request (security-sensitive — must not wait for the TTL).
  revalidateTag('role-permissions')
  return { role: input.role, description, permissions }
}
