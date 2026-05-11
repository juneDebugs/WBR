import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = user.id

  const rooms = await prisma.chatRoom.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      type: true,
      members: { select: { userId: true, user: { select: { id: true, name: true, image: true } } } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, content: true, createdAt: true, sender: { select: { id: true, name: true } } },
      },
    },
  })

  // Sort: channels first, then DMs by latest message
  const sorted = rooms.sort((a, b) => {
    if (a.type === 'CHANNEL' && b.type !== 'CHANNEL') return -1
    if (b.type === 'CHANNEL' && a.type !== 'CHANNEL') return 1
    const aTime = a.messages[0]?.createdAt.getTime() ?? 0
    const bTime = b.messages[0]?.createdAt.getTime() ?? 0
    return bTime - aTime
  })

  return NextResponse.json({
    userId,
    rooms: sorted.map(room => ({
      id: room.id,
      name: room.name,
      type: room.type,
      members: room.members.map(m => ({ userId: m.userId, user: m.user })),
      lastMessage: room.messages[0]
        ? {
            id: room.messages[0].id,
            content: room.messages[0].content,
            createdAt: room.messages[0].createdAt.toISOString(),
            sender: room.messages[0].sender,
          }
        : null,
    })),
  })
}
