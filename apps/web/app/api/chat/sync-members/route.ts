import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

const GENERAL_ROOM_ID = 'room-general'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Ensure the general room exists
  await prisma.chatRoom.upsert({
    where: { id: GENERAL_ROOM_ID },
    create: { id: GENERAL_ROOM_ID, name: 'General', type: 'CHANNEL' },
    update: {},
  })

  const [users, existing] = await Promise.all([
    prisma.user.findMany({ select: { id: true } }),
    prisma.chatMember.findMany({ where: { roomId: GENERAL_ROOM_ID }, select: { userId: true } }),
  ])

  const existingIds = new Set(existing.map((m: any) => m.userId))
  const newUsers = users.filter((u: any) => !existingIds.has(u.id))

  // Single batched insert instead of one round-trip per user — on first sync
  // newUsers can be the entire user base (~2,500 rows), which as sequential
  // INSERTs against Turso would blow the function timeout.
  if (newUsers.length) {
    await prisma.chatMember.createMany({
      data: newUsers.map((u: any) => ({ roomId: GENERAL_ROOM_ID, userId: u.id })),
    })
  }

  return NextResponse.json({ ok: true, total: users.length, added: newUsers.length })
}
