import 'server-only'

/**
 * Cross-app cache invalidation, sponsor-app side.
 *
 * New on 2026-08-02. This app had no equivalent at all, which finding F-13
 * assumed could be "reused" from the admin app — it could not, because a helper
 * in apps/web is not importable here; the four apps share a data package, not
 * their lib folders. So this is a deliberate copy of
 * apps/web/lib/revalidate-attendee.ts rather than a shared module. If a third
 * app needs one, that is the point at which it is worth extracting.
 *
 * ── Why a company representative's profile edit touches the venue map ────────
 *
 * Phase 9 moved tagline, website, logo, booth number and offerings into the
 * participant app's cached map payload, so tapping a booth marker shows a
 * complete card with no second request. That quietly made the participant map a
 * reader of sponsor profile data. Finding F-13: before this, a representative
 * changing their tagline saw it at once in this portal while delegates kept the
 * old one for up to five minutes, with nothing logged anywhere.
 *
 * ── The refusal has to be visible ────────────────────────────────────────────
 *
 * fetch does not throw on an HTTP error status; it resolves with res.ok false.
 * The admin app's version of this had only a .catch(), so when the participant
 * app's middleware refused every call with 401, nothing was logged and the
 * failure went unnoticed for the life of the feature. Finding F-17.
 */
export async function revalidateAttendeeFloorPlan(label = 'revalidateAttendeeFloorPlan') {
  const base = process.env.ATTENDEE_APP_URL ?? 'http://localhost:3001'

  // Awaited with a timeout rather than fire-and-forget. On serverless the
  // instance can be frozen the moment the response is sent, so work started
  // after it may never happen — an invalidation that sometimes does not occur,
  // with nothing logged, which is the same shape of fault as F-17 itself.
  try {
    const res = await fetch(`${base}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.NEXTAUTH_SECRET, tags: ['floor-plan'] }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
        console.warn(
          `[${label}] the attendee app REFUSED the cache invalidation: HTTP ${res.status} at ${base}/api/revalidate. ` +
            `The floor-plan tag was NOT cleared, so delegates keep the old booth card until the cache expires. ` +
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
