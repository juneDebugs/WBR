import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'

const getCachedConference = unstable_cache(
  async () => {
    const conference = await prisma.conference.findFirst({ where: { active: true } })
    if (!conference) return null
    return {
      id: conference.id,
      name: conference.name,
      venue: conference.venue ?? '',
      venueLat: conference.venueLat?.toString() ?? '',
      venueLon: conference.venueLon?.toString() ?? '',
      venueTimezone: conference.venueTimezone ?? '',
      startDate: conference.startDate.toISOString().slice(0, 10),
      endDate: conference.endDate.toISOString().slice(0, 10),
      heroImageUrl: conference.heroImageUrl ?? '',
      wifiName: conference.wifiName ?? '',
      wifiPassword: conference.wifiPassword ?? '',
      loginTitle: (conference as any).loginTitle ?? '',
      loginSubtitle: (conference as any).loginSubtitle ?? '',
      loginButtonText: (conference as any).loginButtonText ?? '',
    }
  },
  ['web-app-settings'],
  { revalidate: 60, tags: ['app-settings'] },
)

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await getCachedConference()
  return NextResponse.json(data)
}
