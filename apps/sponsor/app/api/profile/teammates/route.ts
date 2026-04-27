import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  return NextResponse.json(updated)
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  return NextResponse.json({ ok: true })
}
