import { prisma } from '@conference/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { ChatView } from '@/components/chat/ChatView'

export default async function ChatRoomPage({ params }: { params: { roomId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const room = await prisma.chatRoom.findUnique({
    where: { id: params.roomId },
    include: { members: { include: { user: { select: { id: true, name: true, image: true } } } } },
  })

  if (!room) notFound()

  const isMember = room.members.some(m => m.userId === userId)
  if (!isMember) notFound()

  const initialMessages = await prisma.message.findMany({
    where: { roomId: params.roomId },
    include: { sender: true },
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
      roomId={params.roomId}
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
