import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma, getActiveConflicts } from '@conference/db'
import { roleHasPermission } from '@/lib/api-permission'

const ADMIN_ROLES = new Set(['STAFF', 'ORGANIZER', 'ADMIN'])

const getCachedSessions = unstable_cache(
  async () => prisma.confSession.findMany({ include: { speaker: true }, orderBy: { startsAt: 'asc' } }),
  ['web-sessions'], { revalidate: 60, tags: ['sessions'] }
)
const getCachedConflicts = unstable_cache(
  async () => getActiveConflicts(prisma),
  ['web-conflicts'], { revalidate: 120, tags: ['conflicts'] }
)

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = token.role as string
  if (!ADMIN_ROLES.has(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await roleHasPermission(role, 'agenda'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [sessions, conflicts] = await Promise.all([getCachedSessions(), getCachedConflicts()])
  return NextResponse.json({ sessions: JSON.parse(JSON.stringify(sessions)), conflicts })
}
