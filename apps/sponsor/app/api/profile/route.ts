import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor linked' }, { status: 403 })

  const body = await req.json()

  const allowed = [
    'name', 'tagline', 'description', 'logoUrl', 'heroImageUrl', 'website',
    'contactName', 'contactEmail', 'contactPhone',
    'companySize', 'annualRevenue', 'founded', 'headquarters', 'boothNumber',
    'socialLinkedIn', 'socialTwitter',
    'solutionsOffering', 'solutionsSeeking',
    'targetIndustries', 'targetCompanySizes', 'targetRevenues',
  ]

  const data: Record<string, string | null> = {}
  for (const key of allowed) {
    if (key in body) {
      const val = body[key]
      data[key] = Array.isArray(val) ? JSON.stringify(val) : (val ?? null)
    }
  }

  const sponsor = await prisma.sponsor.update({
    where: { id: user.sponsorId },
    data,
  })

  return NextResponse.json(sponsor)
}
