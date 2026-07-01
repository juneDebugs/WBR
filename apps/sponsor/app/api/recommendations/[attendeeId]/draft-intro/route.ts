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

export async function POST(_req: Request, ctx: { params: Promise<{ attendeeId: string }> }) {
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

  // Any error from here through the AI call routes to the same
  // pattern-γ 502 the client's IntroDraftModal expects. Prisma errors
  // (DB down), malformed JSON downstream, and AI failures all surface
  // as `{ error: 'ai_unavailable' }` with a normalized 502 status —
  // the modal opens with an empty editable textarea + the AI-draft-
  // unavailable banner regardless of which stage failed. This keeps
  // the client's failure contract simple (any non-2xx = pattern γ) and
  // prevents uncontrolled 5xx pages from leaking through.
  // Local capture so the closure below sees the narrowed non-null
  // string type (TypeScript narrowing from `if (!user.sponsorId)`
  // doesn't propagate into a nested arrow function scope).
  const sponsorIdNarrowed: string = user.sponsorId
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

  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      output: Output.object({ schema: IntroSchema }),
      system,
      prompt: userPrompt,
      temperature: 0.2,
      maxOutputTokens: 200,
    })

    // AI SDK v7 returns the structured object on result.output when an
    // output specification is provided. Zod validation happens inside
    // the SDK; a validation failure throws before we get here.
    return NextResponse.json(result.output)
  } catch (err: any) {
    // Pattern γ: on any AI failure (5xx / 429 / Zod validation / stream
    // abort / provider error) the route surfaces a normalized failure
    // so the client can open the modal with an empty editable textarea
    // and the "⚠ AI draft unavailable" banner. No retry.
    console.error('[draft-intro] AI failure', err?.message ?? err)
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 })
  }
}
