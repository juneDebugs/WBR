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

// `sponsors` joins `icons` as a public asset folder this middleware skips.
//
// Next.js optimises an <Image src="/sponsors/x.png"> by fetching that file back
// from the app itself, and that internal fetch carries no session cookie —
// without this, the middleware redirected it and the optimiser answered 400, so
// the picture never rendered. Four components here show a sponsor logo that way.
//
// EXCLUDED BY FOLDER NAME, NOT BY FILE EXTENSION. See the fuller note in
// apps/attendee/middleware.ts: excluding by extension was measured to let
// unauthenticated callers reach page routes whose dynamic segment merely ended
// in one, such as /people/anything.png.
//
// The two folder names carry a TRAILING SLASH deliberately. Without it the terms
// are unanchored prefixes: /sponsorship, /sponsors-admin and /iconsecret were
// measured skipping this middleware entirely, answering 404 rather than
// redirecting. They are harmless only because no such route exists today — and
// /sponsorship is an entirely plausible page for this app to grow. The slash
// makes them match the folders and nothing else.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|sponsors/|manifest.json|sw.js|workbox-.*).*)'],
}
