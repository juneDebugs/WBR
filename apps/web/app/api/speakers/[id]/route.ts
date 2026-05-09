import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { revalidateTag } from 'next/cache'
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = await getToken({ req })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(token.role as string)) {
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = await getToken({ req })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(token.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await prisma.speaker.delete({ where: { id } })
  } catch (e: any) {
    if (e.code === 'P2025') return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
    throw e
  }
  revalidateTag('speakers')
  revalidateAttendeeSpeakers(id)
  return NextResponse.json({ success: true })
}
