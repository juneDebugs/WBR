import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import {
  SURFACE_SPONSOR_DRAFT_INTRO,
  preflightCaps,
  remainingDailyForUser,
} from '@/lib/ai-controls'

function isFeatureEnabled(): boolean {
  return process.env.WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED === 'true'
}

// GET /api/recommendations/quota — pre-flight AI cap state for the
// current sponsor user. The button on `RecommendedAttendees` and the
// remaining-count line on `IntroDraftModal` both consume this. The
// draft-intro POST response also carries `remaining` on success/user-
// cap hits; this endpoint is the pre-flight before a request is made.
export async function GET() {
  if (!isFeatureEnabled()) {
    return NextResponse.json({ error: 'feature_disabled' }, { status: 404 })
  }

  const user = await getUserFromHeaders()
  if (!user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.sponsorId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const surface = SURFACE_SPONSOR_DRAFT_INTRO
  try {
    const [capHit, remaining] = await Promise.all([
      preflightCaps(user.id, surface),
      remainingDailyForUser(user.id, surface),
    ])
    return NextResponse.json({ remaining, capHit })
  } catch (err: any) {
    console.error('[quota] DB failure', err?.message ?? err)
    // Fail-open in the payload — the client hook already treats a
    // non-ok response as `{ remaining: null, capHit: null }`, so UX
    // remains: button stays enabled → user clicks → the draft-intro
    // POST (authoritative cap gate) surfaces the real failure as a
    // 502 pattern γ. HTTP 500 here preserves that UX while exposing
    // the DB outage to status-based monitoring.
    return NextResponse.json({ remaining: null, capHit: null }, { status: 500 })
  }
}
