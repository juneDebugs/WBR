import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { revalidateAttendeeFloorPlan } from '@/lib/revalidate-attendee'
import { roleHasPermission } from '@/lib/api-permission'
import { validateBoothNumberBody } from '@/lib/booth-number-input'

/**
 * Set or clear one exhibiting company's booth number, from the floor plan screen.
 *
 * Until this phase the field had exactly one write path, in the sponsor's own
 * portal — while CONTEXT.md stated the organizer assigns it, and used that as the
 * reason the onboarding gate does not block a sponsor on it. An organizer looking
 * at a marker reading "no booth number yet" had no screen to fix it in and had to
 * ask the exhibitor to sign in and type it. This address closes that.
 *
 * ── Why it lives under floor-plan and not under sponsors ─────────────────────
 *
 * It is reachable from one screen, the floor plan, and it exists because assigning
 * stands is floor-plan work. Sitting beside the marker addresses keeps the four
 * guards, the active-conference scoping and the delegate revalidation identical to
 * theirs rather than reimplemented a directory away — the concern that produced
 * lib/pin-input.ts in Phase 11.
 *
 * ── Why `floorPlan` alone, and not also `sponsors` ───────────────────────────
 *
 * The value written is on the company record, which the `sponsors` key governs,
 * so demanding both was the first instinct. It is the wrong bar, because the
 * address beside this one already lets a caller holding `floorPlan` attach a
 * company to a marker or detach it entirely. Requiring a second permission to
 * type that company's stand number, while its neighbour lets you swap the company
 * outright, would be stricter on the smaller action.
 *
 * It would also build a control the screen cannot reason about: this page is
 * guarded by `floorPlan`, so a role holding that and not `sponsors` would see the
 * box and be refused on save. One key, matching the sibling address, keeps the
 * screen and the server agreeing about who may do this.
 *
 * ── One company, one number ──────────────────────────────────────────────────
 *
 * The number is on the company, not the marker, so a company pinned on two maps
 * shows the same number on both — which is correct, because it has one stand. A
 * company holding two physically separate stands is out of scope and would be a
 * data-model change rather than a screen change.
 */

const ADMIN_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

type Ctx = { params: Promise<{ sponsorId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = session.user as any
  if (!ADMIN_ROLES.includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // One key, the same one the marker addresses beside this file ask for. See the
  // note above for why `sponsors` is deliberately not also required.
  if (!(await roleHasPermission(me.role, 'floorPlan'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sponsorId } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const checked = validateBoothNumberBody(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  const boothNumber = checked.value

  const conference = await prisma.conference.findFirst({
    where: { active: true },
    select: { id: true },
  })
  if (!conference) {
    return NextResponse.json({ error: 'There is no active conference.' }, { status: 409 })
  }

  // ── The write carries the conference scope, rather than checking then writing ─
  //
  // Same shape as the marker addresses beside this one, and for the same reason.
  // prisma.sponsor.update({ where: { id } }) assumes the row is still there and
  // still in this conference; a company removed between a separate check and the
  // write throws Prisma's P2025, which reaches the organizer as an unhandled 500
  // telling them the application broke rather than that the company is gone.
  //
  // Carrying the condition into updateMany makes the write itself enforce it: a
  // company that has gone, or that belongs to a different conference, matches
  // nothing and the count comes back 0. No exception to catch, and no window
  // between the check and the write.
  //
  // The conference scope is not decoration. Without it, an id belonging to another
  // event's exhibitor could be renumbered through this address by anyone who can
  // reach this screen — the same hole the marker addresses close with their
  // two-step lookup.
  const applied = await prisma.sponsor.updateMany({
    where: { id: sponsorId, conferenceId: conference.id },
    data: { boothNumber },
  })
  if (applied.count === 0) {
    return NextResponse.json(
      { error: 'That company is not exhibiting at this event.' },
      { status: 404 },
    )
  }

  const updated = await prisma.sponsor.findFirst({
    where: { id: sponsorId, conferenceId: conference.id },
    select: { id: true, name: true, boothNumber: true },
  })
  if (!updated) {
    // The write landed and the row was removed before it could be read back. Both
    // halves are true, and "gone" is the answer the organizer's screen needs in
    // order to stop drawing markers for a company that no longer exists.
    return NextResponse.json(
      { error: 'That company is not exhibiting at this event.' },
      { status: 404 },
    )
  }

  // A delegate's marker reads the booth number and falls back to the company name
  // only when there is none, so this write changes what is drawn on every phone
  // looking at the map. It must reach them the same way a marker change does.
  const delegatesNotified = await revalidateAttendeeFloorPlan(
    'floor-plan/sponsors booth-number PATCH',
  )

  return NextResponse.json({ sponsor: updated, delegatesNotified })
}
