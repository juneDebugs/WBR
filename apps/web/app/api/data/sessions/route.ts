import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma, getActiveConflicts } from '@conference/db'

const getCachedSessions = unstable_cache(
  async () => prisma.confSession.findMany({ include: { speaker: true }, orderBy: { startsAt: 'asc' } }),
  ['web-sessions'], { revalidate: 60, tags: ['sessions'] }
)
const getCachedConflicts = unstable_cache(
  async () => getActiveConflicts(prisma),
  ['web-conflicts'], { revalidate: 120, tags: ['conflicts'] }
)

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [sessions, conflicts] = await Promise.all([getCachedSessions(), getCachedConflicts()])
  return NextResponse.json({ sessions: JSON.parse(JSON.stringify(sessions)), conflicts })
}
