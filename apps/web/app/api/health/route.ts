import { NextResponse } from 'next/server'

export async function GET() {
  const checks: Record<string, unknown> = {
    tursoUrl: process.env.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.replace(/\/\/.*@/, '//***@') : 'MISSING',
    tursoToken: process.env.TURSO_AUTH_TOKEN ? 'set (' + process.env.TURSO_AUTH_TOKEN.length + ' chars)' : 'MISSING',
    databaseUrl: process.env.DATABASE_URL || 'MISSING',
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

    const admin = await prisma.user.findUnique({
      where: { email: 'june@tailor.tech' },
      select: { email: true, role: true, password: true },
    })
    checks.demoAdmin = admin
      ? { found: true, role: admin.role, hasPassword: !!admin.password, pwLen: admin.password?.length }
      : { found: false }
  } catch (e: any) {
    checks.db = 'ERROR'
    checks.dbError = e?.message
    checks.dbStack = e?.stack?.split('\n').slice(0, 5)
  }

  return NextResponse.json(checks)
}
