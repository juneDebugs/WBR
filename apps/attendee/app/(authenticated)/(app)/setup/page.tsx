export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import { SetupClient } from '@/components/setup/SetupClient'

export default async function SetupPage() {
  const session = (await getSession())!

  const userId = session.user!.id

  const [user, blackouts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, image: true, bio: true, jobTitle: true, company: true, website: true, companySize: true, annualRevenue: true, solutionsOffering: true, solutionsSeeking: true },
    }),
    prisma.blackoutTime.findMany({
      where: { userId },
      orderBy: { startsAt: 'asc' },
    }),
  ])

  return (
    <SetupClient
      userId={userId}
      userName={user?.name ?? null}
      userImage={user?.image ?? null}
      userBio={user?.bio ?? null}
      userJobTitle={user?.jobTitle ?? null}
      userCompany={user?.company ?? null}
      userWebsite={user?.website ?? null}
      userCompanySize={user?.companySize ?? null}
      userAnnualRevenue={user?.annualRevenue ?? null}
      userSolutionsOffering={user?.solutionsOffering ?? null}
      userSolutionsSeeking={user?.solutionsSeeking ?? null}
      blackouts={blackouts.map(b => ({
        id: b.id,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        reason: b.reason,
      }))}
    />
  )
}
