import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { fetchStaffPage } from '@/lib/staff-query'
import { roleHasPermission } from '@/lib/api-permission'

const ADMIN_ROLES = new Set(['STAFF', 'ORGANIZER', 'ADMIN'])

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = token.role as string
  if (!ADMIN_ROLES.has(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!(await roleHasPermission(role, 'staff'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const pageRaw = searchParams.get('page')
  const page = pageRaw !== null ? Number(pageRaw) : 0
  const q = searchParams.get('q') ?? ''

  const result = await fetchStaffPage({ page, q })
  return NextResponse.json(result)
}
