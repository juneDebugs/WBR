import { NextResponse } from 'next/server'
import { prisma, dbConnectionMode } from '@conference/db'

export async function GET() {
  try {
    const userCount = await prisma.user.count()
    const testUser = await prisma.user.findUnique({
      where: { email: 'steph@curry.com' },
      select: { id: true, name: true, email: true, password: true },
    })

    return NextResponse.json({
      dbMode: dbConnectionMode,
      tursoUrl: process.env.TURSO_DATABASE_URL ? 'set (' + process.env.TURSO_DATABASE_URL.substring(0, 30) + '...)' : 'NOT SET',
      tursoToken: process.env.TURSO_AUTH_TOKEN ? 'set (length: ' + process.env.TURSO_AUTH_TOKEN.length + ')' : 'NOT SET',
      userCount,
      stephCurry: testUser ? {
        found: true,
        id: testUser.id,
        hasPassword: !!testUser.password,
        passwordLength: testUser.password?.length ?? 0,
        hashFormat: testUser.password ? testUser.password.split('.').map(p => p.length).join('.') : 'none',
      } : { found: false },
    })
  } catch (e: any) {
    return NextResponse.json({
      error: e.message,
      dbMode: dbConnectionMode,
      tursoUrl: process.env.TURSO_DATABASE_URL ? 'set' : 'NOT SET',
      tursoToken: process.env.TURSO_AUTH_TOKEN ? 'set' : 'NOT SET',
    }, { status: 500 })
  }
}
