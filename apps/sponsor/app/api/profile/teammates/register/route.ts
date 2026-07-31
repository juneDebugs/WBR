import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, hashPassword } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

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
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor linked' }, { status: 403 })

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
    if (existing.sponsorId === user.sponsorId) {
      return NextResponse.json({
        id: existing.id, name: existing.name, email: existing.email,
        image: existing.image, jobTitle: existing.jobTitle, role: existing.role,
      })
    }
    // If they belong to another sponsor, reject
    if (existing.sponsorId) {
      return NextResponse.json({ error: 'This user is already linked to another sponsor' }, { status: 409 })
    }
    // Link existing user to this sponsor
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { sponsorId: user.sponsorId, ...(name && { name }), ...(jobTitle && { jobTitle }) },
      select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
    })
    return NextResponse.json(updated)
  }

  // Create new user linked to this sponsor
  const hashed = await hashPassword(password)
  const created = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      jobTitle: jobTitle || null,
      password: hashed,
      role: 'ATTENDEE',
      sponsorId: user.sponsorId,
    },
    select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
  })

  return NextResponse.json(created, { status: 201 })
}
