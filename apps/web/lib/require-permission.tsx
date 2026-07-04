import { getServerSession } from 'next-auth'
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
