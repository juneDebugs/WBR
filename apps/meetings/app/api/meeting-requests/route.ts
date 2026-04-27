import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(req: Request) {
  if (!rateLimit(`mtg-req:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string

  const body = await req.json()
  const { targetUserId, targetSponsorId, message } = body

  if (!targetUserId && !targetSponsorId) {
    return NextResponse.json({ error: 'Target required' }, { status: 400 })
  }
  if (targetUserId === userId) {
    return NextResponse.json({ error: 'Cannot request a meeting with yourself' }, { status: 400 })
  }
  if (message && message.length > 1000) {
    return NextResponse.json({ error: 'Message too long (max 1000 chars)' }, { status: 400 })
  }

  // Check not duplicate
  const existing = await prisma.meetingRequest.findFirst({
    where: {
      requesterId: userId,
      ...(targetUserId ? { targetUserId } : { targetSponsorId }),
      status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] },
    },
  })
  if (existing) return NextResponse.json({ error: 'Request already exists' }, { status: 409 })

  const request = await prisma.meetingRequest.create({
    data: { requesterId: userId, targetUserId, targetSponsorId, message },
  })
  return NextResponse.json(request)
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const role = (session.user as any).role as string
  const sponsorId = (session.user as any).sponsorId as string | null

  if (role === 'STAFF') {
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
        { requesterId: userId },
        { targetUserId: userId },
        ...(sponsorId ? [{ targetSponsorId: sponsorId }] : []),
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
