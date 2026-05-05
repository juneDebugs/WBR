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

  if (token && request.nextUrl.pathname === '/login') {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/home'
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
