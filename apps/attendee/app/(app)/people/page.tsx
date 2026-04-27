import { prisma } from '@conference/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PeopleClient } from '@/components/people/PeopleClient'

export default async function PeoplePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const userSelect = {
    id: true,
    name: true,
    image: true,
    company: true,
    jobTitle: true,
    bio: true,
    website: true,
    speakerProfile: {
      select: {
        confSessions: {
          select: { id: true, title: true, startsAt: true, room: true, track: true },
          orderBy: { startsAt: 'asc' as const },
        },
      },
    },
  }

  const [allUsers, following, dmRooms] = await Promise.all([
    prisma.user.findMany({
      where: { id: { not: userId } },
      orderBy: { name: 'asc' },
      select: userSelect,
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      include: { following: { select: userSelect } },
    }),
    prisma.chatRoom.findMany({
      where: { type: 'DIRECT', members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, image: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { id: true } } } },
      },
      orderBy: { messages: { _count: 'desc' } },
    }),
  ])

  function mapUser(u: typeof allUsers[number]) {
    return {
      id: u.id,
      name: u.name,
      image: u.image,
      company: u.company,
      jobTitle: u.jobTitle,
      bio: u.bio,
      website: u.website,
      sessions: u.speakerProfile?.confSessions.map(s => ({
        id: s.id,
        title: s.title,
        startsAt: s.startsAt.toISOString(),
        room: s.room,
        track: s.track,
      })) ?? [],
    }
  }

  const friendIds = following.map(f => f.followingId)

  const conversations = dmRooms
    .sort((a, b) => {
      const aTime = a.messages[0]?.createdAt.getTime() ?? 0
      const bTime = b.messages[0]?.createdAt.getTime() ?? 0
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
        lastMessageSenderId: lastMsg?.sender.id ?? null,
        lastMessageAt: lastMsg?.createdAt.toISOString() ?? null,
      }
    })

  return (
    <PeopleClient
      currentUserId={userId}
      allUsers={allUsers.map(mapUser)}
      friends={following.map(f => mapUser(f.following))}
      friendIds={friendIds}
      conversations={conversations}
    />
  )
}
