import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, hashPassword } from '@conference/db'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, email, company, jobTitle, role, password } = await req.json()

  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const validRoles = ['ATTENDEE', 'SPEAKER']
  const userRole = validRoles.includes(role) ? role : 'ATTENDEE'

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
  }

  const hashed = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      company: company || null,
      jobTitle: jobTitle || null,
      role: userRole,
      password: hashed,
    },
    select: { id: true, name: true, email: true, image: true, role: true, company: true, jobTitle: true },
  })

  return NextResponse.json(user, { status: 201 })
}
