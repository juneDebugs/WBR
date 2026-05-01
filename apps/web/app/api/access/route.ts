import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, hashPassword } from '@conference/db'

const ROLES = ['ATTENDEE', 'SPEAKER', 'STAFF', 'ORGANIZER']

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'STAFF' && role !== 'ORGANIZER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, action, role: newRole, password, name, email } = await req.json()

  if (action === 'setRole') {
    if (!ROLES.includes(newRole)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    const user = await prisma.user.update({ where: { id: userId }, data: { role: newRole } })
    return NextResponse.json({ ok: true, role: user.role })
  }

  if (action === 'setPassword') {
    if (!password || password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    const hashed = await hashPassword(password)
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'clearPassword') {
    await prisma.user.update({ where: { id: userId }, data: { password: null } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'inviteAdmin') {
    if (!email?.trim()) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    const hashed = password ? await hashPassword(password) : null
    const user = await prisma.user.upsert({
      where: { email: email.trim().toLowerCase() },
      update: { role: newRole ?? 'ORGANIZER', ...(hashed ? { password: hashed } : {}) },
      create: {
        email: email.trim().toLowerCase(),
        name: name?.trim() || email.split('@')[0],
        role: newRole ?? 'ORGANIZER',
        ...(hashed ? { password: hashed } : {}),
      },
    })
    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
