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
            // ── Why the card's fields are selected here rather than fetched on
            //    tap ────────────────────────────────────────────────────────
            //
            // Decided 2026-08-02, recorded in the floor-plan requirements at
            // § Implementation Decisions and in the plan's § Phase 9. Tapping a
            // booth marker must show a complete card with no network request in
            // between, on a conference wireless network, while someone is
            // watching. Measured on the seeded venue: tagline, website and
            // offerings total 1,913 characters across the ten exhibiting
            // companies — 191 each, under 2.5 KB on a response a delegate asks
            // for once per visit to the screen.
            //
            // The caution about inlining values into /api/data/* responses is
            // about base64 images, which are three orders of magnitude larger.
            // It does not transfer, and the measurement above is what
            // establishes that rather than the assertion.
            //
            // The limit, so it is not rediscovered as a surprise: this holds
            // while the exhibiting-company count is in the tens. At a few
            // hundred booths the response stops being small and the decision
            // needs revisiting against a fetch-on-tap design.
            sponsor: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                boothNumber: true,
                tagline: true,
                website: true,
                solutionsOffering: true,
              },
            },
          },
        },
      },
      orderBy: { position: 'asc' },
    }),
  // ── The suffix is a payload VERSION and must change whenever this select
  //    changes ────────────────────────────────────────────────────────────────
  //
  // Raised by Phase 9's adversarial review. Next writes this cache to disk under
  // .next/cache, and that directory survives a restart and is restored between
  // deployments. Phase 9 widened the sponsor select to carry tagline, website
  // and solutionsOffering, but left the key alone — so an entry written by the
  // previous select could be served to the new code, which would read three
  // fields that are simply absent from it. Nothing throws: parseSolutions gives
  // back an empty list and the two strings come back undefined, so every card
  // renders with no tagline, no offerings and no website link, for up to five
  // minutes, with nothing in any log to say why.
  //
  // Bumping the key retires every entry of the old shape at once. Cheaper and
  // more certain than remembering to clear a cache directory during a deploy.
  ['attendee-venue-maps-v2-with-card-fields'],
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

/** Everything the booth card shows, carried on the marker itself. */
export type FloorPlanSponsor = {
  id: string
  name: string
  logoUrl: string | null
  boothNumber: string | null
  tagline: string | null
  website: string | null
  /**
   * Already parsed into a list of strings. The column stores a JSON-encoded
   * array, and parsing it here means one place can get it wrong instead of
   * every reader. Finding F-7 in the floor-plan requirements records a
   * malformed array of exactly this kind blanking a whole screen.
   */
  solutions: string[]
}

export type FloorPlanPin = {
  id: string
  type: string
  /** What the marker shows. A booth takes its company's name; a room its label. */
  label: string
  x: number
  y: number
  sponsor: FloorPlanSponsor | null
}

/**
 * Turn the stored JSON array of offerings into a list of non-empty strings.
 *
 * Every failure returns an empty list rather than throwing: null, a malformed
 * string, valid JSON that is not an array, and an array holding things that are
 * not strings. A card with no offerings section is a small loss; a map screen
 * that throws while rendering is the whole feature.
 */
function parseSolutions(raw: string | null): string[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
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
          sponsor: p.sponsor
            ? {
                id: p.sponsor.id,
                name: p.sponsor.name,
                logoUrl: p.sponsor.logoUrl,
                boothNumber: p.sponsor.boothNumber,
                tagline: p.sponsor.tagline,
                website: p.sponsor.website,
                solutions: parseSolutions(p.sponsor.solutionsOffering),
              }
            : null,
        }
      })
      .filter(p => p.label.trim().length > 0)
      // Stable order so the markup does not reshuffle between requests.
      .sort((a, b) => a.y - b.y || a.x - b.x),
  }))

  return { maps: data, count: data.length }
}
