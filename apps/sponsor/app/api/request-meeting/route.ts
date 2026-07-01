import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!user.id) return NextResponse.json({ error: 'No user id' }, { status: 403 })

  const { targetUserId, message } = await req.json()
  if (!targetUserId) return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })
  if (targetUserId === user.id) return NextResponse.json({ error: 'Cannot request a meeting with yourself' }, { status: 400 })
  if (message && message.length > 1000) return NextResponse.json({ error: 'Message too long (max 1000 chars)' }, { status: 400 })

  const existing = await prisma.meetingRequest.findFirst({
    where: { requesterId: user.id, targetUserId },
  })
  if (existing) {
    // Idempotent duplicate. If the caller supplied a non-empty message
    // and the existing row has none, promote the message onto the row
    // so a Connect → Draft-intro sequence lands the AI-drafted intro on
    // the persisted record per ADR 0005. If both sides have a message,
    // the existing one wins (later drafts don't overwrite earlier sends
    // — the user's already-sent intro is the source of truth).
    if (message && !existing.message) {
      const updated = await prisma.meetingRequest.update({
        where: { id: existing.id },
        data: { message },
      })
      return NextResponse.json(updated)
    }
    return NextResponse.json(existing)
  }

  const created = await prisma.meetingRequest.create({
    data: {
      requesterId: user.id,
      targetUserId,
      message: message || null,
      status: 'PENDING',
    },
  })

  // Bust meetings cache for the target user's sponsor (if any)
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { sponsorId: true } })
  if (target?.sponsorId) revalidateTag(`meetings-${target.sponsorId}`)

  return NextResponse.json(created, { status: 201 })
}
