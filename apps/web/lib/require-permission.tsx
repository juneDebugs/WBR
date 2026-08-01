import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdminHeader } from '@/components/AdminHeader'
import { getPermissionsForRole } from '@/lib/role-permissions-server'
import { hasPermission, type PermissionKey } from '@/lib/permissions'

// Server-side page guard. Returns a ready-to-render "Access restricted" screen
// when the signed-in role lacks `key`, or null when access is granted. Usage in
// a server page component:
//
//   const denied = await permissionDenied('export', 'Export')
//   if (denied) return denied
//
// Middleware only proves a session exists; this enforces the per-role
// permissions configured in Staff → Roles & Permissions. ADMIN and any role
// holding the key pass; everyone else sees the notice.
export async function permissionDenied(key: PermissionKey, title: string) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  const perms = await getPermissionsForRole(role)
  if (hasPermission(role, key, perms)) return null

  return (
    <>
      <AdminHeader title={title} />
      <main className="flex-1 p-6">
        <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-gray-900">Access restricted</p>
          <p className="mt-1 text-sm text-gray-500">
            Your role doesn’t have access to {title}. Ask an organizer to enable it in
            {' '}Staff → Roles &amp; Permissions.
          </p>
        </div>
      </main>
    </>
  )
}

// Server-action counterpart to permissionDenied. Inline `'use server'` actions
// on a page are ordinary POST endpoints, reachable without the page render that
// carries permissionDenied — so every mutating action must guard itself too.
// Call as the first line of the action body:
//
//   await assertPermission('sponsors')
//
// A role lacking `key` is bounced to /dashboard (ADMIN and any role holding the
// key pass). Mirrors the page guard so a hidden section cannot be mutated by
// POSTing its action directly.
export async function assertPermission(key: PermissionKey) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  const perms = await getPermissionsForRole(role)
  if (!hasPermission(role, key, perms)) redirect('/dashboard')
}
