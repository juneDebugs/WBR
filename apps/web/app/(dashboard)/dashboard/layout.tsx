import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/Sidebar'
import { getPermissionsForRole } from '@/lib/role-permissions-server'
import { PERMISSION_SECTIONS, visibleKeysFor } from '@/lib/permissions'

// Compute which nav destinations the signed-in role may see, so the Sidebar
// only renders sections the role can actually open. Overview (/dashboard) is
// always allowed. Enforcement of the pages themselves lives in each page's
// guard (see lib/require-permission); this just keeps the nav honest.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  const perms = await getPermissionsForRole(role)
  const visible = visibleKeysFor(role, perms)

  const allowedHrefs = ['/dashboard']
  for (const section of PERMISSION_SECTIONS) {
    for (const item of section.items) {
      if (visible.has(item.key)) allowedHrefs.push(item.href)
    }
  }
  // Check-In is a nav destination without its own permission key — it rides on
  // the same `meetings` grant as the page it split off from.
  if (visible.has('meetings')) allowedHrefs.push('/dashboard/meetings/check-in')

  return (
    <div className="flex min-h-screen">
      <Sidebar allowedHrefs={allowedHrefs} />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}
