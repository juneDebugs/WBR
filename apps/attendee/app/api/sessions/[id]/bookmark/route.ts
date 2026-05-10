import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const sessionId = id

  const existing = await prisma.sessionBookmark.findUnique({
    where: { userId_sessionId: { userId, sessionId } },
  })

  if (existing) {
    await prisma.sessionBookmark.delete({ where: { userId_sessionId: { userId, sessionId } } })
    revalidatePath('/my-schedule')
    return NextResponse.json({ bookmarked: false })
  }

  await prisma.sessionBookmark.create({ data: { userId, sessionId } })
  revalidatePath('/my-schedule')
  return NextResponse.json({ bookmarked: true })
}
