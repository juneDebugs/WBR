import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, validateSchedulePayload, SCHEDULED_STATUS } from '@conference/db'

const ALLOWED_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

async function requireStaffSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = (session.user as any).role
  if (!ALLOWED_ROLES.includes(role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}

function serialize(s: any) {
  return {
    id: s.id,
    content: s.content,
    scheduledFor: s.scheduledFor.toISOString(),
    status: s.status,
    sentAt: s.sentAt ? s.sentAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    sender: s.sender ? { name: s.sender.name, email: s.sender.email } : null,
  }
}

// PATCH — edit a pending scheduled broadcast (content and/or send time).
// The status guard on updateMany makes the edit atomic against a concurrent
// dispatch tick: if the message went out in the meantime, the edit is refused.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireStaffSession()
  if (error) return error

  const existing = await prisma.scheduledMessage.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const validated = validateSchedulePayload(
    body.message !== undefined ? body.message : existing.content,
    body.scheduledFor !== undefined ? body.scheduledFor : existing.scheduledFor
  )
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const updated = await prisma.scheduledMessage.updateMany({
    where: { id, status: SCHEDULED_STATUS.PENDING },
    data: { content: validated.content, scheduledFor: validated.scheduledFor },
  })
  if (updated.count !== 1) {
    return NextResponse.json({ error: 'Message is no longer pending' }, { status: 409 })
  }

  const fresh = await prisma.scheduledMessage.findUnique({
    where: { id },
    include: { sender: { select: { name: true, email: true } } },
  })
  return NextResponse.json({ ok: true, scheduled: serialize(fresh) })
}

// DELETE — cancel a pending scheduled broadcast. Same atomic status guard.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireStaffSession()
  if (error) return error

  const canceled = await prisma.scheduledMessage.updateMany({
    where: { id, status: SCHEDULED_STATUS.PENDING },
    data: { status: SCHEDULED_STATUS.CANCELED },
  })
  if (canceled.count !== 1) {
    const existing = await prisma.scheduledMessage.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: 'Message is no longer pending' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
