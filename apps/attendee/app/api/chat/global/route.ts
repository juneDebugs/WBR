import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

const GENERAL_ROOM_ID = 'room-general'

async function ensureRoom() {
  await prisma.chatRoom.upsert({
    where: { id: GENERAL_ROOM_ID },
    create: { id: GENERAL_ROOM_ID, name: 'General', type: 'CHANNEL' },
    update: {},
  })
}

// GET — fetch messages from the shared general room
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureRoom()

  const messages = await prisma.message.findMany({
    where: { roomId: GENERAL_ROOM_ID },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: { sender: { select: { id: true, name: true, image: true } } },
  })

  return NextResponse.json({ roomId: GENERAL_ROOM_ID, messages })
}

// POST — send a message to the shared general room
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  await ensureRoom()

  // Ensure the user is a member
  await prisma.chatMember.upsert({
    where: { roomId_userId: { roomId: GENERAL_ROOM_ID, userId: session.user.id } },
    create: { roomId: GENERAL_ROOM_ID, userId: session.user.id },
    update: {},
  })

  const message = await prisma.message.create({
    data: { roomId: GENERAL_ROOM_ID, senderId: session.user.id, content: content.trim() },
    include: { sender: { select: { id: true, name: true, image: true } } },
  })

  return NextResponse.json(message)
}
