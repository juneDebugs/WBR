import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  const forms = await prisma.submissionForm.findMany({
    where: { sponsorId: user.sponsorId },
    include: { _count: { select: { submissions: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(forms)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  const { title, type, description, fields, deadline } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const form = await prisma.submissionForm.create({
    data: {
      sponsorId: user.sponsorId,
      title: title.trim(),
      type: type ?? 'ABSTRACT',
      description: description?.trim() ?? null,
      fields: JSON.stringify(fields ?? []),
      deadline: deadline ? new Date(deadline) : null,
    },
    include: { _count: { select: { submissions: true } } },
  })
  revalidateTag(`submissions-${user.sponsorId}`)

  return NextResponse.json(form)
}
