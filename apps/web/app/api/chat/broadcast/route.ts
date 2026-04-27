import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const GENERAL_ROOM_ID = 'room-general'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { message } = await req.json()
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const sender = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!sender) return NextResponse.json({ error: 'Sender not found' }, { status: 404 })

  // Ensure sender is a member of general
  await prisma.chatMember.upsert({
    where: { roomId_userId: { roomId: GENERAL_ROOM_ID, userId: sender.id } },
    create: { roomId: GENERAL_ROOM_ID, userId: sender.id },
    update: {},
  })

  const msg = await prisma.message.create({
    data: { roomId: GENERAL_ROOM_ID, senderId: sender.id, content: message.trim() },
    include: { sender: true },
  })

  return NextResponse.json({ ok: true, message: msg })
}
