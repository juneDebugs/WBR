import 'server-only'
import { unstable_cache } from 'next/cache'
import {
  prisma,
  getCompanyDirectory,
  getSponsorScheduleMatrix,
  getCheckInBoard,
  getTableBoard,
  getSponsorTables,
  getAutoMatchBoard,
} from '@conference/db'

// Read-through cache for the Meetings scheduler board endpoints.
//
// Every board read is a pure aggregation over the same tables, and against
// Turso's HTTP data layer each one costs several ~170ms round-trips (measured:
// company directory ~0.6s, per-company matrix ~1.3s, auto board ~0.7s). These
// endpoints are hit on every tab navigation and on the 30s React-Query polls,
// so recomputing from scratch each time is the dominant source of the "big
// lag" in the Meetings section.
//
// All entries share the `meetings` cache tag, which every scheduler mutation
// route already invalidates via `revalidateTag('meetings')` (assign / cancel /
// reschedule / check-in / auto-match, plus the tables + settings writes wired
// up alongside this change). So a cache hit is only ever served for state that
// no write has touched since — an admin action busts the relevant board on the
// next fetch, and React Query's own `invalidateScheduler` refetches it. The
// short `revalidate` windows bound staleness for out-of-band writes (seeds,
// direct DB edits, cross-app portal picks) that don't run through these routes.
//
// unstable_cache keys are (keyParts + serialized args). The engine functions
// resolve the active conference internally and return JSON-safe values (ISO
// date strings), so nothing request-specific leaks into a cached result.

export const getCachedCompanyDirectory = unstable_cache(
  () => getCompanyDirectory(prisma),
  ['scheduler', 'company-directory'],
  { revalidate: 30, tags: ['meetings'] },
)

export const getCachedCheckInBoard = unstable_cache(
  () => getCheckInBoard(prisma),
  ['scheduler', 'checkin-board'],
  // Floor managers tick arrivals concurrently; keep this the freshest board.
  // A check-in write revalidates the tag, so cross-manager convergence is
  // immediate on the next poll — this window only bounds out-of-band drift.
  { revalidate: 10, tags: ['meetings'] },
)

export const getCachedTableBoard = unstable_cache(
  () => getTableBoard(prisma),
  ['scheduler', 'table-board'],
  { revalidate: 30, tags: ['meetings'] },
)

export const getCachedSponsorTables = unstable_cache(
  () => getSponsorTables(prisma),
  ['scheduler', 'sponsor-tables'],
  { revalidate: 30, tags: ['meetings'] },
)

export const getCachedAutoMatchBoard = unstable_cache(
  () => getAutoMatchBoard(prisma),
  ['scheduler', 'auto-board'],
  { revalidate: 20, tags: ['meetings'] },
)

// Per-company matrix: one cache entry per sponsor (sponsorId is part of the
// key), all under the shared `meetings` tag so any scheduler write clears them.
export function getCachedSponsorMatrix(sponsorId: string) {
  return unstable_cache(
    () => getSponsorScheduleMatrix(prisma, sponsorId),
    ['scheduler', 'matrix', sponsorId],
    { revalidate: 15, tags: ['meetings'] },
  )()
}
