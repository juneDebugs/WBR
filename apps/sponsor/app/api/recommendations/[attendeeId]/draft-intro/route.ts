import { NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import { prisma } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'
import {
  IntroSchema,
  buildPrompt,
  canDraft,
  type AttendeeInputs,
  type SponsorInputs,
} from '@/lib/ai-intro'
import {
  CAP_HTTP_STATUS,
  SURFACE_SPONSOR_DRAFT_INTRO,
  estimateCostUsd,
  findFreshIdempotencyHit,
  insertOrDedup,
  preflightCaps,
  remainingDailyForUser,
} from '@/lib/ai-controls'

function parseArr(val: string | null | undefined): string[] {
  if (!val) return []
  try {
    const parsed = JSON.parse(val)
    // Guard against malformed-but-parseable values: `"null"` parses to
    // `null`, `"{}"` parses to an object, `"42"` parses to a number.
    // Spreading a non-array would either throw or produce garbage
    // downstream. Coerce to an empty array on shape mismatch.
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

function isFeatureEnabled(): boolean {
  return process.env.WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED === 'true'
}

// Idempotency key shape guard. Accepts any non-empty string (UUIDs are
// standard, but a caller could send a nonce of another shape). Rejects
// empty / whitespace / non-string. Long values are truncated at the DB
// column bound implicitly — SQLite TEXT has no length cap, but we cap
// at a sane maximum so a malicious client can't stuff megabytes.
const IDEMPOTENCY_KEY_MAX = 128
function isValidIdempotencyKey(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= IDEMPOTENCY_KEY_MAX
}

export async function POST(req: Request, ctx: { params: Promise<{ attendeeId: string }> }) {
  // Server-side kill-switch. Client mirror
  // (NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED) hides the button,
  // but the route is the authoritative gate.
  if (!isFeatureEnabled()) {
    return NextResponse.json({ error: 'feature_disabled' }, { status: 404 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 })
  }

  const user = await getUserFromHeaders()
  if (!user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.sponsorId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { attendeeId } = await ctx.params
  if (!attendeeId) {
    return NextResponse.json({ error: 'attendeeId required' }, { status: 400 })
  }

  // Idempotency key from request body. Required in Phase 12b — the
  // client (RecommendedAttendees.tsx) generates a fresh UUID per Draft
  // intro click. Reject requests without a valid key so we can't write
  // untracked AI calls.
  let idempotencyKey: string
  try {
    const body = await req.json()
    if (!isValidIdempotencyKey(body?.idempotencyKey)) {
      return NextResponse.json({ error: 'idempotencyKey required' }, { status: 400 })
    }
    idempotencyKey = body.idempotencyKey
  } catch {
    return NextResponse.json({ error: 'idempotencyKey required' }, { status: 400 })
  }

  const userId = user.id
  const sponsorIdNarrowed: string = user.sponsorId
  const surface = SURFACE_SPONSOR_DRAFT_INTRO

  // Any DB error from here on routes to pattern-γ 502 ai_unavailable —
  // the modal opens with an empty editable textarea + the banner. This
  // preserves Phase 12a's "any non-cap non-2xx = pattern γ" contract.
  let dedupHit: string | null
  let capHit: Awaited<ReturnType<typeof preflightCaps>>
  try {
    // ─ 1. Idempotency dedup ─────────────────────────────────────────
    // A live prior entry with the same (userId, attendeeId, key) short-
    // circuits: return the stored payload without a new AI call and
    // without consuming cap budget. Client retries within the 5s window
    // land here — the whole point of the idempotency key.
    dedupHit = await findFreshIdempotencyHit({ userId, attendeeId, idempotencyKey })

    // ─ 2. Cap pre-flight (skip on dedup) ────────────────────────────
    // Order-sensitive: burst → user-daily → global-daily. The first hit
    // wins. See the locked response matrix in `lib/ai-controls.ts`.
    capHit = dedupHit ? null : await preflightCaps(userId, surface)
  } catch (err: any) {
    console.error('[draft-intro] DB cap-check failed', err?.message ?? err)
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 })
  }

  if (dedupHit) {
    try {
      const remaining = await remainingDailyForUser(userId, surface)
      return NextResponse.json({ ...JSON.parse(dedupHit), remaining })
    } catch {
      // If we can parse the stored payload but not the remaining count,
      // still return the payload — the remaining line is decorative.
      // If JSON.parse itself throws, that's DB corruption → pattern γ.
      try {
        return NextResponse.json(JSON.parse(dedupHit))
      } catch {
        return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 })
      }
    }
  }

  if (capHit) {
    // burst_limit → 429; daily_limit → 429; global_limit → 503.
    // Remaining is included on user-caps to power the modal's counter;
    // global_limit is a platform-wide state, so we omit remaining.
    const status = CAP_HTTP_STATUS[capHit]
    if (capHit === 'global_limit') {
      return NextResponse.json({ error: capHit }, { status })
    }
    try {
      const remaining = await remainingDailyForUser(userId, surface)
      return NextResponse.json({ error: capHit, remaining }, { status })
    } catch {
      return NextResponse.json({ error: capHit }, { status })
    }
  }

  const dbFetch = async () =>
    Promise.all([
      prisma.user.findUnique({
        where: { id: attendeeId },
        select: {
          id: true,
          name: true,
          bio: true,
          jobTitle: true,
          company: true,
          role: true,
          sponsorId: true,
          solutionsOffering: true,
          solutionsSeeking: true,
        },
      }),
      prisma.sponsor.findUnique({
        where: { id: sponsorIdNarrowed },
        select: {
          name: true,
          tagline: true,
          description: true,
          solutionsOffering: true,
          solutionsSeeking: true,
          targetIndustries: true,
        },
      }),
    ])

  let attendeeRow: Awaited<ReturnType<typeof dbFetch>>[0]
  let sponsorRow: Awaited<ReturnType<typeof dbFetch>>[1]
  try {
    ;[attendeeRow, sponsorRow] = await dbFetch()
  } catch (err: any) {
    console.error('[draft-intro] DB fetch failed', err?.message ?? err)
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 })
  }

  if (!attendeeRow) {
    return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
  }
  if (attendeeRow.role !== 'ATTENDEE' && attendeeRow.role !== 'SPEAKER') {
    return NextResponse.json({ error: 'Target is not an attendee' }, { status: 400 })
  }
  if (attendeeRow.sponsorId) {
    // Sponsors cannot AI-draft intros to other sponsors' users via this
    // surface — matches the RecommendedAttendees filter.
    return NextResponse.json({ error: 'Target is a sponsor user' }, { status: 400 })
  }
  if (!sponsorRow) {
    return NextResponse.json({ error: 'Sponsor not found' }, { status: 404 })
  }

  const attendeeTags = [
    ...new Set([
      ...parseArr(attendeeRow.solutionsSeeking),
      ...parseArr(attendeeRow.solutionsOffering),
    ]),
  ]
  const sponsorSignals = [
    ...parseArr(sponsorRow.solutionsOffering),
    ...parseArr(sponsorRow.solutionsSeeking),
    ...parseArr(sponsorRow.targetIndustries),
  ]
  // Dedup matched tags to stay consistent with the client's
  // DashboardView.tsx `scoreAttendees()` mapper which applies
  // `[...new Set(matched)]`. A sponsor that lists the same solution
  // in both offering and seeking would otherwise send duplicates into
  // the AI prompt's `matchedSolutions` array — wasting tokens and
  // biasing grounding.
  const matchedTags = [...new Set(sponsorSignals.filter(s => attendeeTags.includes(s)))]

  const attendeeInputs: AttendeeInputs = {
    name: attendeeRow.name,
    bio: attendeeRow.bio,
    jobTitle: attendeeRow.jobTitle,
    company: attendeeRow.company,
    matchedTags,
  }
  const sponsorInputs: SponsorInputs = {
    name: sponsorRow.name,
    tagline: sponsorRow.tagline,
    description: sponsorRow.description,
  }

  // Server-side canDraft gate. The client also gates, but a stale UI
  // could still fire the request; the route is authoritative.
  if (!canDraft({ attendee: attendeeInputs, sponsor: sponsorInputs })) {
    return NextResponse.json({ error: 'insufficient_inputs' }, { status: 400 })
  }

  const { system, user: userPrompt } = buildPrompt({
    attendee: attendeeInputs,
    sponsor: sponsorInputs,
  })

  let aiResult: Awaited<ReturnType<typeof generateText>>
  try {
    aiResult = await generateText({
      model: openai('gpt-4o-mini'),
      output: Output.object({ schema: IntroSchema }),
      system,
      prompt: userPrompt,
      temperature: 0.2,
      maxOutputTokens: 200,
    })
  } catch (err: any) {
    // Pattern γ: on any AI failure (5xx / 429 / Zod validation / stream
    // abort / provider error) the route surfaces a normalized failure
    // so the client can open the modal with an empty editable textarea
    // and the "⚠ AI draft unavailable" banner. No retry.
    console.error('[draft-intro] AI failure', err?.message ?? err)
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 })
  }

  const output = aiResult.output
  const costEstimateUsd = estimateCostUsd(aiResult.usage ?? {})

  try {
    // ─ 3. Write AiCallLog row (race-safe) ───────────────────────────
    // On concurrent same-key requests the unique constraint on
    // (userId, attendeeId, idempotencyKey) makes one INSERT win; the
    // loser falls back to SELECT the winner's row *only if that row is
    // still within its 5s dedup window*. Both callers converge on the
    // same response body — critical for the client's "double-click
    // generates one intro" contract.
    const { responsePayload } = await insertOrDedup({
      userId,
      attendeeId,
      idempotencyKey,
      surface,
      costEstimateUsd,
      responsePayload: JSON.stringify(output),
    })

    // Race-loser returns the winner's stored payload — parse it back
    // to an object so `NextResponse.json` serializes cleanly (a stringy
    // payload would land as a double-encoded JSON string on the wire).
    const payloadObj = JSON.parse(responsePayload)
    const remaining = await remainingDailyForUser(userId, surface)
    return NextResponse.json({ ...payloadObj, remaining })
  } catch (err: any) {
    // Post-AI DB failure — either the audit insert threw a non-P2002
    // error, OR an expired same-key collision (winner row exists but
    // is outside its dedup window; returning it would double-serve
    // stale content). Either way, the "every successful AI call is
    // logged" AC forbids returning 200 without a written row, so we
    // normalize to pattern γ 502 `ai_unavailable`. The AI-token spend
    // is lost silently on this path — accepted trade-off. Should be
    // rare (the same DB was reachable a few hundred ms ago for the
    // cap check).
    console.error('[draft-intro] audit write failed', err?.message ?? err)
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 })
  }
}
