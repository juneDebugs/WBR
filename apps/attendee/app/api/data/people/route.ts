import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'

const userSelect = {
  id: true,
  name: true,
  image: true,
  company: true,
  jobTitle: true,
  bio: true,
  website: true,
  linkedinUrl: true,
} as const

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any).id as string

  const [allUsers, totalCount, following, dmRooms] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ['ATTENDEE', 'SPEAKER'] }, id: { not: userId } },
      orderBy: { name: 'asc' },
      select: userSelect,
      take: 200,
    }),
    prisma.user.count({
      where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true, following: { select: userSelect } },
    }),
    prisma.chatRoom.findMany({
      where: { type: 'DIRECT', members: { some: { userId } } },
      include: {
        members: { select: { userId: true, user: { select: { id: true, name: true, image: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, senderId: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const friendIds = following.map(f => f.followingId)
  const friends = following.map(f => f.following)

  const conversations = dmRooms
    .sort((a, b) => {
      const aTime = a.messages[0]?.createdAt ? new Date(a.messages[0].createdAt).getTime() : 0
      const bTime = b.messages[0]?.createdAt ? new Date(b.messages[0].createdAt).getTime() : 0
      return bTime - aTime
    })
    .map(room => {
      const other = room.members.find(m => m.userId !== userId)?.user
      const lastMsg = room.messages[0]
      return {
        roomId: room.id,
        userId: other?.id ?? '',
        name: other?.name ?? 'Unknown',
        image: other?.image ?? null,
        lastMessage: lastMsg?.content ?? null,
        lastMessageSenderId: lastMsg?.senderId ?? null,
        lastMessageAt: lastMsg?.createdAt ? new Date(lastMsg.createdAt).toISOString() : null,
      }
    })

  return NextResponse.json({
    currentUserId: userId,
    allUsers,
    totalCount,
    friends,
    friendIds,
    conversations,
  })
}
