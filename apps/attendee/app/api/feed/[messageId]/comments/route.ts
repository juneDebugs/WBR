import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, listMessageComments, postMessageComment } from '@conference/db'

// GET — list comments on a general-room feed message, ascending.
// DM-room message ids 404 (comments are a feed-only feature).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await listMessageComments(prisma, messageId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 })

  return NextResponse.json({ comments: result.comments })
}

// POST — add a comment to a general-room feed message
export async function POST(
  req: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await req.json()

  const result = await postMessageComment(prisma, messageId, session.user.id, content)
  if (!result.ok) {
    const status = result.error === 'Not found' ? 404 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json(result.comment)
}
