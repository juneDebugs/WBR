import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

// GET /api/chat/rooms/[roomId]/messages
export async function GET(
  _request: Request,
  { params }: { params: { roomId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify user is a member
  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: params.roomId, userId: session.user.id } },
  })
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const messages = await prisma.message.findMany({
    where: { roomId: params.roomId },
    include: { sender: true },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })

  // Mark as read
  await prisma.chatMember.update({
    where: { roomId_userId: { roomId: params.roomId, userId: session.user.id } },
    data: { lastReadAt: new Date() },
  })

  return NextResponse.json(messages)
}

// POST /api/chat/rooms/[roomId]/messages
export async function POST(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: params.roomId, userId: session.user.id } },
  })
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { content } = await request.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  const message = await prisma.message.create({
    data: {
      roomId: params.roomId,
      senderId: session.user.id,
      content: content.trim(),
    },
    include: { sender: true },
  })

  return NextResponse.json(message)
}
