import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { readImageSize } from '@/lib/image-dimensions'
import { applyOrder, isCompleteSet } from '@/lib/floor-plan-order'
import { revalidateAttendeeFloorPlan } from '@/lib/revalidate-attendee'
import { roleHasPermission } from '@/lib/api-permission'

/**
 * Create a venue map from a picture an organizer uploaded.
 *
 * Phase 10, user stories FP 23 and FP 29. The picture arrives as a base64 data
 * URL and is stored in the map's imageUrl column, which is what finding F-8
 * settled. The participant app substitutes a dedicated address for it when
 * serving the map list, so the picture never travels inside that response —
 * finding F-14.
 *
 * ── Why every limit is checked here and not only in the browser ──────────────
 *
 * The organizer's screen resizes the picture and refuses the wrong sort of file
 * before anything is sent. That is where a person gets a useful message. It is
 * not where the rule lives: a request that did not come from that screen would
 * walk past all of it. Each check below is the same rule the screen applies,
 * applied again to whatever actually arrives.
 */

// The largest upload accepted, decoded. Settled by the project owner on
// 2026-08-02 along with the 2400-pixel storage limit.
const MAX_BYTES = 10 * 1024 * 1024
const MAX_LONG_EDGE = 2400

const ADMIN_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

/** JPG and PNG only. Decision F-15: a PDF is refused rather than converted. */
const ACCEPTED = new Set(['image/png', 'image/jpeg'])

export async function POST(req: NextRequest) {
  // Derived from the session, never from a request header, matching the sibling
  // write routes in this app.
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

  // ── The size check comes BEFORE reading the body, and this is not an
  //    optimisation ───────────────────────────────────────────────────────────
  //
  // Measured while building this: an 11 MB picture made req.json() throw, so the
  // request was refused with "Expected a JSON body." An organizer uploading a
  // large photograph would have been told their request was malformed rather
  // than that it was too big — the wrong message on the most likely mistake, and
  // the same failure F-15 records for PDFs, where the message is the whole of
  // what a person has to work with.
  //
  // Base64 costs a third on top, so a picture at the 10 MB limit arrives as
  // roughly 13.4 MB of text plus the JSON around it. Anything past that ceiling
  // cannot be a picture within the limit, whatever it is.
  const declaredLength = Number(req.headers.get('content-length') ?? 0)
  const CEILING = Math.ceil((MAX_BYTES * 4) / 3) + 4096
  if (declaredLength > CEILING) {
    return NextResponse.json(
      { error: 'That picture is larger than 10 MB. Save it at a smaller size and upload it again.' },
      { status: 400 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    // Reached when the body is unparseable for a reason the ceiling above did
    // not catch — including a body with no declared length. The size message is
    // the useful one here: an oversized upload is far and away the likeliest
    // cause, and a person reading it is told something they can act on.
    return NextResponse.json(
      { error: 'That upload could not be read. If the picture is larger than 10 MB, save it at a smaller size and upload it again.' },
      { status: 400 },
    )
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Give the map a name, for example "Exhibit Hall".' }, { status: 400 })
  }

  const dataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : ''
  if (!dataUrl) {
    return NextResponse.json({ error: 'Choose a picture of the floor plan to upload.' }, { status: 400 })
  }

  // [\s\S] rather than . with the `s` flag: this app's TypeScript target predates
  // that flag, and the build would have hidden it because next.config.js sets
  // typescript.ignoreBuildErrors. Same behaviour, no flag — a base64 payload that
  // arrives wrapped across lines still matches.
  const parsed = dataUrl.match(/^data:([\w/+.-]+);base64,([\s\S]*)$/)
  if (!parsed) {
    return NextResponse.json(
      { error: 'That does not look like a picture. Upload a JPG or PNG of the floor plan.' },
      { status: 400 },
    )
  }

  const [, declaredType, base64] = parsed

  // The PDF case is answered before the general one so the organizer is told
  // what to do rather than only that something was wrong. F-15 records that the
  // app converts nothing, and that this message is the whole of the fallback if
  // a PDF turns up on the day.
  const decoded = Buffer.from(base64, 'base64')
  const looksLikePdf = declaredType === 'application/pdf' || decoded.subarray(0, 5).toString('ascii') === '%PDF-'
  if (looksLikePdf) {
    return NextResponse.json(
      { error: 'This app does not accept PDFs. Open the PDF, save the page as a JPG or PNG, and upload that instead.' },
      { status: 400 },
    )
  }

  if (!ACCEPTED.has(declaredType)) {
    return NextResponse.json(
      { error: 'Only JPG and PNG pictures can be uploaded. Save the floor plan in one of those formats and try again.' },
      { status: 400 },
    )
  }

  if (decoded.length > MAX_BYTES) {
    return NextResponse.json(
      { error: 'That picture is larger than 10 MB. Save it at a smaller size and upload it again.' },
      { status: 400 },
    )
  }

  // Null means "could not read the header", which is refused rather than waved
  // through. A guard that fails open is how F-6 happened in this project.
  const size = readImageSize(decoded)
  if (!size) {
    return NextResponse.json(
      { error: 'That picture could not be read. Upload a JPG or PNG of the floor plan.' },
      { status: 400 },
    )
  }

  if (Math.max(size.width, size.height) > MAX_LONG_EDGE) {
    return NextResponse.json(
      {
        error: `That picture is ${size.width} by ${size.height} pixels. Maps are stored at up to 2400 pixels on the longest side — save it smaller and upload it again.`,
      },
      { status: 400 },
    )
  }

  const conference = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  if (!conference) {
    return NextResponse.json({ error: 'There is no active conference to add a map to.' }, { status: 409 })
  }

  // ── Allocating the switch position ──────────────────────────────────────────
  //
  // The switch order is unique within a conference, so a new map goes on the end
  // rather than into a gap. Reading the highest position and then inserting one
  // past it is two statements, and two different things can happen in between.
  // Both were found by the adversarial review, and they need different answers.
  //
  // Round 1: two uploads at once both read the same highest position and both
  // insert it. The unique constraint rejects one, which protects the order but
  // throws away a legitimate upload and answers with an unhandled error rather
  // than anything a person could act on. Answered by retrying — each attempt
  // re-reads, so the second organizer simply lands one place further along.
  // Retried rather than locked because SQLite has no row-level lock to take
  // here, and because a collision is rare and resolves itself on the next try.
  //
  // Round 2, and this one is quieter: a DELETE committing between the read and
  // the insert renumbers the remaining maps DOWNWARD, so the insert uses a
  // maximum that no longer exists. Positions 1,2,3 become 1,2 after a delete,
  // and the insert still writes 4. No constraint is violated, so no retry fires,
  // and the order is left with a permanent hole that every later upload builds
  // on. Retrying cannot answer this, because nothing failed.
  //
  // So the create and a full renumber happen in ONE transaction. Whatever else
  // committed in between, the set this transaction sees is renumbered to
  // 1..n before it commits, and contiguity is restored rather than assumed.
  let createdId: string | null = null
  let lastError: unknown = null

  for (let attempt = 0; attempt < 5 && !createdId; attempt++) {
    try {
      createdId = await prisma.$transaction(async tx => {
        const last = await tx.venueMap.findFirst({
          where: { conferenceId: conference.id },
          orderBy: { position: 'desc' },
          select: { position: true },
        })

        const created = await tx.venueMap.create({
          data: {
            conferenceId: conference.id,
            name,
            imageUrl: dataUrl,
            position: (last?.position ?? 0) + 1,
          },
          select: { id: true },
        })

        const all = await tx.venueMap.findMany({
          where: { conferenceId: conference.id },
          orderBy: { position: 'asc' },
          select: { id: true },
        })
        await applyOrder(tx, all.map(m => m.id))

        return created.id
      })
    } catch (err: any) {
      // P2002 is Prisma's unique-constraint violation. Anything else is not a
      // collision and must not be swallowed by a retry loop.
      const isCollision = err?.code === 'P2002' || /UNIQUE constraint failed/i.test(String(err?.message ?? ''))
      if (!isCollision) throw err
      lastError = err
    }
  }

  if (!createdId) {
    console.warn('[floor-plan/maps POST] gave up allocating a switch position after 5 attempts', lastError)
    return NextResponse.json(
      { error: 'Another map was being added at the same time. Try uploading again.' },
      { status: 409 },
    )
  }

  // Read back after the renumber: the position assigned during the insert is not
  // necessarily the one the map ended up with.
  const map = await prisma.venueMap.findUnique({
    where: { id: createdId },
    select: { id: true, name: true, position: true },
  })

  // ── The organizer is told what ACTUALLY happened, not what was configured ────
  //
  // Added 2026-08-03, before ATTENDEE_APP_URL was set on the deployed organizer
  // app. The helper already returns whether the participant app accepted the
  // notification, and this line used to throw that answer away.
  //
  // The screen then chose its wording from whether the VARIABLE EXISTS. So with the
  // variable set and the call timing out — three seconds, the one plausible bad-
  // network case — the organizer was told "Delegates can see it now" when they
  // could not. During a demonstration that is a claim made to a room, and it would
  // be wrong. A silent stale phone is recoverable; telling someone it is not stale
  // is not.
  //
  // The row is saved either way, so this changes no status code and fails nothing.
  const delegatesNotified = await revalidateAttendeeFloorPlan('floor-plan/maps POST')

  return NextResponse.json({ map, delegatesNotified }, { status: 201 })
}

/**
 * Set the order delegates switch through the maps in. User story FP 29.
 *
 * Takes the complete list of the active conference's map ids, in the order the
 * organizer wants. Complete is not a convenience: a list naming only some of the
 * maps would renumber those into positions the others still hold, leaving
 * duplicate or missing positions behind. A partial list is refused rather than
 * partly applied.
 */
export async function PATCH(req: NextRequest) {
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

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const orderedIds: unknown = body?.orderedIds
  if (!Array.isArray(orderedIds) || orderedIds.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'Send orderedIds as a list of map ids.' }, { status: 400 })
  }

  const conference = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  if (!conference) {
    return NextResponse.json({ error: 'There is no active conference.' }, { status: 409 })
  }

  const existing = await prisma.venueMap.findMany({
    where: { conferenceId: conference.id },
    select: { id: true },
  })
  const existingIds = existing.map(m => m.id)

  if (!isCompleteSet(orderedIds as string[], existingIds)) {
    return NextResponse.json(
      {
        error: `The new order must list every map for this conference exactly once. It has ${existingIds.length} maps and ${orderedIds.length} were sent.`,
      },
      { status: 400 },
    )
  }

  await prisma.$transaction(async tx => {
    await applyOrder(tx, orderedIds as string[])
  })

  // Reported rather than discarded, for the reason above POST.
  const delegatesNotified = await revalidateAttendeeFloorPlan('floor-plan/maps PATCH')

  return NextResponse.json({ orderedIds, delegatesNotified })
}
