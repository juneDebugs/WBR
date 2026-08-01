import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { roleHasPermission } from '@/lib/api-permission'

const ADMIN_ROLES = new Set(['STAFF', 'ORGANIZER', 'ADMIN'])

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
  const role = token.role as string
  if (!ADMIN_ROLES.has(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await roleHasPermission(role, 'speakers'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const speakers = await getCachedSpeakers()
  return NextResponse.json(stripDataUris(speakers))
}
