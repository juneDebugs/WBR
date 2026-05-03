import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const body = await req.json()

  const existing = await prisma.speaker.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const updated = await prisma.speaker.update({
    where: { id },
    data: {
      name: body.name.trim(),
      bio: body.bio?.trim() || null,
      photoUrl: body.photoUrl?.trim() || null,
      company: body.company?.trim() || null,
      jobTitle: body.jobTitle?.trim() || null,
      twitterHandle: body.twitterHandle?.trim() || null,
      linkedinUrl: body.linkedinUrl?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      jobTitle: true,
      company: true,
      bio: true,
      twitterHandle: true,
      linkedinUrl: true,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const existing = await prisma.speaker.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  await prisma.speaker.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
