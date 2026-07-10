import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  prisma,
  dispatchDueScheduledMessages,
  validateSchedulePayload,
  GENERAL_ROOM_ID,
  SCHEDULED_STATUS,
} from '@conference/db'

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

// GET — list scheduled broadcasts (pending queue + recent history).
// Doubles as a dispatch tick: any admin viewing the queue delivers due messages.
export async function GET() {
  const { error } = await requireStaffSession()
  if (error) return error

  const dispatched = await dispatchDueScheduledMessages(prisma)

  const senderSelect = { sender: { select: { name: true, email: true } } }
  const [pending, history] = await Promise.all([
    prisma.scheduledMessage.findMany({
      where: { roomId: GENERAL_ROOM_ID, status: SCHEDULED_STATUS.PENDING },
      orderBy: { scheduledFor: 'asc' },
      include: senderSelect,
    }),
    prisma.scheduledMessage.findMany({
      where: { roomId: GENERAL_ROOM_ID, status: { in: [SCHEDULED_STATUS.SENT, SCHEDULED_STATUS.FAILED] } },
      orderBy: { scheduledFor: 'desc' },
      take: 10,
      include: senderSelect,
    }),
  ])

  // Bust the admin chat cache when this tick delivered something, and also
  // when another app's tick delivered recently (attendee polls usually win
  // the race) — otherwise /api/data/chat can serve the pre-delivery payload
  // for up to its 120s revalidate window.
  const sentRecently = history.some(
    h => h.sentAt && Date.now() - h.sentAt.getTime() < 60_000
  )
  if (dispatched.sent > 0 || sentRecently) revalidateTag('chat')

  return NextResponse.json({
    pending: pending.map(serialize),
    history: history.map(serialize),
    dispatched,
  })
}

// POST — schedule a new broadcast to the general room.
export async function POST(req: Request) {
  const { session, error } = await requireStaffSession()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const validated = validateSchedulePayload(body.message, body.scheduledFor)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const sender = await prisma.user.findUnique({ where: { email: session!.user!.email! } })
  if (!sender) return NextResponse.json({ error: 'Sender not found' }, { status: 404 })

  // The scheduled row has an FK to the room — make sure it exists even on a
  // fresh database where nobody has chatted yet.
  await prisma.chatRoom.upsert({
    where: { id: GENERAL_ROOM_ID },
    create: { id: GENERAL_ROOM_ID, name: 'General', type: 'CHANNEL' },
    update: {},
  })

  const scheduled = await prisma.scheduledMessage.create({
    data: {
      roomId: GENERAL_ROOM_ID,
      senderId: sender.id,
      content: validated.content,
      scheduledFor: validated.scheduledFor,
    },
    include: { sender: { select: { name: true, email: true } } },
  })

  return NextResponse.json({ ok: true, scheduled: serialize(scheduled) }, { status: 201 })
}
