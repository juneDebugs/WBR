import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

const ALLOWED = ['name', 'image', 'bio', 'jobTitle', 'company', 'website', 'linkedinUrl', 'companySize', 'annualRevenue', 'solutionsSeeking', 'solutionsOffering']

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const data: Record<string, string | null> = {}
  for (const key of ALLOWED) {
    if (key in body) data[key] = body[key] ?? null
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, name: true, image: true, bio: true, jobTitle: true, company: true },
  })

  return NextResponse.json({ ok: true, user })
}
