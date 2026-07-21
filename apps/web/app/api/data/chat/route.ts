import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache, revalidateTag } from 'next/cache'
import { prisma, dispatchDueScheduledMessages } from '@conference/db'

const GENERAL_ROOM_ID = 'room-general'

const getCachedChatData = unstable_cache(
  async () => {
    const [generalRoom, totalUsers] = await Promise.all([
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
      prisma.user.count(),
    ])

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
