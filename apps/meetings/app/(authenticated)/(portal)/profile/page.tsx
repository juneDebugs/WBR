import { unstable_cache } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { prisma } from '@conference/db'
import { ProfileForm } from '@/components/ProfileForm'

function getCachedProfile(userId: string) {
  return unstable_cache(
    async () => prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, bio: true, website: true, companySize: true, annualRevenue: true, solutionsOffering: true, solutionsSeeking: true },
    }),
    ['meetings-user-profile', userId],
    { revalidate: 30, tags: [`meetings-user-${userId}`] },
  )()
}

export default async function ProfilePage() {
  const user = await getUserFromHeaders()
  const profile = await getCachedProfile(user.id)
  return <ProfileForm user={profile!} />
}
