import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { applyOrder } from '@/lib/floor-plan-order'
import { revalidateAttendeeFloorPlan } from '@/lib/revalidate-attendee'
import { roleHasPermission } from '@/lib/api-permission'

const ADMIN_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

/**
 * Delete a venue map.
 *
 * Added to Phase 10 on 2026-08-02 by the project owner; the written criteria
 * covered upload and ordering only.
 *
 * Two things happen that are easy to leave out:
 *
 *   The map's markers go with it. `Pin.venueMapId` is declared onDelete: Cascade,
 *   so the database does this — but the Phase 10 suite asserts it rather than
 *   trusting the declaration, because a schema that says one thing and a database
 *   that was migrated by hand can disagree.
 *
 *   The gap closes. Deleting the map at position 4 of 5 leaves 1, 2, 3, 5. Left
 *   alone, the next upload takes position 6 and the numbers stop describing the
 *   order. The remaining maps are renumbered, which needs the same two-pass write
 *   a reorder does — see lib/floor-plan-order.ts.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!ADMIN_ROLES.includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── The permission key, not just the role ───────────────────────────────────
  //
  // Raised by Phase 10's adversarial review, round 2. The screen is guarded with
  // permissionDenied('floorPlan'), but this address checked only that the caller
  // was staff, organizer or admin. A role with the floor-plan permission
  // deliberately switched off could still upload, reorder and delete by calling
  // the address directly — including deleting a map and cascading away its
  // markers. A hidden screen is not an enforcement boundary.
  //
  // roleHasPermission passes ADMIN unconditionally, matching every other guard
  // in this app.
  if (!(await roleHasPermission(me.role, 'floorPlan'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // ── Scoped to the active conference, like every other floor-plan surface ────
  //
  // Raised by round 3 of Phase 10's adversarial review. Round 1 found the image
  // READ route unscoped and it was fixed; this destructive WRITE was left
  // looking a map up by id alone. The admin screen, the upload, the reorder, the
  // participant list and the image address all work within the active
  // conference, so an organizer holding an id from a previous conference could
  // reach past all of them and delete that map — taking its markers with it,
  // because Pin cascades.
  //
  // The same boundary, applied to the more dangerous verb. A map outside the
  // active conference answers exactly as a map that does not exist, so this
  // cannot be used to discover which old ids are real.
  const conference = await prisma.conference.findFirst({
    where: { active: true },
    select: { id: true },
  })
  if (!conference) {
    return NextResponse.json({ error: 'There is no active conference.' }, { status: 409 })
  }

  const map = await prisma.venueMap.findFirst({
    where: { id, conferenceId: conference.id },
    select: { id: true, conferenceId: true },
  })
  if (!map) return NextResponse.json({ error: 'That map no longer exists.' }, { status: 404 })

  // The delete and the renumber are one transaction. Halfway through, the maps
  // after the deleted one hold positions that no longer describe the order; a
  // failure between the two would leave that state on disk.
  await prisma.$transaction(async tx => {
    await tx.venueMap.delete({ where: { id } })

    const remaining = await tx.venueMap.findMany({
      where: { conferenceId: map.conferenceId },
      orderBy: { position: 'asc' },
      select: { id: true },
    })

    await applyOrder(tx, remaining.map(m => m.id))
  })

  // Reported rather than discarded, so the screen can tell the organizer whether
  // delegates have already seen the deletion. See the note in ../route.ts above POST.
  const delegatesNotified = await revalidateAttendeeFloorPlan('floor-plan/maps DELETE')

  return NextResponse.json({ deleted: id, delegatesNotified })
}
