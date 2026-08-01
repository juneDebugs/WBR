import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, hashPassword } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'
import { getCallerCompanyId } from '@/lib/caller-company'

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
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

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
  // Full reasoning, and why this is fixed here rather than deferred to the
  // plan's Phase 14, at lib/caller-company.ts.
  const companyId = await getCallerCompanyId(user.id)
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
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { sponsorId: companyId, ...(name && { name }), ...(jobTitle && { jobTitle }) },
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
