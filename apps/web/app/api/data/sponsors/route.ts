import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'

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
  const data = await getCachedSponsorsData()
  return NextResponse.json(data)
}
