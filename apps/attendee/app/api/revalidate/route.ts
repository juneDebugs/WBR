import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function POST(req: Request) {
  const { secret, tags } = await req.json()

  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  if (!Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json({ error: 'tags required' }, { status: 400 })
  }

  for (const tag of tags) {
    revalidateTag(tag)
  }

  return NextResponse.json({ revalidated: tags })
}
