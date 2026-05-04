import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const people = await prisma.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: {
      id: true, name: true, image: true, company: true, jobTitle: true, bio: true,
      role: true, companySize: true, annualRevenue: true,
      solutionsOffering: true, solutionsSeeking: true, website: true, sponsorId: true,
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(people, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
    },
  })
}
