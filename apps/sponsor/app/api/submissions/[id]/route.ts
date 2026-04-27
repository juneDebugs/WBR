import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  const form = await prisma.submissionForm.findFirst({
    where: { id: params.id, sponsorId: user.sponsorId },
    include: { submissions: { orderBy: { createdAt: 'desc' } } },
  })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(form)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  const body = await req.json()
  const allowed = ['title', 'type', 'description', 'fields', 'isOpen', 'deadline']
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      if (key === 'fields') data[key] = JSON.stringify(body[key])
      else if (key === 'deadline') data[key] = body[key] ? new Date(body[key]) : null
      else data[key] = body[key]
    }
  }

  const form = await prisma.submissionForm.updateMany({
    where: { id: params.id, sponsorId: user.sponsorId },
    data,
  })
  return NextResponse.json({ ok: true, count: form.count })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  await prisma.submissionForm.deleteMany({ where: { id: params.id, sponsorId: user.sponsorId } })
  return NextResponse.json({ ok: true })
}
