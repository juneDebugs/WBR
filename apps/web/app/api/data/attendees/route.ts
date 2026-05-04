import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const users = await getCachedAttendees()
  return NextResponse.json(users)
}
