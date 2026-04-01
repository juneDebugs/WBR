import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

// POST — follow or unfollow
export async function POST(
  _req: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const followerId = session.user.id
  const followingId = params.userId

  if (followerId === followingId) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  })

  if (existing) {
    await prisma.follow.delete({ where: { followerId_followingId: { followerId, followingId } } })
    return NextResponse.json({ following: false })
  }

  await prisma.follow.create({ data: { followerId, followingId } })
  return NextResponse.json({ following: true })
}

// GET — check follow status
export async function GET(
  _req: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: session.user.id, followingId: params.userId } },
  })

  return NextResponse.json({ following: !!existing })
}
