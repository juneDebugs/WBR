import { NextResponse } from 'next/server'
import { prisma, dbConnectionMode, verifyPassword } from '@conference/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const testPw = searchParams.get('pw') ?? 'stephcurry'

  try {
    const userCount = await prisma.user.count()
    const testUser = await prisma.user.findUnique({
      where: { email: 'steph@curry.com' },
      select: { id: true, name: true, email: true, password: true },
    })

    let verifyResult: string = 'no password'
    let verifyError: string | null = null
    if (testUser?.password) {
      try {
        const valid = await verifyPassword(testPw, testUser.password)
        verifyResult = valid ? 'PASS' : 'FAIL'
      } catch (e: any) {
        verifyResult = 'ERROR'
        verifyError = e.message + ' | ' + (e.stack?.split('\n')[0] ?? '')
      }
    }

    return NextResponse.json({
      dbMode: dbConnectionMode,
      nodeVersion: process.version,
      userCount,
      stephCurry: testUser ? {
        found: true,
        id: testUser.id,
        hasPassword: !!testUser.password,
        passwordLength: testUser.password?.length ?? 0,
        hashFormat: testUser.password ? testUser.password.split('.').map(p => p.length).join('.') : 'none',
      } : { found: false },
      passwordTest: {
        testedPassword: testPw,
        result: verifyResult,
        error: verifyError,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, dbMode: dbConnectionMode }, { status: 500 })
  }
}
