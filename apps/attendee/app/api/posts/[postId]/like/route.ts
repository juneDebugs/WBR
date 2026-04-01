import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function POST(
  _req: Request,
  { params }: { params: { postId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const postId = params.postId

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId } },
  })

  if (existing) {
    await prisma.postLike.delete({ where: { postId_userId: { postId, userId } } })
    return NextResponse.json({ liked: false })
  }

  await prisma.postLike.create({ data: { postId, userId } })
  return NextResponse.json({ liked: true })
}
