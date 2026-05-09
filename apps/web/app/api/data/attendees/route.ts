import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'

const getCachedAttendees = unstable_cache(
  async () => prisma.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      company: true,
      jobTitle: true,
    },
  }),
  ['web-attendees'],
  { revalidate: 300, tags: ['attendees'] },
)

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const users = await getCachedAttendees()
  return NextResponse.json(users)
}
