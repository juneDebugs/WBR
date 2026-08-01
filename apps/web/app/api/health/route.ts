import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function GET(req: NextRequest) {
  const token = await getToken({ req })

  // Unauthenticated callers get only a liveness signal — no env, no account
  // probing, no stack traces. This endpoint is exempt from auth in middleware,
  // so anything richer must be gated behind a valid session token.
  if (!token) {
    try {
      const { prisma, dbConnectionMode } = await import('@conference/db')
      await prisma.user.count()
      return NextResponse.json({ status: 'ok', connectionMode: dbConnectionMode })
    } catch (e) {
      console.error('health check db failure', e)
      return NextResponse.json({ status: 'error' }, { status: 503 })
    }
  }

  const checks: Record<string, unknown> = {
    tursoUrl: process.env.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.replace(/\/\/.*@/, '//***@') : 'MISSING',
    tursoToken: process.env.TURSO_AUTH_TOKEN ? 'set (' + process.env.TURSO_AUTH_TOKEN.length + ' chars)' : 'MISSING',
    nodeEnv: process.env.NODE_ENV,
    nextPhase: process.env.NEXT_PHASE ?? 'none',
  }

  // Dynamically import to catch module-level errors. Must be an ESM import:
  // webpack's require() interop on this transpiled package yields undefined
  // exports, which masks the real connection state.
  try {
    const { prisma, dbConnectionMode } = await import('@conference/db')
    checks.connectionMode = dbConnectionMode

    const userCount = await prisma.user.count()
    checks.db = 'connected'
    checks.userCount = userCount
  } catch (e) {
    console.error('health check db failure', e)
    checks.db = 'ERROR'
  }

  return NextResponse.json(checks)
}
