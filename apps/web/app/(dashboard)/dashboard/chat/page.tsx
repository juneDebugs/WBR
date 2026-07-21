import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { prisma } from '@conference/db'
import { authOptions } from '@/lib/auth'
import { AdminHeader } from '@/components/AdminHeader'
import { ChatTabsShell } from '@/components/ChatTabsShell'
import { permissionDenied } from '@/lib/require-permission'
import { getChatSettingsView } from '@/lib/chat-settings-server'

const GENERAL_ROOM_ID = 'room-general'

// Editing chat messaging permissions is a staff/organizer action, matching the
// other Chat mutations (broadcast, sync-members, clear-all).
const EDIT_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

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

  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  const canEditSettings = EDIT_ROLES.includes(role)

  const [data, settingsView] = await Promise.all([getCachedChatData(), getChatSettingsView()])

  return (
    <>
      <AdminHeader title="Chat" />
      <main className="flex-1 p-6">
        <ChatTabsShell chatInitialData={data} settingsInitialData={settingsView} canEditSettings={canEditSettings} />
      </main>
    </>
  )
}
