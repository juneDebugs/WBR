import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { getIndustry } from '@/lib/solutions'

function parseSolutions(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function scoreAttendeeVsSponsor(
  userSeeking: string[], userOffering: string[],
  sponsorOffering: string[], sponsorSeeking: string[],
  userSize: string | null, sponsorSize: string | null,
): { score: number; matched: string[] } {
  const matched: string[] = []
  let raw = 0
  for (const s of userSeeking) {
    if (sponsorOffering.includes(s)) { raw += 3; matched.push(s) }
  }
  for (const s of userOffering) {
    if (sponsorSeeking.includes(s) && !matched.includes(s)) { raw += 2; matched.push(s) }
  }
  if (userSize && sponsorSize && userSize === sponsorSize) raw += 1
  const maxPossible = userSeeking.length * 3 + userOffering.length * 2 + 1
  const score = maxPossible > 0 ? Math.min(100, Math.round((raw / maxPossible) * 100)) : 0
  return { score, matched }
}

function scoreSponsorVsAttendee(
  sponsorSeeking: string[], sponsorOffering: string[],
  userOffering: string[], userSeeking: string[],
  sponsorIndustry: string | null, userIndustry: string | null,
): { score: number; matched: string[] } {
  const matched: string[] = []
  let raw = 0
  for (const s of sponsorSeeking) {
    if (userOffering.includes(s)) { raw += 3; matched.push(s) }
  }
  for (const s of sponsorOffering) {
    if (userSeeking.includes(s) && !matched.includes(s)) { raw += 2; matched.push(s) }
  }
  if (sponsorIndustry && userIndustry && sponsorIndustry === userIndustry) raw += 1
  const maxPossible = sponsorSeeking.length * 3 + sponsorOffering.length * 2 + 1
  const score = maxPossible > 0 ? Math.min(100, Math.round((raw / maxPossible) * 100)) : 0
  return { score, matched }
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json([], { status: 401 })

  const user = session.user as any
  const userId = user.id as string
  const sponsorId = (user.sponsorId ?? null) as string | null
  const isSponsor = !!sponsorId

  if (isSponsor && sponsorId) {
    const [sponsor, allAttendees, alreadyRequestedIds] = await Promise.all([
      prisma.sponsor.findUnique({
        where: { id: sponsorId },
        select: { solutionsSeeking: true, solutionsOffering: true, name: true },
      }),
      prisma.user.findMany({
        where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
        select: {
          id: true, name: true, image: true, company: true, jobTitle: true,
          solutionsOffering: true, solutionsSeeking: true, companySize: true,
        },
        take: 100,
      }),
      prisma.meetingRequest.findMany({
        where: { requesterId: userId, targetUserId: { not: null } },
        select: { targetUserId: true },
      }),
    ])

    const requestedSet = new Set(alreadyRequestedIds.map(r => r.targetUserId).filter(Boolean) as string[])
    const sponsorOffering = parseSolutions(sponsor?.solutionsOffering ?? null)
    const sponsorSeeking = parseSolutions(sponsor?.solutionsSeeking ?? null)
    const sponsorIndustry = getIndustry(sponsor?.name ?? null)

    const recs = allAttendees
      .map(a => {
        const userOffering = parseSolutions(a.solutionsOffering)
        const userSeeking = parseSolutions(a.solutionsSeeking)
        const userIndustry = getIndustry(a.company)
        const { score, matched } = scoreSponsorVsAttendee(sponsorSeeking, sponsorOffering, userOffering, userSeeking, sponsorIndustry, userIndustry)
        return {
          id: a.id, type: 'person' as const, name: a.name ?? 'Unknown',
          logoUrl: a.image, company: a.company, jobTitle: a.jobTitle,
          tier: null, matchScore: score, matchedSolutions: matched,
          alreadyRequested: requestedSet.has(a.id),
        }
      })
      .filter(m => m.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 12)

    return NextResponse.json({
      heading: 'Recommended Attendees',
      subheading: 'People whose offerings & interests align with your solutions',
      matches: recs,
    })
  }

  // Attendee recommendations
  const [profileUser, allSponsors, alreadyRequestedIds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { solutionsSeeking: true, solutionsOffering: true, companySize: true },
    }),
    prisma.sponsor.findMany({
      select: {
        id: true, name: true, logoUrl: true, tier: true,
        solutionsOffering: true, solutionsSeeking: true,
        companySize: true, tagline: true,
      },
      take: 100,
    }),
    prisma.meetingRequest.findMany({
      where: { requesterId: userId, targetSponsorId: { not: null } },
      select: { targetSponsorId: true },
    }),
  ])

  const requestedSet = new Set(alreadyRequestedIds.map(r => r.targetSponsorId).filter(Boolean) as string[])
  const userSeeking = parseSolutions(profileUser?.solutionsSeeking ?? null)
  const userOffering = parseSolutions(profileUser?.solutionsOffering ?? null)

  const recs = allSponsors
    .map(s => {
      const sponsorOffering = parseSolutions(s.solutionsOffering)
      const sponsorSeeking = parseSolutions(s.solutionsSeeking)
      const { score, matched } = scoreAttendeeVsSponsor(
        userSeeking, userOffering, sponsorOffering, sponsorSeeking,
        profileUser?.companySize ?? null, s.companySize ?? null,
      )
      return {
        id: s.id, type: 'sponsor' as const, name: s.name,
        logoUrl: s.logoUrl, company: null, jobTitle: s.tagline ?? null,
        tier: s.tier, matchScore: score, matchedSolutions: matched,
        alreadyRequested: requestedSet.has(s.id),
      }
    })
    .filter(m => m.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 12)

  return NextResponse.json({
    heading: 'Recommended Sponsors',
    subheading: 'Matched to your solutions seeking profile',
    matches: recs,
  })
}
