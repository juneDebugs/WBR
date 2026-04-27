import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

const MAX_LEN = 1000

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string

  const body = await req.json()
  const { company, jobTitle, companySize, annualRevenue, solutionsOffering, solutionsSeeking, website, bio } = body

  // Validate string lengths
  for (const [key, val] of Object.entries({ company, jobTitle, website, bio })) {
    if (val !== undefined && typeof val === 'string' && val.length > MAX_LEN) {
      return NextResponse.json({ error: `${key} too long` }, { status: 400 })
    }
  }

  // Validate arrays
  if (solutionsOffering !== undefined && !Array.isArray(solutionsOffering)) {
    return NextResponse.json({ error: 'solutionsOffering must be an array' }, { status: 400 })
  }
  if (solutionsSeeking !== undefined && !Array.isArray(solutionsSeeking)) {
    return NextResponse.json({ error: 'solutionsSeeking must be an array' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      company,
      jobTitle,
      companySize,
      annualRevenue,
      solutionsOffering: solutionsOffering ? JSON.stringify(solutionsOffering) : null,
      solutionsSeeking: solutionsSeeking ? JSON.stringify(solutionsSeeking) : null,
      website,
      bio,
    },
  })
  return NextResponse.json(updated)
}
