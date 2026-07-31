import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
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

  const allowed = [
    'name', 'tagline', 'description', 'logoUrl', 'heroImageUrl', 'website',
    'contactName', 'contactEmail', 'contactPhone',
    'companySize', 'annualRevenue', 'founded', 'headquarters', 'boothNumber',
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

  return NextResponse.json(sponsor)
}
