import { NextResponse, type NextRequest, after } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma } from '@conference/db'

function revalidateAttendeeSpeakers(speakerId?: string) {
  const tags = ['speakers']
  if (speakerId) tags.push(`speaker-${speakerId}`)
  fetch('http://localhost:3001/api/revalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.NEXTAUTH_SECRET, tags }),
  }).catch(() => {})
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Auth is handled by middleware; role is forwarded via header
  const role = req.headers.get('x-user-role')
  if (!role || !['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
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

  // Respond immediately with optimistic data
  const optimistic = {
    id,
    name,
    ...(hasPhoto ? { photoUrl } : {}),
    photoPosition,
    jobTitle,
    company,
    bio,
    twitterHandle,
    linkedinUrl,
  }

  // Defer DB write + cache invalidation to after the response is sent
  after(async () => {
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
      revalidateTag('speakers')
      revalidateAttendeeSpeakers(id)
    } catch (e) {
      console.error('[PUT /api/speakers] Background write failed:', e)
    }
  })

  return NextResponse.json(optimistic)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = req.headers.get('x-user-role')
  if (!role || !['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  after(async () => {
    try {
      await prisma.$queryRawUnsafe(`DELETE FROM "Speaker" WHERE "id"=?`, id)
      revalidateTag('speakers')
      revalidateAttendeeSpeakers(id)
    } catch (e) {
      console.error('[DELETE /api/speakers] Background delete failed:', e)
    }
  })

  return NextResponse.json({ success: true })
}
