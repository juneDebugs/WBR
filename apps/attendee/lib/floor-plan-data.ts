import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'

/**
 * The floor plan for the active conference: every map in its switch order, and
 * every marker on it.
 *
 * Shaped the same way as speakers-data.ts — a cached read of the whole table
 * filtered to the active conference, rather than a query per request — because
 * the maps change roughly never and the markers change only when an organizer
 * moves one.
 *
 * A booth marker's company is resolved here through the sponsor link, never
 * from anything stored on the marker itself. The seed file and the database
 * have already drifted apart on booth numbers while ids have not, so the link
 * is the only trustworthy route to a company's name and booth number.
 */

const getCachedConference = unstable_cache(
  async () => prisma.conference.findFirst({ where: { active: true }, select: { id: true } }),
  ['attendee-conference'],
  { revalidate: 300, tags: ['conference'] },
)

const getCachedVenueMaps = unstable_cache(
  async () =>
    prisma.venueMap.findMany({
      select: {
        id: true,
        conferenceId: true,
        name: true,
        imageUrl: true,
        position: true,
        pins: {
          select: {
            id: true,
            type: true,
            label: true,
            x: true,
            y: true,
            sponsorId: true,
            sponsor: {
              select: { id: true, name: true, logoUrl: true, boothNumber: true },
            },
          },
        },
      },
      orderBy: { position: 'asc' },
    }),
  ['attendee-venue-maps'],
  // ── A requirement this cache places on Phases 10 and 11 ────────────────────
  //
  // Nothing writes floor-plan data yet: the maps and markers are seeded, and the
  // organizer's upload and pin-placement tools are Phases 10 and 11. So no
  // caller revalidates this tag today, and nothing is stale.
  //
  // The moment an organizer can move a marker, that stops being true. A saved
  // change would look saved in the admin app while delegates kept seeing the old
  // position for up to five minutes — including during a demonstration, where
  // that reads as the save having failed. Raised by adversarial review round 2
  // and recorded in the plan against both phases.
  //
  // The mechanism already exists and is used elsewhere: a writer calls
  // revalidateTag, and a writer in another app posts the tag to this app's
  // /api/revalidate address, which is how apps/web already invalidates
  // 'speakers' and 'chat'. Phases 10 and 11 must do the same with 'floor-plan'.
  { revalidate: 300, tags: ['floor-plan'] },
)

export type FloorPlanPin = {
  id: string
  type: string
  /** What the marker shows. A booth takes its company's name; a room its label. */
  label: string
  x: number
  y: number
  sponsor: { id: string; name: string; logoUrl: string | null; boothNumber: string | null } | null
}

export type FloorPlanMap = {
  id: string
  name: string
  imageUrl: string
  position: number
  pins: FloorPlanPin[]
}

export async function fetchFloorPlanData(): Promise<{ maps: FloorPlanMap[]; count: number }> {
  const [conference, allMaps] = await Promise.all([getCachedConference(), getCachedVenueMaps()])

  const maps = conference ? allMaps.filter(m => m.conferenceId === conference.id) : []

  const data: FloorPlanMap[] = maps.map(m => ({
    id: m.id,
    name: m.name,
    imageUrl: m.imageUrl,
    position: m.position,
    pins: m.pins
      // A marker with no usable name is not drawn. A booth whose company was
      // deleted keeps its stored label as the fallback; if that is empty too
      // there is nothing to show a delegate and a nameless dot on a map is
      // worse than no dot.
      .map(p => {
        const label = p.sponsor?.name ?? p.label ?? ''
        return {
          id: p.id,
          type: p.type,
          label,
          x: p.x,
          y: p.y,
          sponsor: p.sponsor ?? null,
        }
      })
      .filter(p => p.label.trim().length > 0)
      // Stable order so the markup does not reshuffle between requests.
      .sort((a, b) => a.y - b.y || a.x - b.x),
  }))

  return { maps: data, count: data.length }
}
