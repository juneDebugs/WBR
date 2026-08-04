import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { revalidateAttendeeFloorPlan } from '@/lib/revalidate-attendee'
import { roleHasPermission } from '@/lib/api-permission'
import { validateNewPin } from '@/lib/pin-input'

/**
 * Place a marker on a map. Phase 11, user stories FP 25, 26 and 27.
 *
 * The organizer taps a spot and this stores a marker there, as a percentage of the
 * picture's width and height so it stays correct at any screen size. A booth marker
 * links to the exhibiting company; a room marker carries a typed name.
 *
 * ── Four guards, in the same order as every other floor-plan address ──────────
 *
 * A session, the admin roles, the floorPlan permission key, and a lookup scoped to
 * the active conference. Phase 10's review round 2 found its three map addresses
 * checking only the caller's role, so a role with the key deliberately switched off
 * could upload, reorder and delete by calling them directly. This address has the
 * same shape and would have had the same hole.
 *
 * ── The company link is scoped as well, and that is a third boundary ──────────
 *
 * Sponsor rows carry a conferenceId. A booth marker naming a company from another
 * conference would put that company's name, logo, tagline, website and offerings
 * onto this conference's map, because the participant map response resolves all of
 * that through the link. So the company is looked up within the active conference
 * rather than by id alone.
 *
 * Phase 10's review found a fix applied to one of two symmetrical paths and missed
 * on the other. There are three paths here — create, update, delete — and the
 * conference boundary belongs on all of them.
 */

const ADMIN_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!ADMIN_ROLES.includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!(await roleHasPermission(me.role, 'floorPlan'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: venueMapId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const checked = validateNewPin(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  const pin = checked.value

  const conference = await prisma.conference.findFirst({
    where: { active: true },
    select: { id: true },
  })
  if (!conference) {
    return NextResponse.json({ error: 'There is no active conference.' }, { status: 409 })
  }

  // The map must belong to the active conference. A map outside it answers exactly
  // as a map that does not exist, so this cannot be used to discover real ids.
  const map = await prisma.venueMap.findFirst({
    where: { id: venueMapId, conferenceId: conference.id },
    select: { id: true },
  })
  if (!map) return NextResponse.json({ error: 'That map no longer exists.' }, { status: 404 })

  if (pin.sponsorId) {
    const sponsor = await prisma.sponsor.findFirst({
      where: { id: pin.sponsorId, conferenceId: conference.id },
      select: { id: true },
    })
    if (!sponsor) {
      // Answered before the write rather than left to the foreign-key constraint,
      // which would surface as an unhandled error and tell the organizer nothing.
      return NextResponse.json({ error: 'That company is not exhibiting at this event.' }, { status: 400 })
    }
  }

  // ── The same window the update and delete paths have, on the way in ─────────
  //
  // Adversarial review round 1 raised this for PATCH and DELETE: the checks above
  // prove the map and the company exist, and then the write assumes they still do.
  // This is the third of three matching paths, and Phase 10's review found a fix
  // applied to one of two symmetrical paths and missed on the other — so it is
  // answered here as well rather than waiting to be found.
  //
  // The map or the company being deleted between the check and the insert violates
  // a foreign key, which Prisma reports as P2003. Unhandled, that is a 500 telling
  // the organizer the app broke. What is true is that the thing they were adding a
  // marker to is gone.
  let created
  try {
    created = await prisma.pin.create({
      data: {
        venueMapId: map.id,
        type: pin.type,
        x: pin.x,
        y: pin.y,
        sponsorId: pin.sponsorId,
        label: pin.label,
      },
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
  } catch (err: any) {
    const isMissingRelation =
      err?.code === 'P2003' ||
      err?.code === 'P2025' ||
      /FOREIGN KEY constraint failed/i.test(String(err?.message ?? ''))
    if (!isMissingRelation) throw err
    return NextResponse.json(
      { error: 'That map or company was removed while the marker was being saved. Reload and try again.' },
      { status: 404 },
    )
  }

  // ── Telling delegates, and why forgetting this is invisible here ────────────
  //
  // The participant app caches its map read for 300 seconds under the tag
  // 'floor-plan'. Phase 10 built and repaired the path that clears it: this call
  // clears the tag in this app, posts it to the participant app's /api/revalidate,
  // and that route also writes to every open map screen so a phone refreshes on
  // its own.
  //
  // A marker written without this call looks completely correct on this machine for
  // up to five minutes, and then starts working. That is why the Phase 11 checks
  // prime the cache immediately before asserting, so nothing but the product can
  // have cleared it.
  const delegatesNotified = await revalidateAttendeeFloorPlan('floor-plan/pins POST')

  return NextResponse.json({ pin: created, delegatesNotified }, { status: 201 })
}
