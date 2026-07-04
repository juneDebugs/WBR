import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRoleConfigs, saveRoleConfig } from '@/lib/role-permissions-server'
import { isManageableRole } from '@/lib/permissions'

const ADMIN_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']
// Editing role settings/permissions is a privileged action — Organizers (and
// the legacy ADMIN superuser) only. Staff can view but not change.
const EDIT_ROLES = ['ORGANIZER', 'ADMIN']

function sessionRole(session: unknown): string {
  return ((session as { user?: { role?: string } } | null)?.user?.role) ?? ''
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const roles = await getRoleConfigs()
  return NextResponse.json({ roles })
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!EDIT_ROLES.includes(sessionRole(session))) {
    return NextResponse.json(
      { error: 'Only organizers can change role settings and permissions.' },
      { status: 403 },
    )
  }

  let body: { role?: string; description?: string; permissions?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { role, description, permissions } = body
  if (!role || !isManageableRole(role)) {
    return NextResponse.json({ error: 'Unknown or unmanageable role' }, { status: 400 })
  }
  if (!Array.isArray(permissions) || !permissions.every(k => typeof k === 'string')) {
    return NextResponse.json({ error: 'permissions must be an array of strings' }, { status: 400 })
  }
  if (typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string' }, { status: 400 })
  }

  // normalizePermissions (inside saveRoleConfig) drops unknown keys and forces
  // any locked-on keys (anti-lockout), so a malformed or hostile payload can
  // never remove an Organizer's access to the role manager.
  const saved = await saveRoleConfig({ role, description, permissions })
  return NextResponse.json({ ok: true, role: saved })
}
