import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, autoScheduleByPriority, REQUEST_BOARD_PRIORITIES, type MeetingPriority } from '@conference/db'
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
  let priorities: string[] | undefined
  if (body?.priorities !== undefined) {
    const VALID = ['BEST_FIT', 'MED', 'LOW']
    if (!Array.isArray(body.priorities) || body.priorities.length === 0 ||
        !body.priorities.every((p: unknown) => typeof p === 'string' && VALID.includes(p))) {
      return NextResponse.json({ error: 'priorities must be a non-empty array of BEST_FIT/MED/LOW' }, { status: 400 })
    }
    priorities = body.priorities
  }

  try {
    // Default scope is the requests-board tiers (Med + Low) — Best Fit picks are
    // the Auto lane's to schedule mutually via the auto-match sweep. The
    // Companies tab passes all three tiers to pull its whole unscheduled bank
    // (an admin working one sponsor wants every approved request placed).
    const result = await autoScheduleByPriority(prisma, {
      dryRun, sponsorId, statuses,
      priorities: (priorities ?? REQUEST_BOARD_PRIORITIES) as MeetingPriority[],
    })
    if (!dryRun && result.scheduled.length) revalidateTag('meetings')
    return NextResponse.json(result)
  } catch (err) {
    console.error('[auto-schedule] failed:', err)
    return NextResponse.json({ error: 'Auto-schedule failed' }, { status: 500 })
  }
}
