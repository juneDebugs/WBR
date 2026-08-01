import { after } from 'next/server'
import { prisma, syncAutoMatches } from '@conference/db'

// A Best Fit pick can complete a mutual match (both sides picked each other),
// which must schedule the meeting immediately — not wait for an admin. The full
// sweep (`syncAutoMatches`) is ~2 Turso waves, and its result never feeds the
// HTTP response, so paying for it synchronously on every pick is wasteful.
//
// Instead run ONE cheap indexed query to see whether a reciprocal live Best Fit
// pick already exists for this pair:
//   • if it does (rare) — a match can complete now, so await the sweep so the
//     client's follow-up refetch sees the scheduled meeting ("schedule
//     immediately" behavior preserved);
//   • if it doesn't (the common case) — defer the idempotent MATCHED-event /
//     self-heal sweep to after() so it never blocks the response.
export async function triggerAutoMatchForPick(pick: {
  requesterId: string
  requesterSponsorId: string | null
  targetUserId: string | null
  targetSponsorId: string | null
}) {
  const LIVE = ['PENDING', 'APPROVED', 'CONFIRMED'] as const
  let reciprocalWhere: any = null

  if (pick.targetSponsorId) {
    // Attendee (or rep) picked sponsor S — reciprocal is someone at S picking
    // this requester.
    reciprocalWhere = {
      priority: 'BEST_FIT',
      status: { in: LIVE },
      targetUserId: pick.requesterId,
      requester: { sponsorId: pick.targetSponsorId },
    }
  } else if (pick.targetUserId && pick.requesterSponsorId) {
    // Rep at sponsor Sr picked attendee T — reciprocal is attendee T picking
    // sponsor Sr (mirror image).
    reciprocalWhere = {
      priority: 'BEST_FIT',
      status: { in: LIVE },
      targetSponsorId: pick.requesterSponsorId,
      requesterId: pick.targetUserId,
    }
  }

  if (reciprocalWhere) {
    const reciprocal = await prisma.meetingRequest.findFirst({
      where: reciprocalWhere,
      select: { id: true },
    })
    if (reciprocal) {
      await syncAutoMatches(prisma).catch(() => {})
      return
    }
  }

  after(() => syncAutoMatches(prisma).catch(() => {}))
}
