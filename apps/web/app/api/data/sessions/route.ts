import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, getActiveConflicts } from '@conference/db'

const getCachedSessions = unstable_cache(
  async () => prisma.confSession.findMany({ include: { speaker: true }, orderBy: { startsAt: 'asc' } }),
  ['web-sessions'], { revalidate: 60, tags: ['sessions'] }
)
const getCachedConflicts = unstable_cache(
  async () => getActiveConflicts(prisma),
  ['web-conflicts'], { revalidate: 120, tags: ['conflicts'] }
)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [sessions, conflicts] = await Promise.all([getCachedSessions(), getCachedConflicts()])
  return NextResponse.json({ sessions: JSON.parse(JSON.stringify(sessions)), conflicts })
}
