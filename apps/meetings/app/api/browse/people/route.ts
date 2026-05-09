import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { prisma } from '@conference/db'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json([], { status: 401 })

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

  return NextResponse.json(people.filter(p => p.id !== user.id))
}
