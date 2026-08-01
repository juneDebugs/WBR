import 'server-only'

// Best-effort cross-app cache invalidation. The attendee app deploys as its own
// Vercel project, so its origin must come from ATTENDEE_APP_URL in production;
// the localhost fallback only works when both apps run on one dev machine.
//
// Fire-and-forget: never await-block the response and never throw. But a dead
// hook must be VISIBLE in prod logs (console.warn), not swallowed by an empty
// catch — otherwise every speaker edit silently leaves the attendee pages stale
// until their TTL with no signal at all.
export function revalidateAttendeeSpeakers(speakerId?: string) {
  const base = process.env.ATTENDEE_APP_URL ?? 'http://localhost:3001'
  const tags = ['speakers']
  if (speakerId) tags.push(`speaker-${speakerId}`)
  fetch(`${base}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.NEXTAUTH_SECRET, tags }),
  }).catch((err) => {
    console.warn('[revalidateAttendeeSpeakers] failed', err)
  })
}
