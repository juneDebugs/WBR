import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, autoScheduleByPriority } from '@conference/db'

// Priority-tiered auto-scheduler for the admin portal.
//   POST { dryRun?: boolean, sponsorId?: string }
// dryRun returns the plan without writing (used for the preview before applying).
// Fills Best Fit requests first, then Med, then Low, honoring booth/room/candidate
// capacity — the whole conference in one pass.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const dryRun = !!body?.dryRun
  const sponsorId = typeof body?.sponsorId === 'string' ? body.sponsorId : undefined

  try {
    const result = await autoScheduleByPriority(prisma, { dryRun, sponsorId })
    if (!dryRun && result.scheduled.length) revalidateTag('meetings')
    return NextResponse.json(result)
  } catch (err) {
    console.error('[auto-schedule] failed:', err)
    return NextResponse.json({ error: 'Auto-schedule failed' }, { status: 500 })
  }
}
