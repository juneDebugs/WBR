import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { prisma } from '@conference/db'
import { rateLimit, getClientIp } from '@/lib/rateLimit'
import { invalidate } from '@/lib/mem-cache'

export async function POST(req: Request) {
  if (!rateLimit(`mtg-req:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = user.id

  const body = await req.json()
  const { targetUserId, targetSponsorId, message, priority } = body

  if (!targetUserId && !targetSponsorId) {
    return NextResponse.json({ error: 'Target required' }, { status: 400 })
  }
  if (targetUserId === userId) {
    return NextResponse.json({ error: 'Cannot request a meeting with yourself' }, { status: 400 })
  }
  if (message && message.length > 1000) {
    return NextResponse.json({ error: 'Message too long (max 1000 chars)' }, { status: 400 })
  }
  // Priority tier drives auto-scheduling order (Best Fit → Med → Low); default Med.
  const prio = priority === 'BEST_FIT' || priority === 'MED' || priority === 'LOW' ? priority : 'MED'

  // Check not duplicate
  const existing = await prisma.meetingRequest.findFirst({
    where: {
      requesterId: userId,
      ...(targetUserId ? { targetUserId } : { targetSponsorId }),
      status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] },
    },
  })
  if (existing) {
    // Not a hard duplicate error: let the requester revise their priority tier
    // on the request they already sent (idempotent), returning the live row.
    if (existing.priority !== prio) {
      const updated = await prisma.meetingRequest.update({
        where: { id: existing.id }, data: { priority: prio },
      })
      return NextResponse.json(updated)
    }
    return NextResponse.json({ error: 'Request already exists' }, { status: 409 })
  }

  const request = await prisma.meetingRequest.create({
    data: { requesterId: userId, targetUserId, targetSponsorId, message, priority: prio },
  })
  // Invalidate in-memory cache for affected users
  invalidate(userId)
  if (targetUserId) invalidate(targetUserId)

  revalidateTag('meeting-requests')
  revalidateTag(`meetings-user-${userId}`)
  if (targetUserId) revalidateTag(`meetings-user-${targetUserId}`)
  return NextResponse.json(request)
}

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (user.role === 'STAFF') {
    const requests = await prisma.meetingRequest.findMany({
      include: {
        requester: true,
        targetUser: true,
        targetSponsor: true,
        timeBlock: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(requests)
  }

  const requests = await prisma.meetingRequest.findMany({
    where: {
      OR: [
        { requesterId: user.id },
        { targetUserId: user.id },
        ...(user.sponsorId ? [{ targetSponsorId: user.sponsorId }] : []),
      ],
    },
    include: {
      requester: true,
      targetUser: true,
      targetSponsor: true,
      timeBlock: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(requests)
}
