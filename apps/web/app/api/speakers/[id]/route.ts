import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

async function revalidateAttendeeSpeakers(speakerId?: string) {
  const tags = ['speakers']
  if (speakerId) tags.push(`speaker-${speakerId}`)
  try {
    await fetch('http://localhost:3001/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.NEXTAUTH_SECRET, tags }),
    })
  } catch {
    // Attendee app may not be running; ignore
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  let updated
  try {
    updated = await prisma.speaker.update({
      where: { id },
      data: {
        name: body.name.trim(),
        bio: body.bio?.trim() || null,
        ...('photoUrl' in body && { photoUrl: body.photoUrl || null }),
        photoPosition: body.photoPosition?.trim() || '50% 50%',
        company: body.company?.trim() || null,
        jobTitle: body.jobTitle?.trim() || null,
        twitterHandle: body.twitterHandle?.trim() || null,
        linkedinUrl: body.linkedinUrl?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        photoPosition: true,
        jobTitle: true,
        company: true,
        bio: true,
        twitterHandle: true,
        linkedinUrl: true,
      },
    })
  } catch (e: any) {
    if (e.code === 'P2025') return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
    throw e
  }

  revalidateTag('speakers')
  // Fire-and-forget: don't block the response waiting for attendee app
  revalidateAttendeeSpeakers(id)

  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const existing = await prisma.speaker.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  await prisma.speaker.delete({ where: { id } })
  revalidateTag('speakers')
  await revalidateAttendeeSpeakers(id)
  return NextResponse.json({ success: true })
}
