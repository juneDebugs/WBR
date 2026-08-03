import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

/**
 * The picture for one venue map.
 *
 * Finding F-14. GET /api/data/map returns every map for the conference in one
 * response. An organizer's upload writes the picture into the imageUrl column as
 * a base64 data URL, so without this address every uploaded picture would travel
 * in full, for every map, on every visit to the map screen — even though a
 * delegate looks at one map at a time. Measured with one uploaded map present:
 * the list response went from roughly 6.6 KB to 44,696 bytes.
 *
 * The list response now carries a short string for every map: the stored file
 * path for a seeded one, this address for an uploaded one. An <img> tag reads
 * both through the same attribute, so the viewer needs no branch.
 *
 * ── This follows the speaker-photograph precedent in ONE respect, not two ────
 *
 * apps/web/app/api/data/speakers/route.ts substitutes /api/speakers/<id>/photo
 * for any stored value beginning "data:". That substitution is the pattern, and
 * lib/floor-plan-data.ts copies it.
 *
 * Its backing address, apps/web/app/api/speakers/[id]/photo/route.ts, is NOT the
 * pattern for access: it never checks a session, so anyone holding an id can
 * read the picture. Copying that here would put the venue's floor plans on an
 * unauthenticated address while /api/data/map — the address that hands out the
 * ids — refuses both a signed-out visitor and a delegate with an incomplete
 * profile. The two checks below are the same two that address makes, in the same
 * order, so the picture is exactly as protected as the data pointing at it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reading is gated, the same as every other data address in this app. A
  // delegate blocked from every screen who can still read the venue's maps is
  // not blocked. See lib/require-complete-profile.ts.
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const { id } = await params

  // ── Scoped to the active conference, like the address that hands out the ids
  //
  // Raised by Phase 10's adversarial review, round 1. The first version looked
  // the map up by id alone. /api/data/map only ever lists maps belonging to the
  // ACTIVE conference, so an id from a previous or inactive conference — reached
  // through a bookmark, a log line, an old cached payload, or admin tooling —
  // would still have served its floor plan here. Two addresses reading the same
  // table disagreed about which rows exist.
  //
  // Every check on this address now matches the list: a session, a complete
  // profile, and the active conference.
  const conference = await prisma.conference.findFirst({
    where: { active: true },
    select: { id: true },
  })
  if (!conference) return new NextResponse(null, { status: 404 })

  const map = await prisma.venueMap.findFirst({
    where: { id, conferenceId: conference.id },
    select: { imageUrl: true },
  })

  if (!map?.imageUrl) return new NextResponse(null, { status: 404 })

  const stored = map.imageUrl

  // A seeded map holds a file path, and lib/floor-plan-data.ts leaves those
  // alone, so nothing in the product asks this address for one. It is handled
  // anyway: the alternative is a 404 for an id that plainly exists, which reads
  // as a broken map rather than as a value in a different shape.
  if (!stored.startsWith('data:')) {
    return NextResponse.redirect(new URL(stored, _req.url), {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=3600' },
    })
  }

  const match = stored.match(/^data:(image\/[\w+.-]+);base64,(.+)$/)
  if (!match) return new NextResponse(null, { status: 404 })

  const [, contentType, b64] = match
  const buffer = Buffer.from(b64, 'base64')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      // `private`, never `public`. This picture is gated, and `public` invites a
      // shared cache to store it and hand it to somebody else — which is how a
      // guarded address gets served past its guard. Phase 6 changed the buyer
      // directory for exactly this reason and it is the only precedent here.
      //
      // 60 seconds rather than an hour, deliberately. Replacing a map's picture
      // does not change this address, because the id does not change. A long
      // window would leave delegates looking at the old picture long after the
      // map data itself had refreshed — the same failure the floor-plan cache
      // invalidation exists to prevent, moved one layer down. 60 seconds bounds
      // it without making a phone re-download the picture on every map switch.
      'Cache-Control': 'private, max-age=60',
    },
  })
}
