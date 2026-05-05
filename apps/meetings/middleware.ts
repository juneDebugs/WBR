import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request })
  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/api/auth') || pathname === '/api/login'

  // Unauthenticated → block early (before any RSC rendering)
  if (!token && !isAuthRoute) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Already authenticated → redirect away from login page
  if (token && pathname === '/login') {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/'
    return NextResponse.redirect(homeUrl)
  }

  // Forward decoded JWT payload as request headers so downstream
  // server components can read user info without re-decoding the JWT.
  // This eliminates the ~10-20ms getServerSession() call in layouts/pages.
  const requestHeaders = new Headers(request.headers)
  if (token) {
    requestHeaders.set('x-user-id', String(token.id ?? ''))
    requestHeaders.set('x-user-role', String(token.role ?? ''))
    requestHeaders.set('x-user-sponsor-id', String(token.sponsorId ?? ''))
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*).*)'],
}
