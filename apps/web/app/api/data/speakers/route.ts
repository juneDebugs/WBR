import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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
      _count: { select: { confSessions: true } },
    },
    orderBy: { name: 'asc' },
  }),
  ['web-speakers'],
  { revalidate: 60, tags: ['speakers'] },
)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const speakers = await getCachedSpeakers()
  return NextResponse.json(speakers)
}
