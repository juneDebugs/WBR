import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { revalidateAttendeeFloorPlan } from '@/lib/revalidate-attendee'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // THE COMPANY LINK IS READ FROM THE DATABASE, NOT FROM THE SESSION TOKEN.
  //
  // This used to be `user.sponsorId` off the session. A token is issued at
  // sign-in and never changes, and this app can move a person between companies
  // while they hold a live session: POST /api/profile/teammates sets another
  // user's sponsorId to the caller's company, and DELETE sets it to null.
  //
  // Measured on 2026-07-31 with the old version, using an account moved from
  // company A to company B mid-session: the onboarding gate correctly read
  // company B from the database and blocked, the checklist rendered company B's
  // missing items, and then this handler WROTE THE ANSWER TO COMPANY A — leaving
  // B untouched, so /dashboard blocked again on the next request. Two failures at
  // once: the representative could never complete onboarding no matter how many
  // times they saved, and their save overwrote a different company's profile.
  //
  // Reading the row costs one indexed lookup and makes this handler agree with
  // the gate and the checklist, which both already read the database. Found by
  // adversarial review, then reproduced before being acted on.
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { sponsorId: true },
  })
  // Fail closed on a missing row for the same reason the gate does: a token whose
  // user row was deleted still decodes, and reseeding deletes thousands of rows.
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!account.sponsorId) return NextResponse.json({ error: 'No sponsor linked' }, { status: 403 })
  const sponsorId = account.sponsorId

  const body = await req.json()

  // ── The booth number is the organizer's, and this address refuses it ────────
  //
  // A company does not choose where the floor sells it a stand. CONTEXT.md has
  // said so since the onboarding work — it is the stated reason the onboarding
  // gate does not block a sponsor on a missing booth number — but until this
  // phase the only text box for the field was in this portal, which is the
  // opposite of what the glossary claimed. The organizer now sets it from the
  // floor plan screen.
  //
  // REFUSED RATHER THAN DROPPED FROM THE ALLOWLIST ALONE. Leaving the key out of
  // the list below would make this handler ignore it silently: the representative
  // types a number, the save reports success, and the value never changes. A
  // refusal that names the reason is the only answer that does not lie.
  //
  // Consequence, stated rather than discovered later: a browser tab left open on
  // the version of this portal that still sent the field will have its next
  // profile save refused until it is reloaded. That is the correct direction to
  // be wrong in — a refusal the person can see and recover from, rather than a
  // save that quietly disagrees with the map a delegate is holding.
  if ('boothNumber' in body) {
    return NextResponse.json(
      { error: 'The booth number is set by the event organizer and cannot be changed here.' },
      { status: 403 },
    )
  }

  const allowed = [
    'name', 'tagline', 'description', 'logoUrl', 'heroImageUrl', 'website',
    'contactName', 'contactEmail', 'contactPhone',
    'companySize', 'annualRevenue', 'founded', 'headquarters',
    'socialLinkedIn', 'socialTwitter',
    'solutionsOffering', 'solutionsSeeking',
    'targetIndustries', 'targetCompanySizes', 'targetRevenues',
  ]

  const data: Record<string, string | null> = {}
  for (const key of allowed) {
    if (key in body) {
      const val = body[key]
      data[key] = Array.isArray(val) ? JSON.stringify(val) : (val ?? null)
    }
  }

  const sponsor = await prisma.sponsor.update({
    where: { id: sponsorId },
    data,
  })

  revalidateTag(`sponsor-${sponsorId}`)

  // Finding F-13. Phase 9 moved this company's tagline, website, logo, booth
  // number and offerings into the participant app's cached map payload, so a
  // representative editing their profile here changes what a delegate sees on
  // the booth card. Without this they saw it at once in this portal while
  // delegates kept the old values for up to five minutes.
  await revalidateAttendeeFloorPlan('sponsor profile PATCH')

  return NextResponse.json(sponsor)
}
