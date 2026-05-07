export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import { notFound } from 'next/navigation'
import { ChatView } from '@/components/chat/ChatView'

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  const session = (await getSession())!

  const userId = session.user!.id

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: { members: { include: { user: { select: { id: true, name: true, image: true } } } } },
  })

  if (!room) notFound()

  const isMember = room.members.some(m => m.userId === userId)
  if (!isMember) notFound()

  const initialMessages = await prisma.message.findMany({
    where: { roomId },
    include: { sender: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })

  const isChannel = room.type === 'CHANNEL'
  const otherMember = !isChannel
    ? room.members.find(m => m.userId !== userId)?.user
    : null
  const displayName = isChannel ? `# ${room.name}` : (otherMember?.name ?? 'Chat')

  return (
    <ChatView
      roomId={roomId}
      displayName={displayName}
      initialMessages={initialMessages.map(m => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        sender: { id: m.sender.id, name: m.sender.name, image: m.sender.image },
      }))}
      currentUserId={userId}
      currentUserName={session.user.name ?? ''}
    />
  )
}
