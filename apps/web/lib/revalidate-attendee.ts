import 'server-only'

// Cross-app cache invalidation. The attendee app deploys as its own Vercel
// project, so its origin must come from ATTENDEE_APP_URL in production; the
// localhost fallback only works when both apps run on one dev machine.
//
// ── Two things were wrong here before 2026-08-02, recorded as F-16 and F-17 ───
//
// 1. ATTENDEE_APP_URL is set on no deployed project and appears in no .env
//    example file, so in production the request went to localhost and failed.
//
// 2. Worse, it could not have worked even with the URL set. The attendee app's
//    middleware refused /api/revalidate with 401 before the route ran, because a
//    server-to-server call carries no session cookie. Measured: no cookie gave
//    401 {"error":"Unauthorized"}; the identical body sent with a session gave
//    200. That middleware now exempts the one address by exact path equality.
//
// The second one survived unnoticed because of the code that used to be here.
// fetch does NOT throw on an HTTP error status — it resolves with res.ok false —
// so a caller holding only a .catch() sees nothing. Every call reported success
// while doing nothing, for every tag, in every environment, since the mechanism
// was written.
//
// Hence the res.ok check below. A refusal has to be visible, because the
// alternative is not a broken feature; it is a feature that looks fine.

/** How long a writer will wait for the other app before giving up on it. */
const TIMEOUT_MS = 3000

/**
 * ── Awaited, not fire-and-forget, and that was a deliberate change ───────────
 *
 * This used to start the request and return immediately. Two reasons that was
 * wrong, the second worse than the first:
 *
 *   Measured 2026-08-02 while building Phase 10: an upload responded, the test
 *   read the participant map straight afterwards, and the old list came back.
 *   The invalidation was still in flight. A person clicking Save and then
 *   looking at their phone is slower than that, so it would rarely show — which
 *   makes it the kind of fault that appears once, during a demonstration.
 *
 *   On serverless the instance can be frozen or reclaimed as soon as the
 *   response is sent, so work started after it may simply never happen. A
 *   fire-and-forget invalidation is not a slow invalidation; it is one that
 *   sometimes does not occur, with nothing logged. That is the same shape of
 *   fault as F-17 itself.
 *
 * The cost is one local round trip on the organizer's save. The timeout bounds
 * it: if the participant app is unreachable, the writer waits three seconds,
 * logs, and still reports the save as successful — because the row IS written.
 */
async function post(tags: string[], label: string): Promise<boolean> {
  const base = process.env.ATTENDEE_APP_URL ?? 'http://localhost:3001'

  try {
    const res = await fetch(`${base}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.NEXTAUTH_SECRET, tags }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn(
        `[${label}] the attendee app REFUSED the cache invalidation: HTTP ${res.status} at ${base}/api/revalidate. ` +
          `Tags ${tags.join(', ')} were NOT cleared, so delegates keep stale data until the cache expires. ` +
          `Check ATTENDEE_APP_URL, and that NEXTAUTH_SECRET matches between the two apps.`,
      )
      return false
    }
    return true
  } catch (err) {
    console.warn(`[${label}] could not reach the attendee app at ${base}/api/revalidate`, err)
    return false
  }
}

/**
 * Tell the attendee app that cached data behind these tags has changed.
 *
 * Generalised on 2026-08-02. This existed only as a speakers-specific function
 * with its tag list hardcoded, which is why Phase 10 could not "reuse the
 * existing mechanism" the way the plan assumed it would.
 */
export async function revalidateAttendeeTags(tags: string[], label = 'revalidateAttendeeTags') {
  if (tags.length === 0) return true
  return post(tags, label)
}

export async function revalidateAttendeeSpeakers(speakerId?: string) {
  const tags = ['speakers']
  if (speakerId) tags.push(`speaker-${speakerId}`)
  return post(tags, 'revalidateAttendeeSpeakers')
}

/**
 * Every write that changes what the participant venue map shows.
 *
 * Two classes of writer, and the second is easy to miss. Maps and markers are
 * the obvious one. The other is any edit to a company that appears on a booth
 * card: Phase 9 moved tagline, website, logo, booth number and offerings into
 * the cached map payload so the card needs no second request, which quietly made
 * the participant map a reader of sponsor profile data. Finding F-13.
 */
export async function revalidateAttendeeFloorPlan(label = 'revalidateAttendeeFloorPlan') {
  return post(['floor-plan'], label)
}
