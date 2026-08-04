import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { revalidateAttendeeFloorPlan } from '@/lib/revalidate-attendee'
import { roleHasPermission } from '@/lib/api-permission'
import { validatePinUpdate } from '@/lib/pin-input'

/**
 * Move, rename, reassign or remove one marker. Phase 11, user story FP 28.
 *
 * Both verbs live in one file so the four guards and the two-step lookup are
 * written once. Phase 10's review round 1 scoped one address and round 3 found its
 * symmetrical twin unscoped — a fix applied to one of two matching paths is the
 * error that repeats, and separating these two verbs into two files is how that
 * happens.
 *
 * ── The lookup is two steps, and both matter ──────────────────────────────────
 *
 * The map must belong to the active conference, and the marker must belong to that
 * map. Checking only the marker would let an id from another conference's map be
 * moved or deleted through this address; checking only the map would let a marker
 * id from a different map be edited by naming any map the organizer can reach.
 */

const ADMIN_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

type Ctx = { params: Promise<{ id: string; pinId: string }> }

/**
 * Everything both verbs need before they touch anything: the caller is allowed,
 * the map is in the active conference, and the marker is on that map.
 *
 * Returns either a response to send back, or the marker as it is stored.
 */
async function resolve(ctx: Ctx): Promise<
  | { refusal: NextResponse }
  | {
      refusal?: undefined
      conferenceId: string
      /** The map the marker was reached through, already proved to be in the active conference. */
      mapId: string
      pin: { id: string; type: string; x: number; y: number; sponsorId: string | null; label: string | null }
    }
> {
  const session = await getServerSession(authOptions)
  if (!session) return { refusal: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = session.user as any
  if (!ADMIN_ROLES.includes(me.role)) {
    return { refusal: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (!(await roleHasPermission(me.role, 'floorPlan'))) {
    return { refusal: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const { id: venueMapId, pinId } = await ctx.params

  const conference = await prisma.conference.findFirst({
    where: { active: true },
    select: { id: true },
  })
  if (!conference) {
    return { refusal: NextResponse.json({ error: 'There is no active conference.' }, { status: 409 }) }
  }

  const map = await prisma.venueMap.findFirst({
    where: { id: venueMapId, conferenceId: conference.id },
    select: { id: true },
  })
  if (!map) {
    return { refusal: NextResponse.json({ error: 'That map no longer exists.' }, { status: 404 }) }
  }

  const pin = await prisma.pin.findFirst({
    where: { id: pinId, venueMapId: map.id },
    select: { id: true, type: true, x: true, y: true, sponsorId: true, label: true },
  })
  if (!pin) {
    return { refusal: NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 }) }
  }

  return { conferenceId: conference.id, mapId: map.id, pin }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const found = await resolve(ctx)
  if (found.refusal) return found.refusal
  const { conferenceId, mapId, pin } = found

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const checked = validatePinUpdate(pin, body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  const changes = checked.value

  // The company link is scoped to the active conference here as well as on create.
  // A booth marker reassigned to a company from another conference would put that
  // company's name, logo, tagline, website and offerings onto this conference's
  // map, because the participant map response resolves all of it through the link.
  if (changes.sponsorId) {
    const sponsor = await prisma.sponsor.findFirst({
      where: { id: changes.sponsorId, conferenceId },
      select: { id: true },
    })
    if (!sponsor) {
      return NextResponse.json({ error: 'That company is not exhibiting at this event.' }, { status: 400 })
    }
  }

  // ── The write repeats the membership check, and that is not belt-tightening ──
  //
  // Raised by adversarial review round 1. resolve() proved the marker exists and
  // belongs to a map in the active conference, and then this used
  // prisma.pin.update({ where: { id } }) — which assumes it is all still true.
  // Two organizers deleting the same marker, or one deleting the map while another
  // moves a marker, and the second write throws Prisma's P2025. That surfaces as
  // an unhandled 500, so the organizer is told the app broke rather than that the
  // marker is gone.
  //
  // updateMany carries the full condition, so the write itself is what enforces
  // it: a marker deleted in between matches nothing, count comes back 0, and the
  // answer is the same 404 resolve() would have given a moment earlier. No
  // exception to catch and no window between the check and the write.
  //
  // Unreachable on this machine — SQLite here permits one writer at a time — and
  // reachable in the deployed environment, which reads Turso over a network from
  // many callers at once. A local run passing is not evidence this is safe.
  const applied = await prisma.pin.updateMany({
    where: { id: pin.id, venueMapId: mapId },
    data: changes,
  })
  if (applied.count === 0) {
    return NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 })
  }

  const updated = await prisma.pin.findFirst({
    where: { id: pin.id, venueMapId: mapId },
    select: {
      id: true,
      type: true,
      x: true,
      y: true,
      label: true,
      sponsorId: true,
      sponsor: { select: { id: true, name: true, boothNumber: true } },
    },
  })
  if (!updated) {
    // The write landed and the row was removed before it could be read back. The
    // change did happen, and it no longer exists — saying "gone" is the truthful
    // answer, and it is what the organizer's screen needs in order to stop drawing
    // a marker that is not there.
    return NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 })
  }

  const delegatesNotified = await revalidateAttendeeFloorPlan('floor-plan/pins PATCH')

  return NextResponse.json({ pin: updated, delegatesNotified })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const found = await resolve(ctx)
  if (found.refusal) return found.refusal
  const { mapId, pin } = found

  // Conditional on the same membership resolve() checked, for the reason written
  // above PATCH: prisma.pin.delete({ where: { id } }) throws P2025 when the row has
  // already gone, and a second delete of the same marker would answer 500 instead
  // of saying it is no longer there. Locally that second delete IS reachable — two
  // sequential requests, no concurrency needed — so the suite asserts it.
  const removed = await prisma.pin.deleteMany({ where: { id: pin.id, venueMapId: mapId } })
  if (removed.count === 0) {
    return NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 })
  }

  const delegatesNotified = await revalidateAttendeeFloorPlan('floor-plan/pins DELETE')

  return NextResponse.json({ deleted: pin.id, delegatesNotified })
}
