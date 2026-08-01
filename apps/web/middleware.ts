import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request })
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/api/auth') ||
    request.nextUrl.pathname === '/api/health' ||
    request.nextUrl.pathname === '/api/login'

  if (!token && !isAuthRoute) {
    // API routes get 401 JSON, page routes get redirect to login
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (token && request.nextUrl.pathname === '/login') {
    const dashUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(dashUrl)
  }

  // Forward user identity to route handlers via headers (avoids re-decoding JWT)
  const response = NextResponse.next()
  if (token) {
    response.headers.set('x-user-role', (token.role as string) ?? '')
    response.headers.set('x-user-id', (token.id as string) ?? '')
  }
  return response
}

// EXCLUDE BY FOLDER, NOT BY FILE EXTENSION. Phase 6.5.
//
// This used to end with `.*\.(?:png|jpg|jpeg|gif|svg|ico|webp)$`, which tests the
// WHOLE address rather than a folder — so any page whose last segment happened
// to end in an image extension skipped the signed-in check too. Measured:
// `/dashboard/sponsors/anything.png` answered 200 with no session, because the
// dynamic `[id]` segment matched. It rendered an empty shell and leaked no data,
// so this was a weakness rather than an exposure, but the check was not doing
// what its author intended.
//
// The other three apps closed the same weakness in PR 31 by naming the folders
// their images actually live in. This copies that, unchanged. Verified before
// changing: apps/web/public contains only `icons/` and `sponsors/`, so nothing
// static falls outside the two named folders.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|sponsors/|manifest.json|sw.js|workbox-.*).*)'],
}
