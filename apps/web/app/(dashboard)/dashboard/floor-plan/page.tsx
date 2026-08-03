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
        },
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
            // A seeded map holds a path; an uploaded one holds the picture
            // itself, base64-encoded. Sending the second to the browser would
            // put several megabytes into this page for a thumbnail, so an
            // uploaded map is shown through the participant app's own address
            // for it — the same substitution the participant map list makes.
            // Finding F-14.
            previewUrl: m.imageUrl.startsWith('data:') ? null : m.imageUrl,
          }))}
          conferenceName={conference?.name ?? null}
          crossAppLinkConfigured={crossAppLinkConfigured}
        />
      </main>
    </>
  )
}
