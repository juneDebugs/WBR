import { prisma } from '@conference/db'
import { SponsorReadinessClient } from './SponsorReadinessClient'

const CHECKLIST = [
  { key: 'logo',        label: 'Logo uploaded',          check: (s: any) => !!s.logoUrl },
  { key: 'tagline',     label: 'Tagline',                check: (s: any) => !!s.tagline },
  { key: 'description', label: 'Description',            check: (s: any) => !!s.description && s.description.length > 20 },
  { key: 'contact',     label: 'Contact info',           check: (s: any) => !!s.contactName && !!s.contactEmail },
  { key: 'booth',       label: 'Booth number',           check: (s: any) => !!s.boothNumber },
  { key: 'solutions',   label: 'Solutions listed',       check: (s: any) => { try { return JSON.parse(s.solutionsOffering || '[]').length > 0 } catch { return false } } },
  { key: 'teammates',   label: 'Team assigned',          check: (s: any) => s._count.users > 0 },
  { key: 'meetings',    label: 'Meeting slots',          check: (s: any) => s._count.meetings > 0 },
  { key: 'website',     label: 'Website',                check: (s: any) => !!s.website },
  { key: 'social',      label: 'Social links',           check: (s: any) => !!s.socialLinkedIn || !!s.socialTwitter },
]

const TIER_ORDER: Record<string, number> = { PLATINUM: 0, GOLD: 1, SILVER: 2, BRONZE: 3 }

export async function SponsorReadinessWidget() {
  const sponsors = await prisma.sponsor.findMany({
    select: {
      id: true, name: true, tier: true, logoUrl: true,
      contactEmail: true, contactName: true, tagline: true,
      description: true, boothNumber: true, website: true,
      solutionsOffering: true, socialLinkedIn: true, socialTwitter: true,
      _count: { select: { users: true, meetings: true } },
    },
  })

  const sorted = [...sponsors].sort((a, b) =>
    (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || a.name.localeCompare(b.name)
  )

  const withScores = sorted.map(s => {
    const results = CHECKLIST.map(item => ({ key: item.key, label: item.label, done: item.check(s) }))
    const done = results.filter(r => r.done).length
    const pct = Math.round((done / CHECKLIST.length) * 100)
    return {
      id: s.id,
      name: s.name,
      tier: s.tier,
      logoUrl: s.logoUrl,
      contactEmail: s.contactEmail,
      contactName: s.contactName,
      results,
      done,
      pct,
      total: CHECKLIST.length,
    }
  })

  // Aggregate metrics
  const totalSponsors = withScores.length
  const avgPct = Math.round(withScores.reduce((sum, s) => sum + s.pct, 0) / (totalSponsors || 1))
  const fullyReady = withScores.filter(s => s.pct === 100).length
  const inProgress = withScores.filter(s => s.pct > 0 && s.pct < 100).length
  const notStarted = withScores.filter(s => s.pct === 0).length

  const missingCounts: Record<string, number> = {}
  for (const { results } of withScores) {
    for (const r of results) {
      if (!r.done) missingCounts[r.label] = (missingCounts[r.label] ?? 0) + 1
    }
  }
  const topMissing = Object.entries(missingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count, pct: Math.round((count / totalSponsors) * 100) }))

  const tierBreakdown = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'].map(tier => {
    const group = withScores.filter(s => s.tier === tier)
    const avg = group.length ? Math.round(group.reduce((sum, s) => sum + s.pct, 0) / group.length) : 0
    return { tier, count: group.length, avg }
  }).filter(t => t.count > 0)

  return (
    <SponsorReadinessClient
      sponsors={withScores}
      metrics={{ totalSponsors, avgPct, fullyReady, inProgress, notStarted, topMissing, tierBreakdown }}
    />
  )
}
