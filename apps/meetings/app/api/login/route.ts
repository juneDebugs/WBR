import { NextResponse, type NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma, verifyPassword, canAccessApp, isCanonicalTestEmail, ensureCanonicalTestAccount } from '@conference/db'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

// A valid-format scrypt hash of an unguessable value. On the no-such-user path
// we run verifyPassword against this so the request spends the same scrypt time
// it would for a real account — closing the user-enumeration timing oracle.
const DUMMY_HASH =
  'c1a7772dffe981cee8319c0150f54a7040e3c742ccca3f5f3d42f5bd0b64f9962af9747e1266bbdd789abab41c03f8618347c10a28fbca5173121623994c2a97.b604b1f91e2726063d4078ed510e68ac.2048'

export async function POST(req: NextRequest) {
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
    select: { id: true, email: true, name: true, password: true, role: true, sponsorId: true },
  })

  if (!user?.password) {
    await verifyPassword(body.password, DUMMY_HASH)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  if (!canAccessApp('meetings', user.role)) {
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
