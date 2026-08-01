import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { roleHasPermission } from '@/lib/api-permission'

const ADMIN_ROLES = new Set(['STAFF', 'ORGANIZER', 'ADMIN'])

const getCachedSponsorsData = unstable_cache(
  async () => {
    const [sponsors, committedRows] = await Promise.all([
      prisma.sponsor.findMany({
        include: { _count: { select: { meetings: true, users: true } } },
        orderBy: [{ tier: 'asc' }, { name: 'asc' }],
      }),
      prisma.sponsorMeeting.groupBy({
        by: ['sponsorId'],
        where: { status: 'CONFIRMED' },
        _count: { _all: true },
      }),
    ])
    return { sponsors, committedRows }
  },
  ['web-sponsors'],
  { revalidate: 60, tags: ['sponsors'] },
)

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = token.role as string
  if (!ADMIN_ROLES.has(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await roleHasPermission(role, 'sponsors'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const data = await getCachedSponsorsData()
  return NextResponse.json(data)
}
