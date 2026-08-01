import { getServerSession } from 'next-auth'
import { NextResponse, after } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma, syncAutoMatches } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

// A Best Fit pick can complete a mutual match (both sides picked each other),
// which must schedule the meeting immediately — not wait for an admin. The
// sweep is the whole-conference scheduling pass, so it runs post-response via
// after() within the same request lifecycle rather than blocking the
// interactive click. It is idempotent and must never fail the pick itself, so
// a failure is logged rather than swallowed but never surfaced to the caller.
function triggerAutoMatch(priority: string) {
  if (priority !== 'BEST_FIT') return
  after(() => syncAutoMatches(prisma).catch(err => console.error('[request-meeting] auto-match sweep failed', err)))
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Asking a buyer for a meeting. This is one of the two capabilities the
  // customer named by name when asked what an incomplete participant should not
  // be able to do; the attendee app's equivalent was closed in Phase 1.
  // This address never consults the caller's company, so it takes the refusal
  // and ignores the rest of what the guard returns.
  const { refused } = await requireCompleteProfile()
  if (refused) return refused

  const user = session.user as any
  if (!user.id) return NextResponse.json({ error: 'No user id' }, { status: 403 })

  const { targetUserId, message, priority } = await req.json()
  if (!targetUserId) return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })
  if (targetUserId === user.id) return NextResponse.json({ error: 'Cannot request a meeting with yourself' }, { status: 400 })
  if (message && message.length > 1000) return NextResponse.json({ error: 'Message too long (max 1000 chars)' }, { status: 400 })
  // Priority tier drives auto-scheduling order (Best Fit → Med → Low); default Med.
  const prio = priority === 'BEST_FIT' || priority === 'MED' || priority === 'LOW' ? priority : 'MED'

  // Only a live (non-terminal) request blocks a re-request. A REJECTED or
  // CANCELLED row is dead: matching it here would silently bump its priority and
  // return 200 while nothing re-enters the PENDING queue. Excluding terminal
  // statuses lets a fresh PENDING row be created, matching apps/meetings.
  const existing = await prisma.meetingRequest.findFirst({
    where: { requesterId: user.id, targetUserId, status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
  })
  if (existing) {
    // Idempotent duplicate. If the caller supplied a non-empty message
    // and the existing row has none, promote the message onto the row
    // so a Connect → Draft-intro sequence lands the AI-drafted intro on
    // the persisted record per ADR 0005. If both sides have a message,
    // the existing one wins (later drafts don't overwrite earlier sends
    // — the user's already-sent intro is the source of truth).
    // The requester may re-send to revise their priority tier, so that
    // always lands on the existing row.
    const data: { message?: string; priority: string } = { priority: prio }
    if (message && !existing.message) data.message = message
    const updated = await prisma.meetingRequest.update({
      where: { id: existing.id },
      data,
    })
    triggerAutoMatch(prio)
    return NextResponse.json(updated)
  }

  // Validate the target once before the create. targetUserId carries a real FK,
  // so a create against a since-deleted user throws P2003 and surfaces as a 500
  // for an ordinary stale-click; a non-directory role (ORGANIZER/STAFF/another
  // sponsor's rep) should not be requestable by direct API call either. The
  // directory query (lib/server-data.ts) is ATTENDEE/SPEAKER, so mirror it here.
  // Sponsor-attached targets are NOT rejected: the browse directory does not
  // filter sponsorId and the cache-bust below already expects them.
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, sponsorId: true },
  })
  if (!target) return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
  if (target.role !== 'ATTENDEE' && target.role !== 'SPEAKER') {
    return NextResponse.json({ error: 'Target is not an attendee' }, { status: 400 })
  }

  const created = await prisma.meetingRequest.create({
    data: {
      requesterId: user.id,
      targetUserId,
      message: message || null,
      priority: prio,
      status: 'PENDING',
    },
  })

  // Run the auto-match sweep and its dependent cache bust after the response
  // returns, so an interactive Connect click never blocks on a multi-round-trip
  // scheduling sweep. The target row is reused from the validation lookup above,
  // so this adds no round-trips. revalidateTag busts the target sponsor's
  // meetings cache once the auto-scheduled meeting (if any) exists.
  after(async () => {
    if (prio === 'BEST_FIT') {
      await syncAutoMatches(prisma).catch(err => console.error('[request-meeting] auto-match sweep failed', err))
    }
    if (target.sponsorId) revalidateTag(`meetings-${target.sponsorId}`)
  })

  return NextResponse.json(created, { status: 201 })
}
