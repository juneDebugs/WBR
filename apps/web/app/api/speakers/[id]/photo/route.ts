import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@conference/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const speaker = await prisma.speaker.findUnique({
    where: { id },
    select: { photoUrl: true },
  })

  if (!speaker?.photoUrl) {
    return new NextResponse(null, { status: 404 })
  }

  const url = speaker.photoUrl

  // For external URLs, redirect with caching
  if (!url.startsWith('data:')) {
    return NextResponse.redirect(url, {
      status: 302,
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  }

  // Decode data URI to binary
  const match = url.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) {
    return new NextResponse(null, { status: 404 })
  }

  const [, contentType, b64] = match
  const buffer = Buffer.from(b64, 'base64')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
