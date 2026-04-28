import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'

export async function GET() {
  const checks: Record<string, unknown> = {
    tursoUrl: process.env.TURSO_DATABASE_URL ? 'set' : 'MISSING',
    tursoToken: process.env.TURSO_AUTH_TOKEN ? 'set' : 'MISSING',
    databaseUrl: process.env.DATABASE_URL ? 'set' : 'MISSING',
    nodeEnv: process.env.NODE_ENV,
    nextPhase: process.env.NEXT_PHASE ?? 'none',
  }

  try {
    const userCount = await prisma.user.count()
    checks.db = 'connected'
    checks.userCount = userCount

    // Check if demo admin exists
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
  }

  return NextResponse.json(checks)
}
