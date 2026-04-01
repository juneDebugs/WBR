import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request })
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/api/auth')

  if (!token && !isAuthRoute) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (token && request.nextUrl.pathname === '/login') {
    const dashUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(dashUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
