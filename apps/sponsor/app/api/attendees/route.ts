import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { getCachedAttendees } from '@/lib/server-data'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // THE ADDRESS THIS PHASE EXISTS FOR. It returns every delegate at the event
  // with company, job title, biography, company size, annual revenue and what
  // each one is looking to buy — the population and the attributes the business
  // sells exhibitors access to. Access to it follows the exhibiting company
  // being presentable to those people (OE 17).
  //
  // This address never consults the caller's company, so it takes the refusal
  // and ignores the rest of what the guard returns.
  const { refused } = await requireCompleteProfile()
  if (refused) return refused

  const people = await getCachedAttendees()
  return NextResponse.json(people, {
    headers: {
      // WAS `public`, CHANGED TO `private` BY PHASE 6. The requirements document
      // listed this header as out of scope and the plan said the same, so the
      // change is recorded as a finding in both rather than made quietly.
      //
      // WHY IT HAD TO CHANGE. `public` invites any shared cache between this app
      // and the caller to store the response and hand it to somebody else for the
      // next sixty seconds. This is the address Phase 6 exists to guard, and the
      // guard runs in application code — so a shared cache that answered from its
      // own copy would defeat the refusal without this code running at all. A
      // phase whose headline promise is "an incomplete representative is refused
      // the buyer directory" cannot ship an invitation to serve that directory
      // from a cache the guard never sees.
      //
      // The same reasoning the project already applied once: Phase 5 fixed
      // PATCH /api/profile, nominally Phase 6's territory, because Phase 5 was
      // what turned a stale company link into a trap. Before this phase, `public`
      // here was a performance choice with no guarantee behind it to undermine.
      //
      // WHAT IT COSTS: as close to nothing as a change gets. The expensive part
      // is the database query, and that is ALREADY cached server-side for 60
      // seconds by unstable_cache in lib/server-data.ts (`sponsor-attendees`,
      // revalidate 60). This header was only ever caching a response the app
      // could already produce cheaply. The browser still keeps its own copy —
      // `private` permits that — and lib/hooks.ts holds it in memory for five
      // minutes on top.
      //
      // CONSISTENCY: this was the only Cache-Control header in this app, and the
      // participant app sets none at all on any of its fifteen guarded reading
      // addresses. Phase 6's whole design is to match that app; this line was the
      // one place the two differed.
      //
      // WHY `no-store` AND NOT `private, max-age=60, stale-while-revalidate=600`.
      // That was the first attempt at this fix, and an adversarial review round
      // caught the comment beside it claiming a 60-second residual while the
      // header actually permitted 660: `stale-while-revalidate=600` lets a browser
      // serve a stale copy for ten minutes past the freshness window while it
      // revalidates behind the scenes. For a guarded per-user response that is ten
      // minutes in which a representative who has just become incomplete, or lost
      // their company link, keeps being shown the buyer directory.
      //
      // It costs nothing to remove. The database query is cached server-side for
      // 60 seconds (lib/server-data.ts, `sponsor-attendees`), and this app's own
      // client holds the result in memory for five minutes through React Query
      // (lib/hooks.ts, staleTime 300_000), which HTTP caching does not affect
      // either way. So the header was buying a third layer on top of two that
      // already existed.
      //
      // WHAT THIS DOES NOT FIX, stated so the header is not credited with more
      // than it does: React Query's own in-memory copy, and the persisted copy in
      // IndexedDB (lib/query-client.tsx, 30 minutes, one fixed key), are not
      // governed by this header at all. Measured 2026-07-31: that persisted copy
      // survives pressing Sign out, holding roughly 1MB of one company's data. A
      // separate matter from this line, recorded in
      // docs/smoketests/phase-6-sponsor-request-guard.md.
      'Cache-Control': 'private, no-store',
    },
  })
}
