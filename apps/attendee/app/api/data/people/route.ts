import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getUserFromHeaders } from '@/lib/user'
import { prisma, deriveFriendStatusMap } from '@conference/db'

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
  // Try middleware headers first, fall back to session
  let userId: string | null = null
  const headerUser = await getUserFromHeaders()
  if (headerUser) {
    userId = headerUser.id
  } else {
    const session = await getSession()
    userId = (session?.user as any)?.id ?? null
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [allUsers, totalCount, outgoingEdges, incomingEdges, dmRooms, conference] = await Promise.all([
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
      prisma.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true, follower: { select: userSelect } },
      }),
      prisma.chatRoom.findMany({
        where: { type: 'DIRECT', members: { some: { userId } } },
        include: {
          members: { select: { userId: true, user: { select: { id: true, name: true, image: true } } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, senderId: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.conference.findFirst({
        where: { active: true },
        select: { name: true },
      }),
    ])

    // Friendship = mutual Follow edges. The edges are fetched here (with the
    // user projections this response needs); the status rules live in one
    // place — deriveFriendStatusMap in packages/db/src/friends.ts.
    const friendStatuses = deriveFriendStatusMap(
      outgoingEdges.map(e => e.followingId),
      incomingEdges.map(e => e.followerId)
    )

    // Mutual friends only
    const friendIds = outgoingEdges
      .filter(e => friendStatuses[e.followingId] === 'friends')
      .map(e => e.followingId)
    const friends = outgoingEdges
      .filter(e => friendStatuses[e.followingId] === 'friends')
      .map(e => e.following)

    // Users who requested me and I haven't accepted yet
    const incomingRequests = incomingEdges
      .filter(e => friendStatuses[e.followerId] === 'pending_incoming')
      .map(e => e.follower)

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
      friendStatuses,
      incomingRequests,
      conversations,
      conferenceName: conference?.name ?? null,
    })
  } catch (e: any) {
    console.error('[api/data/people] Error:', e?.message, e?.stack)
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 })
  }
}
