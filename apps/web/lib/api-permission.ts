import 'server-only'
import { getPermissionsForRole } from './role-permissions-server'
import { hasPermission, type PermissionKey } from './permissions'

// API-level counterpart to the page guard in require-permission.tsx. Route
// handlers already establish a session and extract the caller's role; pass that
// role plus the permission key the route protects. Returns true when the role
// may proceed. ADMIN and any role holding the key pass; a restricted role is
// rejected so it cannot bypass a hidden page by calling its API directly.
export async function roleHasPermission(role: string, key: PermissionKey): Promise<boolean> {
  const perms = await getPermissionsForRole(role)
  return hasPermission(role, key, perms)
}
