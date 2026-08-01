import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import type { NextRequest } from 'next/server'
import { requireIntegrationsAccess, OAUTH_STATE_COOKIE } from '@/lib/integrations-auth'

// Only providers the connect route can start are accepted here.
const VALID_PROVIDERS = new Set(['GMAIL', 'GOOGLE_CALENDAR'])

export async function GET(req: NextRequest) {
  const dashUrl = new URL('/dashboard/integrations', req.url)

  // Same 'integrations' permission gate as the connect route.
  if (!await requireIntegrationsAccess()) {
    dashUrl.searchParams.set('error', 'forbidden')
    return NextResponse.redirect(dashUrl)
  }

  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    dashUrl.searchParams.set('error', error ?? 'oauth_failed')
    return NextResponse.redirect(dashUrl)
  }

  let provider: string
  let nonce: string | undefined
  try {
    ;({ provider, nonce } = JSON.parse(Buffer.from(state, 'base64url').toString()))
  } catch {
    dashUrl.searchParams.set('error', 'invalid_state')
    return NextResponse.redirect(dashUrl)
  }

  // CSRF: the state nonce must match the httpOnly cookie set when the flow
  // started, and the provider must be one we recognize — reject before the
  // token exchange so a lured admin cannot bind an attacker's account.
  const cookieNonce = req.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (!nonce || !cookieNonce || nonce !== cookieNonce || !VALID_PROVIDERS.has(provider)) {
    dashUrl.searchParams.set('error', 'invalid_state')
    const res = NextResponse.redirect(dashUrl)
    res.cookies.delete(OAUTH_STATE_COOKIE)
    return res
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
  const res = NextResponse.redirect(dashUrl)
  res.cookies.delete(OAUTH_STATE_COOKIE)
  return res
}
