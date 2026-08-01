import { NextResponse, type NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { revalidateAttendeeSpeakers } from '@/lib/revalidate-attendee'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Derive the role server-side from the session, like the sibling
  // /api/attendees/[id] route — never from a client-settable request header.
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [{ id }, body] = await Promise.all([params, req.json()])

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const name = body.name.trim()
  const bio = body.bio?.trim() || null
  const photoPosition = body.photoPosition?.trim() || '50% 50%'
  const company = body.company?.trim() || null
  const jobTitle = body.jobTitle?.trim() || null
  const twitterHandle = body.twitterHandle?.trim() || null
  const linkedinUrl = body.linkedinUrl?.trim() || null
  const hasPhoto = 'photoUrl' in body
  const photoUrl = hasPhoto ? (body.photoUrl || null) : undefined

  // Guard: reject oversized data URIs (max ~100KB base64 ≈ 75KB image)
  if (photoUrl && photoUrl.startsWith('data:') && photoUrl.length > 150_000) {
    return NextResponse.json({ error: 'Photo too large. Please use a smaller image.' }, { status: 400 })
  }

  // Await the write before responding so a failed save surfaces as a 500 and
  // the admin UI never reports "saved" for a change that silently never landed.
  try {
    if (hasPhoto) {
      await prisma.$queryRawUnsafe(
        `UPDATE "Speaker" SET "name"=?, "bio"=?, "photoUrl"=?, "photoPosition"=?, "company"=?, "jobTitle"=?, "twitterHandle"=?, "linkedinUrl"=? WHERE "id"=?`,
        name, bio, photoUrl, photoPosition, company, jobTitle, twitterHandle, linkedinUrl, id
      )
    } else {
      await prisma.$queryRawUnsafe(
        `UPDATE "Speaker" SET "name"=?, "bio"=?, "photoPosition"=?, "company"=?, "jobTitle"=?, "twitterHandle"=?, "linkedinUrl"=? WHERE "id"=?`,
        name, bio, photoPosition, company, jobTitle, twitterHandle, linkedinUrl, id
      )
    }
  } catch (e) {
    console.error('[PUT /api/speakers] Write failed:', e)
    return NextResponse.json({ error: 'Failed to save speaker' }, { status: 500 })
  }

  revalidateTag('speakers')
  revalidateAttendeeSpeakers(id)

  return NextResponse.json({
    id,
    name,
    ...(hasPhoto ? { photoUrl } : {}),
    photoPosition,
    jobTitle,
    company,
    bio,
    twitterHandle,
    linkedinUrl,
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  try {
    await prisma.$queryRawUnsafe(`DELETE FROM "Speaker" WHERE "id"=?`, id)
  } catch (e) {
    console.error('[DELETE /api/speakers] Delete failed:', e)
    return NextResponse.json({ error: 'Failed to delete speaker' }, { status: 500 })
  }

  revalidateTag('speakers')
  revalidateAttendeeSpeakers(id)

  return NextResponse.json({ success: true })
}
