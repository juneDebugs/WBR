export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import { notFound } from 'next/navigation'
import { ChatView } from '@/components/chat/ChatView'

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  const session = (await getSession())!

  const userId = session.user!.id

  // Three independent reads in parallel. The room query no longer pulls the
  // full member list with base64 avatars (ADR 0004) — the General channel
  // auto-enrolls every attendee, so that shipped multi-MB payloads just to
  // compute a display name. We fetch only the single DM counterparty (no
  // image, never rendered) and probe membership with a separate query, since
  // Prisma cannot `include` the same `members` relation twice with different
  // filters.
  const [room, membership, initialMessages] = await Promise.all([
    prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        type: true,
        members: {
          where: { userId: { not: userId } },
          orderBy: { joinedAt: 'asc' },
          take: 1,
          select: { user: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { userId: true },
    }),
    prisma.message.findMany({
      where: { roomId },
      include: { sender: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  ])

  if (!room || !membership) notFound()

  const isChannel = room.type === 'CHANNEL'
  const otherMember = !isChannel ? room.members[0]?.user : null
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
      otherUserId={otherMember?.id ?? null}
    />
  )
}
