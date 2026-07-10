import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  prisma,
  dispatchDueScheduledMessagesThrottled,
  GENERAL_ROOM_ID,
  listGlobalFeed,
  postGlobalMessage,
} from '@conference/db'

// GET — fetch messages from the shared general room
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Delivery tick for admin-scheduled broadcasts (see apps/web chat page).
  // Throttled per instance so hot polling doesn't tax every request.
  await dispatchDueScheduledMessagesThrottled(prisma)

  const messages = await listGlobalFeed(prisma)

  return NextResponse.json({ roomId: GENERAL_ROOM_ID, messages })
}

// POST — send a message to the shared general room
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await req.json()

  const result = await postGlobalMessage(prisma, session.user.id, content)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json(result.message)
}
