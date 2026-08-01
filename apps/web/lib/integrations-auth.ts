import 'server-only'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { roleHasPermission } from '@/lib/api-permission'

// httpOnly cookie carrying the per-request OAuth nonce, echoed in `state` and
// re-checked in the callback (CSRF binding for the Google connect flow).
export const OAUTH_STATE_COOKIE = 'google_oauth_state'

// Shared gate for every integrations surface (the POST/DELETE JSON API and the
// Google OAuth connect + callback browser flows). A signed-in admin role that
// also holds the 'integrations' permission may proceed. Returns the session on
// success so JSON callers can reuse it, or null to short-circuit.
export async function requireIntegrationsAccess() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const role = (session.user as { role?: string }).role ?? ''
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) return null
  if (!(await roleHasPermission(role, 'integrations'))) return null
  return session
}
