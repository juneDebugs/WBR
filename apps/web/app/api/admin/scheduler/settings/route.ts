import { NextResponse } from 'next/server'
import { prisma, getMeetingRequirementSettings, saveMeetingRequirementSettings } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Meeting-requirement settings for the admin Companies scheduler tab.
//   GET → { attendeeRequired, sponsorDefaultRequired, sponsorOverrides, sponsors }
//   PUT → save the provided slices (diff-only body), respond with a fresh GET view
// The sponsor list rides along so the Settings panel renders the per-company
// override rows without a second request. logoUrl may be a base64 data URI
// (ADR 0004) — the directory route already ships the same strings.
async function settingsView() {
  // Same conference scoping as getCompanyDirectory (active conference,
  // falling back to conf-2025), so this roster always matches the directory.
  const active = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const [settings, sponsors] = await Promise.all([
    getMeetingRequirementSettings(prisma),
    prisma.sponsor.findMany({
      where: { conferenceId: active?.id ?? 'conf-2025' },
      select: { id: true, name: true, logoUrl: true, tier: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return { ...settings, sponsors }
}

export async function GET() {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    return NextResponse.json(await settingsView())
  } catch (err) {
    return engineErrorResponse(err)
  }
}

export async function PUT(req: Request) {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 })
  }

  const { attendeeRequired, sponsorDefaultRequired, sponsorOverrides } = body as {
    attendeeRequired?: unknown
    sponsorDefaultRequired?: unknown
    sponsorOverrides?: unknown
  }
  if (attendeeRequired !== undefined && typeof attendeeRequired !== 'number') {
    return NextResponse.json({ error: 'attendeeRequired must be a number' }, { status: 400 })
  }
  if (sponsorDefaultRequired !== undefined && typeof sponsorDefaultRequired !== 'number') {
    return NextResponse.json({ error: 'sponsorDefaultRequired must be a number' }, { status: 400 })
  }
  if (
    sponsorOverrides !== undefined &&
    !(
      Array.isArray(sponsorOverrides) &&
      sponsorOverrides.every(
        (o: any) =>
          o &&
          typeof o.sponsorId === 'string' &&
          o.sponsorId &&
          (o.required === null || typeof o.required === 'number'),
      )
    )
  ) {
    return NextResponse.json(
      { error: 'sponsorOverrides must be an array of { sponsorId, required }' },
      { status: 400 },
    )
  }

  try {
    await saveMeetingRequirementSettings(prisma, {
      attendeeRequired: attendeeRequired as number | undefined,
      sponsorDefaultRequired: sponsorDefaultRequired as number | undefined,
      sponsorOverrides: sponsorOverrides as { sponsorId: string; required: number | null }[] | undefined,
    })
    return NextResponse.json(await settingsView())
  } catch (err) {
    return engineErrorResponse(err)
  }
}
