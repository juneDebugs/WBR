import { NextResponse, type NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const mr = await prisma.meetingRequest.findUnique({ where: { id }, select: { targetUserId: true } })
  if (!mr || mr.targetUserId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.meetingRequest.update({ where: { id }, data: { status: 'REJECTED' } })
  revalidateTag(`meetings-${session.user.id}`)

  return NextResponse.json({ ok: true })
}
