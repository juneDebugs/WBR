import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { prisma } from '@conference/db'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json([], { status: 401 })

  const sponsors = await prisma.sponsor.findMany({
    orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    include: {
      users: {
        select: { id: true, name: true, jobTitle: true, image: true, role: true },
      },
    },
  })

  return NextResponse.json(
    sponsors.map(s => ({ ...s, users: s.users.filter(u => u.id !== user.id) })),
  )
}
