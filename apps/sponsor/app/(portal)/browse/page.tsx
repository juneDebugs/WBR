export const revalidate = 120
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { SponsorBrowseView } from '@/components/SponsorBrowseView'

export default async function BrowsePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const user = session.user as any

  const people = await prisma.user.findMany({
    where: {
      role: { in: ['ATTENDEE', 'SPEAKER'] },
    },
    select: {
      id: true, name: true, image: true, company: true, jobTitle: true, bio: true,
      role: true, companySize: true, annualRevenue: true,
      solutionsOffering: true, solutionsSeeking: true, website: true, sponsorId: true,
    },
    orderBy: { name: 'asc' },
    take: 500,
  })

  return (
    <SponsorBrowseView
      people={JSON.parse(JSON.stringify(people))}
      sponsorId={user.sponsorId ?? null}
      isStaff={user.role === 'STAFF'}
    />
  )
}
