import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

// POST — follow or unfollow
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const followerId = session.user.id
  const followingId = userId

  if (followerId === followingId) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })

  // Ensure the logged-in user exists in the DB (JWT may outlive a DB reset)
  await prisma.user.upsert({
    where: { id: followerId },
    update: {},
    create: {
      id: followerId,
      email: session.user.email ?? `${followerId}@unknown.com`,
      name: session.user.name ?? 'Unknown',
      role: 'ATTENDEE',
    },
  })

  // Ensure the target user exists
  const targetExists = await prisma.user.findUnique({ where: { id: followingId } })
  if (!targetExists) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  })

  if (existing) {
    await prisma.follow.delete({ where: { followerId_followingId: { followerId, followingId } } })
    revalidateTag(`user-social-${followerId}`)
    return NextResponse.json({ following: false })
  }

  await prisma.follow.create({ data: { followerId, followingId } })
  revalidateTag(`user-social-${followerId}`)
  return NextResponse.json({ following: true })
}

// GET — check follow status
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: session.user.id, followingId: userId } },
  })

  return NextResponse.json({ following: !!existing })
}
