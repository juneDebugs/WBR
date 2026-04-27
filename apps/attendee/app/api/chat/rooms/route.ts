import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

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

  const myId = session.user.id

  // Check if a DM room already exists between these two users
  const existing = await prisma.chatRoom.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { members: { some: { userId: myId } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
  })

  if (existing) return NextResponse.json(existing)

  const room = await prisma.chatRoom.create({
    data: {
      type: 'DIRECT',
      members: {
        create: [{ userId: myId }, { userId: targetUserId }],
      },
    },
  })

  return NextResponse.json(room)
}
