import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { prisma } from '@conference/db'

const MAX_LEN = 1000

export async function PATCH(req: Request) {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = user.id

  const body = await req.json()
  const { company, jobTitle, companySize, annualRevenue, solutionsOffering, solutionsSeeking, website, bio, image } = body

  // Validate string lengths
  for (const [key, val] of Object.entries({ company, jobTitle, website, bio, image })) {
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
      ...(image !== undefined && { image }),
    },
  })
  revalidateTag(`meetings-user-${userId}`)
  return NextResponse.json(updated)
}
