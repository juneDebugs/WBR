import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const body = await req.json()

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // If email is changing, check for duplicates
  if (body.email && body.email !== existing.email) {
    const dup = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: 'Email already in use by another user' }, { status: 409 })
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email?.toLowerCase() }),
      ...(body.image !== undefined && { image: body.image }),
      ...(body.bio !== undefined && { bio: body.bio }),
      ...(body.company !== undefined && { company: body.company }),
      ...(body.jobTitle !== undefined && { jobTitle: body.jobTitle }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.website !== undefined && { website: body.website }),
      ...(body.companySize !== undefined && { companySize: body.companySize }),
      ...(body.annualRevenue !== undefined && { annualRevenue: body.annualRevenue }),
      ...(body.solutionsOffering !== undefined && { solutionsOffering: body.solutionsOffering }),
      ...(body.solutionsSeeking !== undefined && { solutionsSeeking: body.solutionsSeeking }),
    },
    select: { id: true, name: true, email: true },
  })

  return NextResponse.json(updated)
}
