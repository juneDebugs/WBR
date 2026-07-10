import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache, revalidateTag } from 'next/cache'
import { prisma, dispatchDueScheduledMessages } from '@conference/db'

const GENERAL_ROOM_ID = 'room-general'

const getCachedChatData = unstable_cache(
  async () => {
    const [generalRoom, dmRooms, totalUsers] = await Promise.all([
      prisma.chatRoom.findUnique({
        where: { id: GENERAL_ROOM_ID },
        include: {
          _count: { select: { members: true, messages: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { sender: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
      }),
      prisma.chatRoom.findMany({
        where: { type: 'DIRECT' },
        include: {
          members: { include: { user: { select: { name: true, email: true, image: true } } } },
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { sender: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.user.count(),
    ])

    const rooms = dmRooms.map(r => ({
      id: r.id,
      members: r.members.map(m => ({
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
      })),
      messageCount: r._count.messages,
      lastMessage: r.messages[0]
        ? {
            id: r.messages[0].id,
            content: r.messages[0].content,
            createdAt: r.messages[0].createdAt.toISOString(),
            sender: { name: r.messages[0].sender.name, email: r.messages[0].sender.email },
          }
        : null,
    }))

    return {
      memberCount: generalRoom?._count.members ?? 0,
      totalUsers,
      messageCount: generalRoom?._count.messages ?? 0,
      recentMessages: (generalRoom?.messages ?? []).reverse().map(m => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        sender: { name: m.sender.name, email: m.sender.email },
      })),
      rooms,
    }
  },
  ['web-chat-data'],
  { revalidate: 120, tags: ['chat'] },
)

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Opportunistic dispatch tick: deliver any due scheduled broadcasts before
  // serving chat data, so an open admin chat page acts as a delivery clock.
  const dispatched = await dispatchDueScheduledMessages(prisma)
  if (dispatched.sent > 0) revalidateTag('chat')
  const data = await getCachedChatData()
  return NextResponse.json(data)
}
