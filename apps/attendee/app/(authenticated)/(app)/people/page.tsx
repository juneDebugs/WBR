import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import { PeopleClient } from '@/components/people/PeopleClient'

const userSelect = {
  id: true,
  name: true,
  image: true,
  company: true,
  jobTitle: true,
  bio: true,
  website: true,
} as const

const getCachedAllPeople = unstable_cache(
  async () => {
    const [allUsers, totalCount] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
        orderBy: { name: 'asc' },
        select: userSelect,
        take: 200,
      }),
      prisma.user.count({
        where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
      }),
    ])
    return { allUsers, totalCount }
  },
  ['attendee-all-people'],
  { revalidate: 60, tags: ['attendees'] },
)

function getCachedUserSocial(userId: string) {
  return unstable_cache(
    async () => {
      const [following, dmRooms] = await Promise.all([
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
      return { following, dmRooms }
    },
    ['attendee-user-social', userId],
    { revalidate: 30, tags: [`user-social-${userId}`] },
  )()
}

export default async function PeoplePage() {
  const session = (await getSession())!

  const userId = session.user!.id

  const [peopleData, socialData] = await Promise.all([
    getCachedAllPeople(),
    getCachedUserSocial(userId),
  ])

  const { allUsers: allUsersRaw, totalCount } = peopleData
  const { following, dmRooms } = socialData

  // Filter out current user from the cached global list
  const allUsers = allUsersRaw.filter(u => u.id !== userId)

  function mapUser(u: typeof allUsers[number]) {
    return {
      id: u.id,
      name: u.name,
      image: u.image,
      company: u.company,
      jobTitle: u.jobTitle,
      bio: u.bio,
      website: u.website,
    }
  }

  const friendIds = following.map(f => f.followingId)

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

  return (
    <PeopleClient
      currentUserId={userId}
      allUsers={allUsers.map(mapUser)}
      totalCount={totalCount}
      friends={following.map(f => mapUser(f.following))}
      friendIds={friendIds}
      conversations={conversations}
    />
  )
}
