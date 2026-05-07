import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
      attendeeA: { select: { id: true, name: true, image: true, company: true, jobTitle: true, bio: true } },
      attendeeB: { select: { id: true, name: true, image: true, company: true, jobTitle: true, bio: true } },
    },
  })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (meeting.attendeeAId !== userId && meeting.attendeeBId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const other = meeting.attendeeAId === userId ? meeting.attendeeB : meeting.attendeeA
  return NextResponse.json({
    id: meeting.id,
    status: meeting.status,
    notes: meeting.notes,
    startsAt: meeting.timeBlock.startsAt.toISOString(),
    endsAt: meeting.timeBlock.endsAt.toISOString(),
    location: meeting.timeBlock.location,
    other,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { attendeeAId: true, attendeeBId: true },
  })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (meeting.attendeeAId !== userId && meeting.attendeeBId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}
  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED']
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    data.status = body.status
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > 2000) return NextResponse.json({ error: 'Notes too long' }, { status: 400 })
    data.notes = body.notes
  }

  const updated = await prisma.meeting.update({ where: { id }, data, select: { status: true, notes: true } })
  return NextResponse.json({ ok: true, ...updated })
}
