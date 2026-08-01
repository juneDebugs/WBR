import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'
import { ADDABLE_TEAMMATE_ROLE_FILTER, isAddableTeammateRole } from '@/lib/addable-teammate'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([], { status: 401 })

  // The company's team list (OE 19). Note this handler's own refusal below
  // answers 403 with an empty ARRAY rather than the standard body; the guard
  // returns the standard one, so a refused caller here gets the same shape it
  // gets everywhere else.
  //
  // From the database, not the token: reading the token here would show a moved
  // representative their FORMER company's team. Phase 13 got that right using a
  // helper that issued its own query; Phase 6.5 takes the same value from the
  // guard, which had already fetched it, and deleted the helper.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused

  const user = session.user as any
  if (!companyId) return NextResponse.json([], { status: 403 })

  const teammates = await prisma.user.findMany({
    where: { sponsorId: companyId, id: { not: user.id } },
    select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(teammates)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // THIS IS THE ADDRESS THAT MOVES A PERSON BETWEEN COMPANIES, which is what
  // makes a session token an unreliable source for the company link — it sets
  // another user's sponsorId to the caller's, and the DELETE below sets it to
  // null, both while that person holds a live session. The guard reads the
  // company from the database for exactly this reason; see the note in
  // lib/require-complete-profile.ts and the longer one in api/profile/route.ts.
  //
  // THE COMPANY COMES FROM THE DATABASE, NOT THE SESSION TOKEN. Phase 13, after
  // adversarial review round 1; re-pointed at the guard's value by Phase 6.5,
  // which removed the second query the old helper made. A token is issued at
  // sign-in and never changes, and this very handler is one of the two that can
  // move somebody between companies, so a representative moved mid-session
  // would otherwise go on attaching people to the company they have left.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused

  const user = session.user as any
  if (!companyId) return NextResponse.json({ error: 'No sponsor linked' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // REFUSE A TARGET THAT BELONGS TO SOMEBODY ELSE. Phase 13.
  //
  // (An earlier draft of this comment said "read the target before writing to
  // it", which stopped being true when round 1's fix replaced the read-then-write
  // with the single conditional write below. Corrected rather than left, because
  // a comment describing code that no longer exists is worse than no comment.)
  //
  // Until Phase 13 this handler went straight to `update` on whatever identifier
  // the request carried, so ANY representative could take ANY account — including
  // another company's representative — and write their own company onto it.
  // Measured during Phase 6, not inferred: company B's representative moved
  // company A's representative onto company B and received 200. Reproduction in
  // docs/smoketests/phase-6-sponsor-request-guard.md finding 2.
  //
  // THIS INTRODUCES NO NEW RULE. It applies an existing one to the third of three
  // paths that reach the same column:
  //   - register/route.ts already answers 409 for a target that belongs to
  //     another company, in the same words used below;
  //   - the DELETE in this file already refuses a target that does not belong to
  //     the caller's company;
  //   - this POST is the one that never got the check.
  // It also matches the screen that calls it, which only ever offers accounts
  // with no company — see getCachedAvailableUsers in
  // app/api/profile/sponsor-data/route.ts. That query is presentation, not
  // authorization: it is cached for 120 seconds and can be bypassed entirely by
  // calling this address directly, which is how the defect was measured.
  //
  // ONE CONDITIONAL WRITE, NOT A READ FOLLOWED BY A WRITE.
  //
  // The first version of this fix read the target, decided, and then wrote.
  // Adversarial review round 1 pointed out that two companies can both read an
  // unattached person before either writes, so both pass the check and the
  // second write silently wins. MEASURED BEFORE CHANGING ANYTHING, because two
  // of Phase 6's findings were mechanisms whose predicted consequence never
  // happened: two representatives attaching the same unattached person at the
  // same moment both received `200` in **15 of 15 attempts**. Not a rare race.
  //
  // The condition lives in the write itself, so the database decides. `updateMany`
  // is used rather than `update` because only `updateMany` accepts a filter
  // beyond the primary key; it changes at most one row here, since `id` is unique.
  //
  // THE ROLE IS DELIBERATELY UNTOUCHED — only `sponsorId` is written. An account
  // reaching this line already exists and already has a role. Promoting it to
  // SPONSOR to let it into this portal would simultaneously remove its access to
  // the meetings portal, which packages/db/src/app-access.ts opens to ATTENDEE
  // and SPEAKER and not to SPONSOR. Worse, the exhibitor could not undo it: the
  // DELETE below clears only the company link, so detaching would leave that
  // person holding SPONSOR with no company — refused by the meetings portal and
  // stranded on the no-company screen. Decided 2026-07-31; the rejected
  // alternatives are recorded in the plan's Phase 13. The consequence, that an
  // attached colleague cannot use this portal, is now stated on the screen
  // instead of implied away.
  // AND THE TARGET MUST BE A KIND OF PERSON AN EXHIBITOR MAY ADD. Phase 6.5.
  //
  // The role condition is the same one the picker query filters on — both read
  // lib/addable-teammate.ts — so the screen and this address cannot disagree
  // about who may be added. Enforced here as well as there because the picker
  // is presentation: it is cached for 120 seconds and can be bypassed entirely
  // by calling this address directly, which is how Phase 6 measured the
  // original defect in this handler.
  const attached = await prisma.user.updateMany({
    where: {
      id: userId,
      ...ADDABLE_TEAMMATE_ROLE_FILTER,
      // Unattached, or already on this team. Anything else belongs to somebody
      // else and is refused below.
      OR: [{ sponsorId: null }, { sponsorId: companyId }],
    },
    data: { sponsorId: companyId },
  })

  if (attached.count === 0) {
    // Nothing matched, and the three reasons need different answers. Read once
    // to tell them apart: an identifier matching nothing used to reach `update`
    // and throw, which Next turns into a 500 — a server fault reported for an
    // ordinary bad request.
    const exists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    })
    if (!exists) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!isAddableTeammateRole(exists.role)) {
      return NextResponse.json(
        { error: 'This account cannot be added to a sponsor team' },
        { status: 403 },
      )
    }
    return NextResponse.json(
      { error: 'This user is already linked to another sponsor' },
      { status: 409 },
    )
  }

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
  })

  revalidateTag(`sponsor-${companyId}`)
  revalidateTag('attendee-pool')

  return NextResponse.json(updated)
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // From the database, not the token: reading the token here would let a moved
  // representative detach people from the company they have left. Taken from
  // the guard's value by Phase 6.5, which removed the helper's extra query.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused

  const user = session.user as any
  if (!companyId) return NextResponse.json({ error: 'No sponsor linked' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Don't allow removing yourself
  if (userId === user.id) return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })

  // Only unlink if they belong to this sponsor. One conditional write, for the
  // same reason as the POST above: a separate read-then-write can be overtaken.
  const detached = await prisma.user.updateMany({
    where: { id: userId, sponsorId: companyId },
    data: { sponsorId: null },
  })
  if (detached.count === 0) {
    return NextResponse.json({ error: 'User not found in your team' }, { status: 404 })
  }

  revalidateTag(`sponsor-${companyId}`)
  revalidateTag('attendee-pool')

  return NextResponse.json({ ok: true })
}
