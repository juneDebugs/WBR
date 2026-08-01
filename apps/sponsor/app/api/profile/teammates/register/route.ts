import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, hashPassword } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'
import { isAddableTeammateRole, ADDABLE_TEAMMATE_ROLE_FILTER } from '@/lib/addable-teammate'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // GUARDED, NOT EXEMPT — the one address the plan left open, settled the way it
  // required: by reading this handler's caller rather than by judgement.
  //
  // Its only caller is components/RegisterTeammate.tsx. That component's only
  // render site is app/(authenticated)/(portal)/submissions/page.tsx, which sits
  // inside the `(portal)` route group Phase 5 gates. So an incomplete
  // representative cannot reach the screen that calls this address at all:
  // guarding it takes nothing away from anyone who could otherwise have used it,
  // and leaving it open would let a representative blocked from every screen
  // create working accounts for colleagues.
  //
  // Reproduce the finding:
  //   grep -rn "teammates/register" apps/sponsor --include="*.tsx"
  //   grep -rn "RegisterTeammate" apps/sponsor --include="*.tsx"
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused

  const user = session.user as any

  // THE COMPANY COMES FROM THE DATABASE, NOT THE SESSION TOKEN. Phase 13, added
  // after adversarial review round 1 and confirmed by measurement before the
  // line was written.
  //
  // This handler is where the stale token became dangerous rather than merely
  // wrong. Reproduced end to end: a representative signed in while attached to
  // company A, was moved to company B in the database, and then created a
  // colleague — receiving `201`, with the new account carrying `role=SPONSOR`
  // and `sponsorId=A`, and that account signed in to the portal as company A.
  // Before this phase the same stale write produced an `ATTENDEE` the portal
  // refused, so it was inert; the role change is what turned it into a working
  // account, with the buyer directory, at a company the caller had left.
  //
  // Phase 13 did this through a helper of its own, lib/caller-company.ts, which
  // issued a second query for a value the guard above had already fetched and
  // discarded. Phase 6.5 re-pointed all twelve remaining handlers at the guard's
  // value and deleted that helper, so there is one answer to "which company is
  // this caller acting for" rather than two. Its comment also named a "Phase 14"
  // that no longer exists and a count that was wrong; both went with the file.
  if (!companyId) return NextResponse.json({ error: 'No sponsor linked' }, { status: 403 })

  const { name, email, jobTitle, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    // REFUSE A WBR-SIDE ACCOUNT FIRST, BEFORE ANY QUESTION ABOUT ITS COMPANY.
    //
    // Found by adversarial review round 1 of Phase 6.5 and reproduced before the
    // first version of this check was written: a STAFF account with no company
    // was attached to an exhibitor's company by posting its EMAIL here, answering
    // 200 — bypassing both the filtered list the screen shows and the
    // identifier-based attach address that had just been hardened.
    //
    // THREE ADDRESSES CAN WRITE THIS COLUMN, and that is the recurring shape of
    // this defect family rather than a coincidence. Phase 13 recorded the same
    // thing when it found the colleague-role defect had three code paths and not
    // the one its finding described. The first version of Phase 6.5 wired the
    // rule into two of the three and missed this one.
    //
    // ROUND 3 THEN MOVED IT ABOVE THE COMPANY BRANCHES, and that ordering is the
    // whole point rather than tidiness. Below them, a WBR-side account that was
    // ALREADY attached — by the defect this phase is fixing, before the fix
    // shipped — never reached the check at all: it matched the same-company
    // branch and got a 200, or the other-company branch and got a 409. The rule
    // has to be about what kind of account this is, which is not a question the
    // account's current company can answer.
    //
    // Same rule, same source, same answer as app/api/profile/teammates/route.ts.
    if (!isAddableTeammateRole(existing.role)) {
      return NextResponse.json(
        { error: 'This account cannot be added to a sponsor team' },
        { status: 403 },
      )
    }
    // If they already belong to this sponsor, return them
    if (existing.sponsorId === companyId) {
      return NextResponse.json({
        id: existing.id, name: existing.name, email: existing.email,
        image: existing.image, jobTitle: existing.jobTitle, role: existing.role,
      })
    }
    // If they belong to another sponsor, reject
    if (existing.sponsorId) {
      return NextResponse.json({ error: 'This user is already linked to another sponsor' }, { status: 409 })
    }
    // Link existing user to this sponsor.
    //
    // THE ROLE IS DELIBERATELY UNTOUCHED HERE, unlike the create branch below.
    // Phase 13, decided 2026-07-31.
    //
    // This account already exists and already has a role. Promoting it to SPONSOR
    // would admit it to this portal and at the same moment remove its access to
    // the meetings portal, which packages/db/src/app-access.ts opens to ATTENDEE
    // and SPEAKER and not to SPONSOR. And the exhibitor could not undo it:
    // detaching a teammate clears only the company link and does not restore a
    // role, so the person would be left holding SPONSOR with no company — refused
    // by the meetings portal and stranded on the no-company screen.
    //
    // The rejected alternative was storing the previous role so a detach could put
    // it back. That closes the trap and needs a new column; this work carries no
    // schema change.
    //
    // So an existing person attached this way still cannot sign in to this portal.
    // The limitation is kept and the false impression is removed: the screen says
    // that attaching shares the company's records and does not grant portal
    // access. See components/ProfileEditor.tsx and components/RegisterTeammate.tsx.
    // ONE CONDITIONAL WRITE, NOT A READ FOLLOWED BY A WRITE. Round 3 of Phase 6.5.
    //
    // Everything above this line was decided from a row read at the top of the
    // branch, and the write then addressed that row by its primary key alone. Two
    // exhibitors can therefore both read the same unattached account, both pass
    // every check, and both write — the second silently winning while both are
    // told it worked.
    //
    // This is the exact shape Phase 13 removed from the sibling attach address
    // after MEASURING it rather than reasoning about it: two representatives
    // attaching the same unattached person both received a success in 15 of 15
    // attempts. The first single attempt did not reproduce it, which is why that
    // phase recorded that one attempt is not a measurement. The same shape was
    // left here because that phase's scope was the four teammate addresses and
    // this branch was not read closely enough.
    //
    // The condition now lives in the write, so the database decides. `updateMany`
    // rather than `update` because only `updateMany` accepts a filter beyond the
    // primary key; it changes at most one row, since `id` is unique.
    const attached = await prisma.user.updateMany({
      where: {
        id: existing.id,
        ...ADDABLE_TEAMMATE_ROLE_FILTER,
        OR: [{ sponsorId: null }, { sponsorId: companyId }],
      },
      data: { sponsorId: companyId, ...(name && { name }), ...(jobTitle && { jobTitle }) },
    })

    if (attached.count === 0) {
      // Somebody else took them between the read above and this write. Re-read to
      // answer the same way this address answers that case anywhere else, rather
      // than reporting a success that did not happen.
      return NextResponse.json(
        { error: 'This user is already linked to another sponsor' },
        { status: 409 },
      )
    }

    const updated = await prisma.user.findUnique({
      where: { id: existing.id },
      select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
    })
    return NextResponse.json(updated)
  }

  // Create new user linked to this sponsor.
  //
  // THE ROLE IS `SPONSOR`, AND IT USED TO BE `ATTENDEE`. Phase 13, decided
  // 2026-07-31 by the engineer of record.
  //
  // THE DEFECT THIS FIXES. This screen hands the exhibitor a form with a password
  // field and reports success, and the account it made could never sign in here:
  // packages/db/src/app-access.ts admits only SPONSOR plus the event-operating
  // roles to this portal, and both sign-in paths enforce it (api/login/route.ts
  // and lib/auth.ts). Measured on a deployed preview during Phase 6 — creating
  // the colleague answered 201, signing in as them answered 403. Reproduction in
  // docs/smoketests/phase-6-sponsor-request-guard.md finding 6.
  //
  // WHAT THIS GRANTS, STATED PLAINLY RATHER THAN DISCOVERED LATER. SPONSOR is the
  // whole portal, the buyer directory included — the population and attributes
  // the customer sells access to. So an exhibitor can now hand that out by
  // filling in a form. That was weighed and accepted: the form's own promise is a
  // colleague who can use the portal, and delivering someone who cannot sign in
  // is the worse of the two failures. It is one line to change back if the
  // project owner takes a different view.
  //
  // THE NEW COLLEAGUE IS NOT EXEMPT FROM ANYTHING. SPONSOR is a participant role,
  // not an event-operating one, so isWbrStaff() is false for them and both the
  // screen gate and the request guard apply exactly as they do to the exhibitor
  // who created them. A colleague of an incomplete company lands on the checklist,
  // same as anybody else. Creating a colleague is not a way around Phases 5 and 6,
  // and the Phase 13 suite asserts that rather than assuming it.
  //
  // DIFFERENT FROM THE BRANCH ABOVE, on purpose. That one links an account that
  // already exists and leaves its role alone, because changing it would take away
  // access the person already has. This account is being created here and now, for
  // this portal, and has no existing access to take away.
  const hashed = await hashPassword(password)
  const created = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      jobTitle: jobTitle || null,
      password: hashed,
      role: 'SPONSOR',
      sponsorId: companyId,
    },
    select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
  })

  return NextResponse.json(created, { status: 201 })
}
