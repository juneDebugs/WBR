import { NextResponse, type NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma, verifyPassword } from '@conference/db'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
  }

  const email = body.email.trim().toLowerCase()

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, name: true, password: true, role: true,
      sponsorId: true, sponsor: { select: { name: true } },
    },
  })

  if (!user?.password) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const valid = await verifyPassword(body.password, user.password)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name ?? email.split('@')[0],
      role: user.role,
      sponsorId: user.sponsorId ?? null,
      sponsorName: user.sponsor?.name ?? null,
    },
    maxAge: 30 * 24 * 60 * 60,
  })

  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sponsorId: user.sponsorId,
      sponsorName: user.sponsor?.name ?? null,
    },
  })

  const isSecure = req.nextUrl.protocol === 'https:'
  const cookieName = isSecure
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'

  res.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  return res
}
