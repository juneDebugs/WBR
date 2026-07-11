import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, getOrCreateDirectRoom } from '@conference/db'

// GET /api/chat/rooms — list rooms the current user is a member of
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rooms = await prisma.chatRoom.findMany({
    where: {
      members: { some: { userId: session.user.id } },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, image: true } } } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { sender: { select: { id: true, name: true, image: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(rooms)
}

// POST /api/chat/rooms — create a direct message room with another user
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { targetUserId } = await request.json()
  if (!targetUserId) return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 })

  const result = await getOrCreateDirectRoom(prisma, session.user.id, targetUserId)
  if (!result.ok) {
    if ((result as any).code === 'NOT_FRIENDS') {
      return NextResponse.json({ error: result.error, code: 'NOT_FRIENDS' }, { status: 403 })
    }
    const status = result.error === 'User not found' ? 404 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json(result.room)
}
