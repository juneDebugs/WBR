import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

const userSelect = {
  id: true,
  name: true,
  image: true,
  company: true,
  jobTitle: true,
  bio: true,
  website: true,
  linkedinUrl: true,
} as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const search = searchParams.get('search') ?? ''
  const cursor = searchParams.get('cursor') ?? undefined
  const limit = Math.min(Number(searchParams.get('limit') ?? 200), 500)

  const where: any = {
    id: { not: session.user.id },
    role: { in: ['ATTENDEE', 'SPEAKER'] },
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
      { jobTitle: { contains: search, mode: 'insensitive' } },
    ]
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: 'asc' },
    select: userSelect,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = users.length > limit
  const results = hasMore ? users.slice(0, limit) : users
  const nextCursor = hasMore ? results[results.length - 1].id : null

  return NextResponse.json({ users: results, nextCursor })
}
