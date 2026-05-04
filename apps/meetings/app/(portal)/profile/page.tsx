import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
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
  const session = await getSession()
  const userId = (session!.user as any).id as string

  const user = await getCachedProfile(userId)

  return <ProfileForm user={user!} />
}
