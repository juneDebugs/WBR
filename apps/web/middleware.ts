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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'],
}
