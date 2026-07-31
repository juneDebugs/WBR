import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([], { status: 401 })

  // The company's team list (OE 19). Note this handler's own refusal below
  // answers 403 with an empty ARRAY rather than the standard body; the guard
  // returns the standard one, so a refused caller here gets the same shape it
  // gets everywhere else.
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json([], { status: 403 })

  const teammates = await prisma.user.findMany({
    where: { sponsorId: user.sponsorId, id: { not: user.id } },
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
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor linked' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Link the user to this sponsor
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { sponsorId: user.sponsorId },
    select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
  })

  revalidateTag(`sponsor-${user.sponsorId}`)
  revalidateTag('attendee-pool')

  return NextResponse.json(updated)
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor linked' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Don't allow removing yourself
  if (userId === user.id) return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })

  // Only unlink if they belong to this sponsor
  const target = await prisma.user.findFirst({ where: { id: userId, sponsorId: user.sponsorId } })
  if (!target) return NextResponse.json({ error: 'User not found in your team' }, { status: 404 })

  await prisma.user.update({
    where: { id: userId },
    data: { sponsorId: null },
  })

  revalidateTag(`sponsor-${user.sponsorId}`)
  revalidateTag('attendee-pool')

  return NextResponse.json({ ok: true })
}
