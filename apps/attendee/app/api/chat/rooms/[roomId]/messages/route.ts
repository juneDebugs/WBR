import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  prisma,
  dispatchDueScheduledMessagesThrottled,
  GENERAL_ROOM_ID,
  listRoomMessagesForUser,
  postRoomMessage,
} from '@conference/db'

// GET /api/chat/rooms/[roomId]/messages
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Delivery tick for admin-scheduled broadcasts: attendees polling the
  // general room every 15s materialize any due scheduled messages, so
  // delivery does not depend on an admin having the dashboard open.
  // Throttled per instance so hot polling doesn't tax every request.
  if (roomId === GENERAL_ROOM_ID) {
    await dispatchDueScheduledMessagesThrottled(prisma)
  }

  const result = await listRoomMessagesForUser(prisma, roomId, session.user.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 })

  return NextResponse.json(result.messages)
}

// POST /api/chat/rooms/[roomId]/messages
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await request.json()

  const result = await postRoomMessage(prisma, roomId, session.user.id, content)
  if (!result.ok) {
    const status = result.error === 'Forbidden' ? 403 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json(result.message)
}
