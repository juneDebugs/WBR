import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@conference/db'

// Backing endpoint for the header Cmd+K search (components/GlobalSearch.tsx).
// Returns { results: SearchResult[] } matching the client's shape: entityType /
// entityId / title / subtitle / image / href / score. SQLite `contains` is
// case-insensitive for ASCII via LIKE, so no `mode` is needed (and Prisma's
// SQLite provider does not support it).
interface SearchResult {
  entityType: 'speaker' | 'user' | 'session' | 'sponsor'
  entityId: string
  title: string
  subtitle: string | null
  image: string | null
  href: string
  score: number
}

const TAKE = 5

export async function GET(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ results: [] })

  const [speakers, users, sessions, sponsors] = await Promise.all([
    prisma.speaker.findMany({
      where: { name: { contains: q } },
      select: { id: true, name: true, company: true, jobTitle: true, photoUrl: true },
      take: TAKE,
    }),
    prisma.user.findMany({
      where: { OR: [{ name: { contains: q } }, { email: { contains: q } }] },
      select: { id: true, name: true, email: true, company: true, image: true },
      take: TAKE,
    }),
    prisma.confSession.findMany({
      where: { title: { contains: q } },
      select: { id: true, title: true, track: true, room: true },
      take: TAKE,
    }),
    prisma.sponsor.findMany({
      where: { name: { contains: q } },
      select: { id: true, name: true, tier: true, logoUrl: true },
      take: TAKE,
    }),
  ])

  const results: SearchResult[] = [
    ...speakers.map(s => ({
      entityType: 'speaker' as const,
      entityId: s.id,
      title: s.name,
      subtitle: [s.jobTitle, s.company].filter(Boolean).join(' · ') || null,
      image: s.photoUrl ?? null,
      href: `/dashboard/speakers/${s.id}`,
      score: 1,
    })),
    ...users.map(u => ({
      entityType: 'user' as const,
      entityId: u.id,
      title: u.name ?? u.email ?? 'Unknown',
      subtitle: [u.email, u.company].filter(Boolean).join(' · ') || null,
      image: u.image ?? null,
      href: `/dashboard/attendees/${u.id}`,
      score: 1,
    })),
    ...sessions.map(s => ({
      entityType: 'session' as const,
      entityId: s.id,
      title: s.title,
      subtitle: [s.track, s.room].filter(Boolean).join(' · ') || null,
      image: null,
      href: `/dashboard/sessions/${s.id}`,
      score: 1,
    })),
    ...sponsors.map(s => ({
      entityType: 'sponsor' as const,
      entityId: s.id,
      title: s.name,
      subtitle: s.tier ?? null,
      image: s.logoUrl ?? null,
      href: `/dashboard/sponsors/${s.id}`,
      score: 1,
    })),
  ]

  return NextResponse.json({ results })
}
