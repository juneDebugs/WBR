import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: session.user.email ?? `${userId}@unknown.com`,
      name: session.user.name ?? 'Unknown',
      role: 'ATTENDEE',
    },
  })

  const { startsAt, endsAt, reason } = await request.json()
  if (!startsAt || !endsAt) {
    return NextResponse.json({ error: 'startsAt and endsAt are required' }, { status: 400 })
  }
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }
  if (start >= end) {
    return NextResponse.json({ error: 'Start must be before end' }, { status: 400 })
  }

  const blackout = await prisma.blackoutTime.create({
    data: {
      userId,
      startsAt: start,
      endsAt: end,
      reason: reason ?? null,
    },
  })

  return NextResponse.json({
    id: blackout.id,
    startsAt: blackout.startsAt.toISOString(),
    endsAt: blackout.endsAt.toISOString(),
    reason: blackout.reason,
  })
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const blackout = await prisma.blackoutTime.findUnique({ where: { id } })
  if (!blackout) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (blackout.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.blackoutTime.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
