import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import type { NextRequest } from 'next/server'
import { requireIntegrationsAccess, OAUTH_STATE_COOKIE } from '@/lib/integrations-auth'

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
  // Same gate as the /api/integrations JSON API: a role whose 'integrations'
  // permission was revoked must not be able to rebind the org's email/calendar
  // integration. Browser navigation → redirect on failure, not JSON 403.
  if (!await requireIntegrationsAccess()) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=forbidden', req.url))
  }

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
  const nonce = randomUUID()
  const state = Buffer.from(JSON.stringify({ provider, nonce })).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES[provider].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  )
  res.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
