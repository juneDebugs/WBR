import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { ProfileEditor } from '@/components/ProfileEditor'

function getCachedSponsorProfile(sponsorId: string) {
  return unstable_cache(
    async () => prisma.sponsor.findUnique({
      where: { id: sponsorId },
      include: {
        users: { select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true } },
      },
    }),
    ['profile-sponsor', sponsorId],
    { revalidate: 60, tags: [`sponsor-${sponsorId}`] },
  )()
}

const getCachedAvailableUsers = unstable_cache(
  async () => prisma.user.findMany({
    where: { sponsorId: null, role: { not: 'ORGANIZER' } },
    select: { id: true, name: true, email: true, image: true, jobTitle: true },
    orderBy: { name: 'asc' },
    take: 200,
  }),
  ['profile-available-users'],
  { revalidate: 120, tags: ['attendee-pool'] },
)

export default async function ProfilePage() {
  const session = await getSession()
  const user = session!.user as any

  if (!user.sponsorId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">No sponsor company linked to your account.</p>
      </div>
    )
  }

  const [sponsor, allUsers] = await Promise.all([
    getCachedSponsorProfile(user.sponsorId),
    getCachedAvailableUsers(),
  ])

  if (!sponsor) redirect('/dashboard')

  return (
    <ProfileEditor
      sponsor={JSON.parse(JSON.stringify(sponsor))}
      currentUserId={user.id}
      availableUsers={JSON.parse(JSON.stringify(allUsers))}
    />
  )
}
