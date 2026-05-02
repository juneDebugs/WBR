export const revalidate = 0
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { ProfileForm } from '@/components/ProfileForm'

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  const userId = (session!.user as any).id as string

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, bio: true, website: true, companySize: true, annualRevenue: true, solutionsOffering: true, solutionsSeeking: true },
  })

  return <ProfileForm user={user!} />
}
