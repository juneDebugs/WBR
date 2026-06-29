import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { fetchAttendeesPage } from '@/lib/attendees-query'

const ADMIN_ROLES = new Set(['STAFF', 'ORGANIZER', 'ADMIN'])

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.has(token.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const pageRaw = searchParams.get('page')
  const page = pageRaw !== null ? Number(pageRaw) : 0
  const q = searchParams.get('q') ?? ''
  const role = searchParams.get('role') ?? ''

  const result = await fetchAttendeesPage({ page, q, role })
  return NextResponse.json(result)
}
