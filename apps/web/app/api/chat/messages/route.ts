import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

const GENERAL_ROOM_ID = 'room-general'

// DELETE /api/chat/messages?id=xxx  — delete one message (own message, or STAFF/ORGANIZER)
// DELETE /api/chat/messages          — clear all messages in global room (STAFF/ORGANIZER only)
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const role = (session.user as any).role
  const isStaff = role === 'STAFF' || role === 'ORGANIZER'

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    const message = await prisma.message.findUnique({ where: { id }, select: { senderId: true } })
    if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (message.senderId !== userId && !isStaff) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await prisma.message.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  }

  // Bulk delete requires STAFF/ORGANIZER
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await prisma.message.deleteMany({ where: { roomId: GENERAL_ROOM_ID } })
  return NextResponse.json({ ok: true })
}
