import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

// GET — feed (posts from people you follow + your own)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  })
  const feedUserIds = [userId, ...following.map(f => f.followingId)]

  const posts = await prisma.post.findMany({
    where: { authorId: { in: feedUserIds } },
    include: {
      author: true,
      likes: { select: { userId: true } },
      _count: { select: { likes: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(posts)
}

// POST — create a post
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await request.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Empty post' }, { status: 400 })

  const post = await prisma.post.create({
    data: { authorId: session.user.id, content: content.trim() },
    include: {
      author: true,
      likes: { select: { userId: true } },
      _count: { select: { likes: true } },
    },
  })

  return NextResponse.json(post)
}
