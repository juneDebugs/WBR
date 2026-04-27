import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'

const SCOPES: Record<string, string[]> = {
  GMAIL: [
    'https://mail.google.com/',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  GOOGLE_CALENDAR: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) return NextResponse.redirect(new URL('/login', req.url))

  const provider = req.nextUrl.searchParams.get('provider')
  if (!provider || !SCOPES[provider]) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID not configured. Add it to .env.local.' },
      { status: 503 }
    )
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/integrations/google/callback`
  const state = Buffer.from(JSON.stringify({ provider })).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES[provider].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  )
}
