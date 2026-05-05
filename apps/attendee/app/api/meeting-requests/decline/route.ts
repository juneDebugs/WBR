import { NextResponse, type NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { prisma } from '@conference/db'

export async function POST(req: NextRequest) {
  const user = await getUserFromHeaders()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const mr = await prisma.meetingRequest.findUnique({ where: { id }, select: { targetUserId: true } })
  if (!mr || mr.targetUserId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.meetingRequest.update({ where: { id }, data: { status: 'REJECTED' } })
  revalidateTag(`meetings-${user.id}`)

  return NextResponse.json({ ok: true })
}
