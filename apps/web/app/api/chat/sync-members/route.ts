import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

const GENERAL_ROOM_ID = 'room-general'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (role !== 'STAFF' && role !== 'ORGANIZER') {
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

  const existingIds = new Set(existing.map(m => m.userId))
  const newUsers = users.filter(u => !existingIds.has(u.id))

  await Promise.all(
    newUsers.map(u => prisma.chatMember.create({ data: { roomId: GENERAL_ROOM_ID, userId: u.id } }))
  )

  return NextResponse.json({ ok: true, total: users.length, added: newUsers.length })
}
