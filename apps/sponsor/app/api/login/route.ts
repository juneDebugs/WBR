import { NextResponse, type NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma, verifyPassword, canAccessApp, isCanonicalTestEmail, ensureCanonicalTestAccount } from '@conference/db'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  // Brute-force throttle: this hand-rolled sign-in mints a 30-day session cookie
  // itself, so it needs its own limiter. 10 attempts / 60s per client IP.
  if (!rateLimit(`login:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
  }

  const email = body.email.trim().toLowerCase()

  // Self-heal the canonical demo accounts, exactly as NextAuth's authorize()
  // does, and for the same reason — but this is the path that actually runs.
  //
  // THIS ROUTE IS THE ONE THE PASSWORD FORM USES. Every app's login screen
  // posts here and this route mints its own session cookie; the NextAuth
  // credentials provider is reached only by tests and by direct callers. The
  // repair used to live in authorize() alone, so a gate demonstration account
  // completed during a rehearsal stayed completed through every sign-in a
  // person could actually perform, and the onboarding gate had nothing to
  // demonstrate. Recorded as UF-65.
  //
  // Placed before the lookup below so the row it reads is the repaired one. A
  // wrong password is a no-op inside the call, so this grants nothing that the
  // credential check further down would not already grant.
  if (isCanonicalTestEmail(email)) {
    await ensureCanonicalTestAccount(email, body.password)
  }

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

  if (!canAccessApp('sponsor', user.role)) {
    return NextResponse.json({ error: 'Unauthorized role' }, { status: 403 })
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
