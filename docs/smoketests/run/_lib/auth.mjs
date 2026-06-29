// Capture a NextAuth session cookie from `/api/login`.
//
// `captureSessionCookie({ baseUrl, email, password })` returns
// `{ name, value }`. The cookie name varies by protocol:
//   - HTTP (local prod, e.g. `http://localhost:3010`): `next-auth.session-token`
//   - HTTPS (Vercel preview / production):              `__Secure-next-auth.session-token`
//
// Throws on non-200 response or missing Set-Cookie header — those are setup
// errors (server unreachable, seed credentials wrong, NextAuth misconfigured),
// not contract failures.

export async function captureSessionCookie({ baseUrl, email, password }) {
  const cookieName = baseUrl.startsWith('https://')
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'

  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (res.status !== 200) {
    throw new Error(`POST ${baseUrl}/api/login returned ${res.status} — credentials may be wrong or NextAuth misconfigured`)
  }

  // Response.headers.getSetCookie() requires Node 19.7+.
  const setCookies = res.headers.getSetCookie?.() ?? []
  if (setCookies.length === 0) {
    throw new Error(`POST ${baseUrl}/api/login returned no Set-Cookie headers (Node version too old? need ≥ 20)`)
  }

  const raw = setCookies.find((c) => c.startsWith(`${cookieName}=`))
  if (!raw) {
    throw new Error(`POST ${baseUrl}/api/login did not set ${cookieName} cookie`)
  }

  return { name: cookieName, value: raw.split(';')[0].split('=').slice(1).join('=') }
}
