import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { roleHasPermission } from '@/lib/api-permission'

async function requireStaff() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) return null
  if (!(await roleHasPermission(role, 'integrations'))) return null
  return session
}

export async function POST(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { provider, status, accountLabel, metadata } = await req.json()
  if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 })

  const integration = await prisma.integration.upsert({
    where: { provider },
    create: {
      provider,
      status: status ?? 'CONNECTED',
      accountLabel: accountLabel ?? null,
      metadata: metadata ?? null,
      connectedAt: new Date(),
    },
    update: {
      status: status ?? 'CONNECTED',
      accountLabel: accountLabel ?? null,
      metadata: metadata ?? null,
      connectedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true, integration })
}

export async function DELETE(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { provider } = await req.json()
  if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 })

  await prisma.integration.upsert({
    where: { provider },
    create: { provider, status: 'DISCONNECTED' },
    update: { status: 'DISCONNECTED', accountLabel: null, connectedAt: null, accessToken: null, refreshToken: null },
  })

  return NextResponse.json({ ok: true })
}
