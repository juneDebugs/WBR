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

  // Already authenticated → redirect away from login page.
  //
  // EXCEPT when the onboarding gate sent them here because their user row no
  // longer exists. A token whose user row was deleted still decodes perfectly,
  // so this check cannot tell the difference on its own, and without the
  // exception the two redirects chase each other forever: /dashboard asks the
  // gate, the gate finds no row and sends them to /login, this sends them back
  // to /dashboard. That loop is not hypothetical — it was measured in the
  // attendee app, where it was the first version of the same fix. The marker is
  // the one case where a token-holder genuinely does need the sign-in form.
  //
  // Mirrors apps/attendee/middleware.ts. See lib/onboarding-gate.ts.
  const sessionInvalid = request.nextUrl.searchParams.get('session') === 'invalid'
  if (token && pathname === '/login' && !sessionInvalid) {
    const dashUrl = request.nextUrl.clone()
    dashUrl.pathname = '/dashboard'
    dashUrl.search = ''
    return NextResponse.redirect(dashUrl)
  }

  // Forward decoded JWT payload as request headers so downstream
  // server components can read user info without re-decoding the JWT.
  const requestHeaders = new Headers(request.headers)
  if (token) {
    requestHeaders.set('x-user-id', String(token.id ?? ''))
    requestHeaders.set('x-user-role', String(token.role ?? ''))
    requestHeaders.set('x-user-sponsor-id', String(token.sponsorId ?? ''))
    requestHeaders.set('x-user-sponsor-name', String(token.sponsorName ?? ''))
    requestHeaders.set('x-user-sponsor-logo-url', String(token.sponsorLogoUrl ?? ''))
    requestHeaders.set('x-user-name', String(token.name ?? ''))
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

// `sponsors` joins `icons` as a public asset folder this middleware skips.
//
// Next.js optimises an <Image src="/sponsors/x.png"> by fetching that file back
// from the app itself, and that internal fetch carries no session cookie —
// without this, the middleware redirected it and the optimiser answered 400, so
// the picture never rendered. No component here renders one through the optimiser today; included so all
// four apps agree and the next picture added does not reintroduce the fault.
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
