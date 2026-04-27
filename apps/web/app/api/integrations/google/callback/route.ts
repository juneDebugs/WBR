import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@conference/db'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) return NextResponse.redirect(new URL('/login', req.url))

  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const dashUrl = new URL('/dashboard/integrations', req.url)

  if (error || !code || !state) {
    dashUrl.searchParams.set('error', error ?? 'oauth_failed')
    return NextResponse.redirect(dashUrl)
  }

  let provider: string
  try {
    ;({ provider } = JSON.parse(Buffer.from(state, 'base64url').toString()))
  } catch {
    dashUrl.searchParams.set('error', 'invalid_state')
    return NextResponse.redirect(dashUrl)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/integrations/google/callback`

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })
  const tokenData = await tokenRes.json()

  if (!tokenData.access_token) {
    dashUrl.searchParams.set('error', 'token_exchange_failed')
    return NextResponse.redirect(dashUrl)
  }

  // Get account email
  let accountLabel: string | null = null
  try {
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json()
    accountLabel = profile.email ?? null
  } catch {}

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null

  await prisma.integration.upsert({
    where: { provider },
    create: {
      provider,
      status: 'CONNECTED',
      accountLabel,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt,
      connectedAt: new Date(),
    },
    update: {
      status: 'CONNECTED',
      accountLabel,
      accessToken: tokenData.access_token,
      ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
      expiresAt,
      connectedAt: new Date(),
    },
  })

  dashUrl.searchParams.set('connected', provider)
  return NextResponse.redirect(dashUrl)
}
