import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { prisma } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'
import { ADDABLE_TEAMMATE_ROLE_FILTER } from '@/lib/addable-teammate'

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

// The list an exhibitor is offered when adding a teammate.
//
// The role condition comes from lib/addable-teammate.ts, which is also what the
// attach handler tests, so the screen and the address cannot disagree about who
// may be added. It used to read `role: { not: 'ORGANIZER' }` — one WBR-side role
// excluded and the other three left in, so WBR staff and administrator accounts
// appeared in a list an outside company browses. Phase 6.5.
//
// `take: 200` is unchanged and matters when writing a test against this: with
// over 2,400 unattached accounts, a fixture is only reachable through the real
// screen if its name sorts into the first 200. Phase 13 lost time to that.
const getCachedAvailableUsers = unstable_cache(
  async () => prisma.user.findMany({
    where: { sponsorId: null, ...ADDABLE_TEAMMATE_ROLE_FILTER },
    select: { id: true, name: true, email: true, image: true, jobTitle: true },
    orderBy: { name: 'asc' },
    take: 200,
  }),
  ['profile-available-users'],
  { revalidate: 120, tags: ['attendee-pool'] },
)

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // BEFORE the no-company branch below, deliberately. That branch answers 200
  // with emptied contents, which the refusal-shape decision rejects by name: a
  // 200 with nothing in it is indistinguishable from a company that has no data
  // yet, and invisible to any assertion on status. A representative with no
  // company link is refused here instead (OE 23).
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused

  // Company from the database, not the session token: a representative moved
  // between companies mid-session was shown the previous company's profile and
  // the previous company's team. Phase 6.5.
  if (!companyId) return NextResponse.json({ sponsor: null, availableUsers: [] })

  const [sponsor, availableUsers] = await Promise.all([
    getCachedSponsorProfile(companyId),
    getCachedAvailableUsers(),
  ])

  return NextResponse.json({
    sponsor: sponsor ? JSON.parse(JSON.stringify(sponsor)) : null,
    availableUsers: JSON.parse(JSON.stringify(availableUsers)),
  })
}
