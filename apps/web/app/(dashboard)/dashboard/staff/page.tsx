import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AdminHeader } from '@/components/AdminHeader'
import { StaffTabsShell } from '@/components/StaffTabsShell'
import { fetchStaffPage } from '@/lib/staff-query'
import { getRoleConfigs } from '@/lib/role-permissions-server'
import { permissionDenied } from '@/lib/require-permission'

const ADMIN_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

export default async function StaffPage() {
  // The staff directory (emails, roles, password status) is admin-only. The
  // web app's own login already restricts to admin roles, but a token minted
  // by a sibling app on the same host would satisfy middleware's presence
  // check — so gate the role here too, matching /api/data/staff.
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!role || !ADMIN_ROLES.includes(role)) {
    return (
      <>
        <AdminHeader title="Staff" />
        <main className="flex-1 p-6">
          <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-gray-900">Access restricted</p>
            <p className="mt-1 text-sm text-gray-500">
              You need staff or organizer access to manage staff.
            </p>
          </div>
        </main>
      </>
    )
  }

  const denied = await permissionDenied('staff', 'Staff')
  if (denied) return denied

  const [initialData, initialRoles] = await Promise.all([
    fetchStaffPage({ page: 0 }),
    getRoleConfigs(),
  ])
  // Editing role settings/permissions is Organizer-only; STAFF/ADMIN view read-only.
  const canEditRoles = role === 'ORGANIZER'
  return (
    <>
      <AdminHeader title="Staff" />
      <main className="flex-1 p-6">
        <StaffTabsShell initialData={initialData} initialRoles={initialRoles} canEditRoles={canEditRoles} />
      </main>
    </>
  )
}
