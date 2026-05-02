export const revalidate = 0
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { GlobalChatAdmin } from '@/components/GlobalChatAdmin'
import { DMRoomsClient } from '@/components/DMRoomsClient'

const GENERAL_ROOM_ID = 'room-general'

export default async function ChatAdminPage() {
  const [generalRoom, dmRooms, totalUsers] = await Promise.all([
    prisma.chatRoom.findUnique({
      where: { id: GENERAL_ROOM_ID },
      include: {
        _count: { select: { members: true, messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { sender: true },
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

  return (
    <>
      <AdminHeader title="Chat" />
      <main className="flex-1 p-6">
        <GlobalChatAdmin
          memberCount={generalRoom?._count.members ?? 0}
          totalUsers={totalUsers}
          messageCount={generalRoom?._count.messages ?? 0}
          recentMessages={(generalRoom?.messages ?? []).reverse().map(m => ({
            id: m.id,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
            sender: { name: m.sender.name, email: m.sender.email },
          }))}
        />

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Direct Messages — {rooms.length} conversation{rooms.length !== 1 ? 's' : ''}
        </p>
        <DMRoomsClient rooms={rooms} />
      </main>
    </>
  )
}
