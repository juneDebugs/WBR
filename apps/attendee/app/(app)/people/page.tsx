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
    speakerProfile: {
      select: {
        confSessions: {
          select: { id: true, title: true, startsAt: true, room: true, track: true },
          orderBy: { startsAt: 'asc' as const },
        },
      },
    },
  }

  const [allUsers, following, followers] = await Promise.all([
    prisma.user.findMany({
      where: { id: { not: userId } },
      orderBy: { name: 'asc' },
      select: userSelect,
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      include: { following: { select: userSelect } },
    }),
    prisma.follow.findMany({
      where: { followingId: userId },
      include: { follower: { select: userSelect } },
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
      sessions: u.speakerProfile?.confSessions.map(s => ({
        id: s.id,
        title: s.title,
        startsAt: s.startsAt.toISOString(),
        room: s.room,
        track: s.track,
      })) ?? [],
    }
  }

  const followingIds = new Set(following.map(f => f.followingId))

  return (
    <PeopleClient
      currentUserId={userId}
      allUsers={allUsers.map(mapUser)}
      following={following.map(f => mapUser(f.following))}
      followers={followers.map(f => mapUser(f.follower))}
      followingIds={Array.from(followingIds)}
    />
  )
}
