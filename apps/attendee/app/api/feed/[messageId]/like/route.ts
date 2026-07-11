import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, toggleMessageLike } from '@conference/db'

// POST — toggle the signed-in user's like on a general-room feed message.
// DM-room message ids 404 (likes are a feed-only feature).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await toggleMessageLike(prisma, messageId, session.user.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 })

  return NextResponse.json({ liked: result.liked, likeCount: result.likeCount })
}
