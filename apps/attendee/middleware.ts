import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request })
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/api/auth') ||
    request.nextUrl.pathname === '/api/login'

  if (!token && !isAuthRoute) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // A signed-in person has no use for the sign-in form, so send them to /home —
  // EXCEPT when the onboarding gate sent them here because their account row no
  // longer exists. A token whose user row was deleted still decodes perfectly,
  // so this check cannot tell the difference on its own, and without the
  // exception the two redirects chase each other forever: /home asks the gate,
  // the gate finds no row and sends them to /login, this sends them back to
  // /home. That loop was measured. See apps/attendee/lib/onboarding-gate.ts.
  const sessionInvalid = request.nextUrl.searchParams.get('session') === 'invalid'
  if (token && request.nextUrl.pathname === '/login' && !sessionInvalid) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/home'
    homeUrl.search = ''
    return NextResponse.redirect(homeUrl)
  }

  // Forward decoded user info as headers so API routes skip a second JWT decode
  const response = NextResponse.next()
  if (token) {
    response.headers.set('x-user-id', (token.id as string) ?? '')
    response.headers.set('x-user-role', (token.role as string) ?? '')
    response.headers.set('x-user-sponsor-id', (token.sponsorId as string) ?? '')
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*).*)'],
}
