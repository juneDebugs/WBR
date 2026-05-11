import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { OverviewClient } from '@/components/OverviewClient'

const CHECKLIST = [
  { key: 'logo',        check: (s: any) => !!s.logoUrl },
  { key: 'tagline',     check: (s: any) => !!s.tagline },
  { key: 'description', check: (s: any) => !!s.description && s.description.length > 20 },
  { key: 'contact',     check: (s: any) => !!s.contactName && !!s.contactEmail },
  { key: 'booth',       check: (s: any) => !!s.boothNumber },
  { key: 'solutions',   check: (s: any) => { try { return JSON.parse(s.solutionsOffering || '[]').length > 0 } catch { return false } } },
  { key: 'teammates',   check: (s: any) => s._count.users > 0 },
  { key: 'meetings',    check: (s: any) => s._count.meetings > 0 },
  { key: 'website',     check: (s: any) => !!s.website },
  { key: 'social',      check: (s: any) => !!s.socialLinkedIn || !!s.socialTwitter },
]
const LABELS: Record<string, string> = { logo: 'Logo uploaded', tagline: 'Tagline', description: 'Description', contact: 'Contact info', booth: 'Booth number', solutions: 'Solutions listed', teammates: 'Team assigned', meetings: 'Meeting slots', website: 'Website', social: 'Social links' }
const TIER_ORDER: Record<string, number> = { PLATINUM: 0, GOLD: 1, SILVER: 2, BRONZE: 3 }

const getCachedDashboardData = unstable_cache(
  async () => {
    const [sessionCount, speakerCount, pendingMeetings, attendeeCount, conference, sponsors] = await Promise.all([
      prisma.confSession.count(),
      prisma.speaker.count(),
      prisma.meeting.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { role: 'ATTENDEE' } }),
      prisma.conference.findFirst({ where: { active: true } }),
      prisma.sponsor.findMany({
        select: {
          id: true, name: true, tier: true, logoUrl: true,
          contactEmail: true, contactName: true, tagline: true,
          description: true, boothNumber: true, website: true,
          solutionsOffering: true, socialLinkedIn: true, socialTwitter: true,
          _count: { select: { users: true, meetings: true } },
        },
      }),
    ])
    const sorted = [...sponsors].sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || a.name.localeCompare(b.name))
    const withScores = sorted.map(s => {
      const results = CHECKLIST.map(item => ({ key: item.key, label: LABELS[item.key], done: item.check(s) }))
      const done = results.filter(r => r.done).length
      const pct = Math.round((done / CHECKLIST.length) * 100)
      return { id: s.id, name: s.name, tier: s.tier, logoUrl: s.logoUrl, contactEmail: s.contactEmail, contactName: s.contactName, results, done, pct, total: CHECKLIST.length }
    })
    const totalSponsors = withScores.length
    const avgPct = Math.round(withScores.reduce((sum, s) => sum + s.pct, 0) / (totalSponsors || 1))
    const missingCounts: Record<string, number> = {}
    for (const { results } of withScores) { for (const r of results) { if (!r.done) missingCounts[r.label] = (missingCounts[r.label] ?? 0) + 1 } }
    const topMissing = Object.entries(missingCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count, pct: Math.round((count / totalSponsors) * 100) }))
    const tierBreakdown = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'].map(tier => {
      const group = withScores.filter(s => s.tier === tier)
      return { tier, count: group.length, avg: group.length ? Math.round(group.reduce((sum, s) => sum + s.pct, 0) / group.length) : 0 }
    }).filter(t => t.count > 0)
    return {
      sessionCount, speakerCount, pendingMeetings, attendeeCount,
      conference: conference ? { id: conference.id, name: conference.name, venue: conference.venue, startDate: conference.startDate.toISOString(), endDate: conference.endDate.toISOString() } : null,
      sponsorReadiness: { sponsors: withScores, metrics: { totalSponsors, avgPct, fullyReady: withScores.filter(s => s.pct === 100).length, inProgress: withScores.filter(s => s.pct > 0 && s.pct < 100).length, notStarted: withScores.filter(s => s.pct === 0).length, topMissing, tierBreakdown } },
    }
  },
  ['web-dashboard-stats'],
  { revalidate: 120, tags: ['sessions', 'speakers', 'meetings', 'attendees', 'sponsors'] },
)

export default async function DashboardPage() {
  const data = await getCachedDashboardData()
  return (
    <>
      <AdminHeader title="Overview" />
      <main className="flex-1 p-6">
        <OverviewClient initialData={data} />
      </main>
    </>
  )
}
