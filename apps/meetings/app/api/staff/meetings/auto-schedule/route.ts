import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, autoScheduleByPriority } from '@conference/db'
import { requireStaff, engineErrorResponse } from '@/lib/staff-api'
import { invalidate } from '@/lib/mem-cache'

// Priority-tiered auto-scheduler for the staff meeting-engine console.
//   POST { sponsorId?: string, dryRun?: boolean }
// Scoped to one company's booth when sponsorId is present. Fills Best Fit first,
// then Med, then Low, honoring every booth/room/candidate constraint.
export async function POST(req: Request) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error

  const body = await req.json().catch(() => ({}))
  const dryRun = !!body?.dryRun
  const sponsorId = typeof body?.sponsorId === 'string' ? body.sponsorId : undefined

  try {
    const result = await autoScheduleByPriority(prisma, { dryRun, sponsorId })
    if (!dryRun && result.scheduled.length) {
      for (const s of result.scheduled) invalidate(s.userId)
      revalidateTag('meetings')
    }
    return NextResponse.json(result)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
