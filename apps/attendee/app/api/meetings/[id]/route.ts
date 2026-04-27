import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const meeting = await prisma.meeting.findUnique({
    where: { id: params.id },
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

  const updated = await prisma.meeting.update({ where: { id: params.id }, data, select: { status: true, notes: true } })
  return NextResponse.json({ ok: true, ...updated })
}
