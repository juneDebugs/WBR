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

// `sponsors` joins `icons` as a public asset folder this middleware skips.
//
// Why it has to be skipped: Next.js optimises an <Image src="/sponsors/x.png">
// by fetching that file back from the app itself, and that internal fetch
// carries no session cookie. Without this, the middleware redirected it to the
// sign-in page, the optimiser received a redirect instead of a picture, and
// answered 400 — so twenty sponsor logos never rendered on the home and
// meetings screens.
//
// EXCLUDED BY FOLDER NAME, NOT BY FILE EXTENSION, and that distinction matters.
// The first version of this fix copied apps/web/middleware.ts, which excludes
// any path ending in an image extension. Measured on a running build, that let
// unauthenticated callers reach real page routes whose dynamic segment merely
// ended in one: /people/anything.png answered 200 while /people answered a
// redirect, and /chat/room.svg did the same. Nothing leaked, because every data
// address behind those screens is guarded — but the screens should not have
// been reachable at all, and it was inconsistent by case, since .PNG stayed
// blocked while .png did not. apps/web has the same weakness; that is its own
// change to make, not this one.
//
// `maps` was added in Phase 8 and is the third such folder: public/maps/ holds
// the seeded floor-plan pictures. Without it the middleware decodes a JWT for
// every picture request, and any request that arrives without a session cookie
// — a service-worker prefetch, or Next's own image optimiser if this ever moves
// to <Image> — receives a redirect to the sign-in page instead of a picture.
// Measured before it was added: GET /maps/exhibit-hall.png without a cookie
// answered 307. A signed-in delegate was unaffected, because their request
// carries the cookie.
//
// Only real static folders belong here. public/ holds exactly `icons`,
// `sponsors` and `maps`, plus the individual files already named.
//
// The two folder names carry a TRAILING SLASH deliberately. Without it the terms
// are unanchored prefixes: /sponsorship, /sponsors-admin and /iconsecret were
// measured skipping this middleware entirely, answering 404 rather than
// redirecting. They are harmless only because no such route exists today — and
// /sponsorship is an entirely plausible page for this app to grow. The slash
// makes them match the folders and nothing else.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|sponsors/|maps/|manifest.json|sw.js|workbox-.*).*)'],
}
