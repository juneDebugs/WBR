import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reading is gated too: a delegate whose required set is incomplete is
  // refused here, not only at the screens. Blocking every screen while
  // leaving the data behind them readable is not a block.
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const userId = user.id

  const [profile, blackouts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, image: true, bio: true, jobTitle: true, company: true, website: true, companySize: true, annualRevenue: true, solutionsOffering: true, solutionsSeeking: true },
    }),
    prisma.blackoutTime.findMany({
      where: { userId },
      orderBy: { startsAt: 'asc' },
    }),
  ])

  return NextResponse.json({
    userId,
    userName: profile?.name ?? null,
    userImage: profile?.image ?? null,
    userBio: profile?.bio ?? null,
    userJobTitle: profile?.jobTitle ?? null,
    userCompany: profile?.company ?? null,
    userWebsite: profile?.website ?? null,
    userCompanySize: profile?.companySize ?? null,
    userAnnualRevenue: profile?.annualRevenue ?? null,
    userSolutionsOffering: profile?.solutionsOffering ?? null,
    userSolutionsSeeking: profile?.solutionsSeeking ?? null,
    blackouts: blackouts.map(b => ({
      id: b.id,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      reason: b.reason,
    })),
  })
}
