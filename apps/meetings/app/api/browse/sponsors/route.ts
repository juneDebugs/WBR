import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json([], { status: 401 })

  const userId = (session.user as any).id as string

  const sponsors = await prisma.sponsor.findMany({
    orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    include: {
      users: {
        select: { id: true, name: true, jobTitle: true, image: true, role: true },
      },
    },
  })

  return NextResponse.json(
    sponsors.map(s => ({ ...s, users: s.users.filter(u => u.id !== userId) })),
  )
}
