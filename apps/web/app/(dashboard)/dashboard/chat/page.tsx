import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { ChatPageClient } from '@/components/ChatPageClient'
import { permissionDenied } from '@/lib/require-permission'

const GENERAL_ROOM_ID = 'room-general'

const getCachedChatData = unstable_cache(
  async () => {
    const [generalRoom, totalUsers] = await Promise.all([
      prisma.chatRoom.findUnique({
        where: { id: GENERAL_ROOM_ID },
        include: {
          _count: { select: { members: true, messages: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 20, include: { sender: { select: { id: true, name: true, email: true, image: true } } } },
        },
      }),
      prisma.user.count(),
    ])
    return {
      memberCount: generalRoom?._count.members ?? 0,
      totalUsers,
      messageCount: generalRoom?._count.messages ?? 0,
      recentMessages: (generalRoom?.messages ?? []).reverse().map(m => ({ id: m.id, content: m.content, createdAt: m.createdAt.toISOString(), sender: { name: m.sender.name, email: m.sender.email } })),
    }
  },
  ['web-chat-data'],
  { revalidate: 120, tags: ['chat'] },
)

export default async function ChatPage() {
  const denied = await permissionDenied('chat', 'Chat')
  if (denied) return denied

  const data = await getCachedChatData()
  return (
    <>
      <AdminHeader title="Chat" />
      <main className="flex-1 p-6">
        <ChatPageClient initialData={data} />
      </main>
    </>
  )
}
