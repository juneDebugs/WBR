import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, hashPassword } from '@conference/db'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor linked' }, { status: 403 })

  const { name, email, jobTitle, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    // If they already belong to this sponsor, return them
    if (existing.sponsorId === user.sponsorId) {
      return NextResponse.json({
        id: existing.id, name: existing.name, email: existing.email,
        image: existing.image, jobTitle: existing.jobTitle, role: existing.role,
      })
    }
    // If they belong to another sponsor, reject
    if (existing.sponsorId) {
      return NextResponse.json({ error: 'This user is already linked to another sponsor' }, { status: 409 })
    }
    // Link existing user to this sponsor
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { sponsorId: user.sponsorId, ...(name && { name }), ...(jobTitle && { jobTitle }) },
      select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
    })
    return NextResponse.json(updated)
  }

  // Create new user linked to this sponsor
  const hashed = await hashPassword(password)
  const created = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      jobTitle: jobTitle || null,
      password: hashed,
      role: 'ATTENDEE',
      sponsorId: user.sponsorId,
    },
    select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
  })

  return NextResponse.json(created, { status: 201 })
}
