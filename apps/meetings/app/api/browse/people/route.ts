import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json([], { status: 401 })

  const userId = (session.user as any).id as string

  const people = await prisma.user.findMany({
    where: { role: 'ATTENDEE', sponsorId: null },
    select: {
      id: true, name: true, email: true, image: true, company: true,
      jobTitle: true, role: true, bio: true, companySize: true,
      annualRevenue: true, solutionsOffering: true, solutionsSeeking: true,
      website: true,
    },
    orderBy: { name: 'asc' },
    take: 500,
  })

  return NextResponse.json(people.filter(p => p.id !== userId))
}
