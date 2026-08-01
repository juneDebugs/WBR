import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const userId = session.user.id

  // Parse/validate the body before any DB work — the two lookups below are
  // independent, so fetch them concurrently rather than serially over Turso.
  // (requireCompleteProfile already fails closed when the user row is missing,
  // so the removed user.upsert ensure-step was vestigial.)
  const { timeBlockId, partnerId, notes } = await request.json()
  if (!timeBlockId || !partnerId) {
    return NextResponse.json({ error: 'timeBlockId and partnerId are required' }, { status: 400 })
  }

  const [timeBlock, activeConf] = await Promise.all([
    prisma.timeBlock.findUnique({ where: { id: timeBlockId } }),
    prisma.conference.findFirst({ where: { active: true } }),
  ])
  if (!timeBlock) return NextResponse.json({ error: 'Time block not found' }, { status: 404 })
  if (!activeConf) return NextResponse.json({ error: 'No active conference' }, { status: 400 })

  const meeting = await prisma.meeting.create({
    data: {
      conferenceId: activeConf.id,
      timeBlockId,
      organizerId: userId,
      attendeeAId: userId,
      attendeeBId: partnerId,
      status: 'PENDING',
      notes: notes ?? null,
    },
    include: {
      timeBlock: true,
      attendeeA: true,
      attendeeB: true,
    },
  })

  return NextResponse.json({
    id: meeting.id,
    status: meeting.status,
    notes: meeting.notes,
    attendeeAId: meeting.attendeeAId,
    attendeeBId: meeting.attendeeBId,
    attendeeA: {
      id: meeting.attendeeA.id,
      name: meeting.attendeeA.name,
      image: meeting.attendeeA.image,
      company: meeting.attendeeA.company,
    },
    attendeeB: {
      id: meeting.attendeeB.id,
      name: meeting.attendeeB.name,
      image: meeting.attendeeB.image,
      company: meeting.attendeeB.company,
    },
    timeBlock: {
      id: meeting.timeBlock.id,
      startsAt: meeting.timeBlock.startsAt.toISOString(),
      endsAt: meeting.timeBlock.endsAt.toISOString(),
      location: meeting.timeBlock.location,
    },
  })
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const userId = session.user.id
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const meeting = await prisma.meeting.findUnique({ where: { id } })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (meeting.attendeeAId !== userId && meeting.attendeeBId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.meeting.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
