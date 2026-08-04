import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { permissionDenied } from '@/lib/require-permission'
import FloorPlanClient from '@/components/FloorPlanClient'

/**
 * The organizer's venue-map screen. Phase 10, user stories FP 23 and FP 29.
 *
 * Upload a floor plan as a JPG or PNG, set the order delegates switch through
 * the maps in, and delete one. Placing markers on a map is Phase 11; this screen
 * is shaped expecting that to sit on top of it.
 *
 * Not cached. Every other list screen in this app caches its read for a minute,
 * which is right for data that changes rarely and is read constantly. This is
 * the opposite: it is read only by the person who just changed it, and showing
 * them a minute-old list immediately after they uploaded something would look
 * exactly like the save having failed — the same misreading the whole
 * cross-app invalidation exists to prevent.
 */
export default async function FloorPlanPage() {
  const denied = await permissionDenied('floorPlan', 'Floor Plan')
  if (denied) return denied

  const conference = await prisma.conference.findFirst({
    where: { active: true },
    select: { id: true, name: true },
  })

  const maps = conference
    ? await prisma.venueMap.findMany({
        where: { conferenceId: conference.id },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          position: true,
          imageUrl: true,
          _count: { select: { pins: true } },
          // Phase 11. The markers travel with the map so the authoring screen can
          // draw them without a second request. A booth marker's company name and
          // booth number are resolved through the link rather than copied onto the
          // marker, for the reason recorded in the schema: the seed file and the
          // database have already drifted apart on booth numbers while ids have
          // not.
          pins: {
            select: {
              id: true,
              type: true,
              x: true,
              y: true,
              label: true,
              sponsorId: true,
              sponsor: { select: { id: true, name: true, boothNumber: true } },
            },
          },
        },
      })
    : []

  // The companies an organizer can put on a booth marker. Phase 11, user story
  // FP 26: the list surfaces each company's booth number, which needs no new
  // sponsor-side data entry because the field already exists.
  //
  // Scoped to the active conference, matching the marker addresses. A company from
  // another conference on this conference's map would carry its name, logo,
  // tagline, website and offerings onto the participant map through the link.
  //
  // Three fields only. GET /api/data/sponsors returning every column to any
  // session is a known open item in this project and not something to copy.
  const sponsors = conference
    ? await prisma.sponsor.findMany({
        where: { conferenceId: conference.id },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, boothNumber: true },
      })
    : []

  // Whether a saved change can actually reach delegates.
  //
  // Findings F-16 and F-17. Without ATTENDEE_APP_URL the invalidation goes to
  // localhost, which in production is nowhere: the map is saved, the admin app
  // says so, and delegates keep the old one until the cache expires. The
  // organizer has no way to know.
  //
  // The project owner's decision on 2026-08-02: save the map and WARN, rather
  // than report the save as failed. The row is written, so a failure message
  // would be untrue and would push someone into uploading the same file again.
  // What they need is both halves.
  //
  // Only the presence of the variable is sent to the browser, never its value.
  const crossAppLinkConfigured = Boolean(process.env.ATTENDEE_APP_URL)

  return (
    <>
      <AdminHeader title="Floor Plan" />
      <main className="flex-1 p-6">
        <FloorPlanClient
          maps={maps.map(m => ({
            id: m.id,
            name: m.name,
            position: m.position,
            markerCount: m._count.pins,
            // ── Corrected 2026-08-03, finding F-19 ─────────────────────────────
            //
            // This was `previewUrl: m.imageUrl.startsWith('data:') ? null :
            // m.imageUrl`. Neither branch could display anything. An uploaded map
            // got null, deliberately, because its stored value is the picture
            // itself and putting that in a page is what F-14 prevents. A seeded map
            // got a path such as /maps/exhibit-hall.png, and those files are
            // committed under apps/attendee/public — which only the participant app
            // serves, so this app answered 404. The value was also never rendered.
            //
            // Both kinds now come through this app's own guarded address, which
            // decodes an uploaded picture and reads a seeded one from
            // apps/web/assets/maps. One string, no branch, and the picture is
            // behind the same permission check as the markers drawn on it.
            pictureUrl: `/api/floor-plan/maps/${m.id}/image`,
            pins: m.pins.map(p => ({
              id: p.id,
              type: p.type === 'ROOM' ? ('ROOM' as const) : ('BOOTH' as const),
              x: p.x,
              y: p.y,
              label: p.label,
              sponsorId: p.sponsorId,
              sponsorName: p.sponsor?.name ?? null,
              sponsorBoothNumber: p.sponsor?.boothNumber ?? null,
            })),
          }))}
          sponsors={sponsors.map(s => ({
            id: s.id,
            name: s.name,
            boothNumber: s.boothNumber,
          }))}
          conferenceName={conference?.name ?? null}
          crossAppLinkConfigured={crossAppLinkConfigured}
        />
      </main>
    </>
  )
}
