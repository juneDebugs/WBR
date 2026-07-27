import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, autoScheduleByPriority } from '@conference/db'
import { requireSchedulerAccess } from '@/lib/scheduler-api'

// Priority-tiered auto-scheduler for the admin portal.
//   POST { dryRun?: boolean, sponsorId?: string, statuses?: ('PENDING'|'APPROVED')[] }
// dryRun returns the plan without writing (used for the preview before applying).
// statuses narrows eligibility (the Companies tab passes ['APPROVED'] so the
// Inbound queue keeps its explicit approve/decline gate); default is the
// engine's PENDING+APPROVED. Fills Best Fit first, then Med, then Low,
// honoring booth/room/candidate capacity — the whole conference in one pass.
export async function POST(req: Request) {
  // Gated by the 'meetings' permission (RolePermission-editor aware) — the
  // same gate as the rest of the meetings scheduling API.
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  const body = await req.json().catch(() => ({}))
  const dryRun = !!body?.dryRun
  const sponsorId = typeof body?.sponsorId === 'string' ? body.sponsorId : undefined
  let statuses: string[] | undefined
  if (body?.statuses !== undefined) {
    if (!Array.isArray(body.statuses) || body.statuses.length === 0 ||
        !body.statuses.every((s: unknown) => s === 'PENDING' || s === 'APPROVED')) {
      return NextResponse.json({ error: 'statuses must be a non-empty array of PENDING/APPROVED' }, { status: 400 })
    }
    statuses = body.statuses
  }

  try {
    const result = await autoScheduleByPriority(prisma, { dryRun, sponsorId, statuses })
    if (!dryRun && result.scheduled.length) revalidateTag('meetings')
    return NextResponse.json(result)
  } catch (err) {
    console.error('[auto-schedule] failed:', err)
    return NextResponse.json({ error: 'Auto-schedule failed' }, { status: 500 })
  }
}
