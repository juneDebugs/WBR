import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await request.json()
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushToken: token },
  })

  return NextResponse.json({ ok: true })
}
