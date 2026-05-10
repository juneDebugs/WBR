import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'

const getCachedSpeakers = unstable_cache(
  async () => prisma.speaker.findMany({
    select: {
      id: true,
      name: true,
      photoUrl: true,
      photoPosition: true,
      jobTitle: true,
      company: true,
      bio: true,
      twitterHandle: true,
      linkedinUrl: true,
      confSessions: {
        select: {
          id: true,
          title: true,
          description: true,
          startsAt: true,
          track: true,
          type: true,
        },
      },
      _count: { select: { confSessions: true } },
    },
    orderBy: { name: 'asc' },
  }),
  ['web-speakers'],
  { revalidate: 60, tags: ['speakers'] },
)

/** Replace data URI photoUrls with lightweight API endpoint URLs */
function stripDataUris(speakers: any[]) {
  return speakers.map(s => ({
    ...s,
    photoUrl: s.photoUrl
      ? s.photoUrl.startsWith('data:') ? `/api/speakers/${s.id}/photo` : s.photoUrl
      : null,
  }))
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const speakers = await getCachedSpeakers()
  return NextResponse.json(stripDataUris(speakers))
}
