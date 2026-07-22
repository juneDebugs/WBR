import { NextResponse } from 'next/server'
import { prisma, dbConnectionMode, verifyPassword } from '@conference/db'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email') ?? 'brand@test.com'
  const pw = searchParams.get('pw') ?? 'password123'

  const steps: string[] = []

  try {
    // Test 1: DB connection
    steps.push('DB mode: ' + dbConnectionMode)

    // Test 2: Find user
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    steps.push('User found: ' + (user ? user.name : 'NOT FOUND'))
    if (!user) return NextResponse.json({ steps })

    // Test 3: Verify password
    if (!user.password) { steps.push('No password set'); return NextResponse.json({ steps }) }
    const valid = await verifyPassword(pw, user.password)
    steps.push('verifyPassword: ' + (valid ? 'PASS' : 'FAIL'))

    // Test 4: Simulate authorize return value
    const authorizeResult = valid ? { id: user.id, email: user.email, name: user.name, role: user.role, sponsorId: user.sponsorId } : null
    steps.push('authorize would return: ' + (authorizeResult ? 'user object' : 'null'))

    // Test 5: Call actual authorize function step by step
    try {
      const credentialsProvider = authOptions.providers.find((p: any) => p.id === 'credentials') as any
      if (credentialsProvider?.options?.authorize) {
        const authResult = await credentialsProvider.options.authorize({ email, password: pw }, {} as any)
        steps.push('ACTUAL authorize() (via options) returned: ' + (authResult ? JSON.stringify({ id: authResult.id, name: authResult.name }) : 'null'))
      } else if (credentialsProvider?.authorize) {
        const authResult = await credentialsProvider.authorize({ email, password: pw }, {} as any)
        steps.push('ACTUAL authorize() returned: ' + (authResult ? JSON.stringify({ id: authResult.id, name: authResult.name }) : 'null'))
      } else {
        steps.push('Provider keys: ' + Object.keys(credentialsProvider ?? {}).join(', '))
      }
    } catch (e: any) {
      steps.push('ACTUAL authorize() THREW: ' + e.message + ' | Stack: ' + (e.stack?.split('\n').slice(0, 2).join(' ') ?? ''))
    }

    // Test 6: Run authorize logic inline (no NextAuth wrapper)
    try {
      const u = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
      if (u && u.password) {
        const v = await verifyPassword(pw, u.password)
        if (v) {
          steps.push('INLINE authorize: SUCCESS -> { id: ' + u.id + ', role: ' + u.role + ' }')
        } else {
          steps.push('INLINE authorize: password mismatch')
        }
      }
    } catch (e: any) {
      steps.push('INLINE authorize ERROR: ' + e.message)
    }

    return NextResponse.json({ steps })
  } catch (e: any) {
    steps.push('TOP-LEVEL ERROR: ' + e.message)
    return NextResponse.json({ steps, error: e.message }, { status: 500 })
  }
}
