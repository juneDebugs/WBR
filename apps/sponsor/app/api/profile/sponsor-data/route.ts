import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { prisma } from '@conference/db'

function getCachedSponsorProfile(sponsorId: string) {
  return unstable_cache(
    async () => prisma.sponsor.findUnique({
      where: { id: sponsorId },
      include: {
        users: { select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true } },
      },
    }),
    ['profile-sponsor', sponsorId],
    { revalidate: 60, tags: [`sponsor-${sponsorId}`] },
  )()
}

const getCachedAvailableUsers = unstable_cache(
  async () => prisma.user.findMany({
    where: { sponsorId: null, role: { not: 'ORGANIZER' } },
    select: { id: true, name: true, email: true, image: true, jobTitle: true },
    orderBy: { name: 'asc' },
    take: 200,
  }),
  ['profile-available-users'],
  { revalidate: 120, tags: ['attendee-pool'] },
)

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.sponsorId) return NextResponse.json({ sponsor: null, availableUsers: [] })

  const [sponsor, availableUsers] = await Promise.all([
    getCachedSponsorProfile(user.sponsorId),
    getCachedAvailableUsers(),
  ])

  return NextResponse.json({
    sponsor: sponsor ? JSON.parse(JSON.stringify(sponsor)) : null,
    availableUsers: JSON.parse(JSON.stringify(availableUsers)),
  })
}
