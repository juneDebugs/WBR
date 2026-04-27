import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { SponsorLogo } from '@/components/SponsorLogo'
import { SponsorRemindButton } from '@/components/SponsorRemindButton'
import Link from 'next/link'

const TIER_STYLES: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700 border border-slate-300',
  GOLD:     'bg-amber-100 text-amber-700 border border-amber-300',
  SILVER:   'bg-gray-100 text-gray-600 border border-gray-300',
  BRONZE:   'bg-orange-100 text-orange-700 border border-orange-300',
}

const CHECKLIST = [
  { key: 'logo',        label: 'Logo',        check: (s: any) => !!s.logoUrl },
  { key: 'tagline',     label: 'Tagline',      check: (s: any) => !!s.tagline },
  { key: 'description', label: 'Description',  check: (s: any) => !!s.description && s.description.length > 20 },
  { key: 'contact',     label: 'Contact info', check: (s: any) => !!s.contactName && !!s.contactEmail },
  { key: 'booth',       label: 'Booth #',      check: (s: any) => !!s.boothNumber },
  { key: 'solutions',   label: 'Solutions',    check: (s: any) => { try { return JSON.parse(s.solutionsOffering || '[]').length > 0 } catch { return false } } },
  { key: 'teammates',   label: 'Team',         check: (s: any) => s._count.users > 0 },
  { key: 'website',     label: 'Website',      check: (s: any) => !!s.website },
  { key: 'social',      label: 'Social links', check: (s: any) => !!s.socialLinkedIn || !!s.socialTwitter },
]

const TIER_ORDER: Record<string, number> = { PLATINUM: 0, GOLD: 1, SILVER: 2, BRONZE: 3 }
const TIER_LIST = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE']

// Shared table header cell
function TH({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${className}`}>
      {children}
    </th>
  )
}

// Shared sponsor name + logo cell
function SponsorCell({ name, logoUrl, website }: { name: string; logoUrl: string | null; website: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
        <SponsorLogo
          name={name}
          logoUrl={logoUrl}
          className="w-full h-full object-contain p-1"
          fallbackClassName="text-gray-500 font-bold text-sm"
        />
      </div>
      <div className="min-w-0">
        <p className="font-medium text-gray-900 truncate">{name}</p>
        {website && (
          <a href={website} target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline truncate block">{website}</a>
        )}
      </div>
    </div>
  )
}

// Shared contact cell
function ContactCell({ contactName, contactEmail }: { contactName: string | null; contactEmail: string | null }) {
  if (!contactName && !contactEmail) return <span className="text-gray-400">—</span>
  return (
    <>
      {contactName && <p className="font-medium text-gray-900">{contactName}</p>}
      {contactEmail && <p className="text-xs text-gray-400 mt-0.5">{contactEmail}</p>}
    </>
  )
}

// Tier group header
function TierHeader({ tier, count }: { tier: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${TIER_STYLES[tier]}`}>
        {tier}
      </span>
      <span className="text-xs text-gray-400">{count} sponsor{count !== 1 ? 's' : ''}</span>
    </div>
  )
}

export default async function SponsorsPage() {
  const [sponsors, committedRows] = await Promise.all([
    prisma.sponsor.findMany({
      include: { _count: { select: { meetings: true, users: true } } },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    }),
    prisma.sponsorMeeting.groupBy({
      by: ['sponsorId'],
      where: { status: 'CONFIRMED' },
      _count: { _all: true },
    }),
  ])

  const committedMap = new Map(committedRows.map(r => [r.sponsorId, r._count._all]))

  const withReadiness = [...sponsors]
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || a.name.localeCompare(b.name))
    .map(s => {
      const results = CHECKLIST.map(item => ({ key: item.key, label: item.label, done: item.check(s) }))
      const done = results.filter(r => r.done).length
      const pct = Math.round((done / CHECKLIST.length) * 100)
      return { ...s, pct, missing: results.filter(r => !r.done).map(r => r.label) }
    })

  const grouped = TIER_LIST.map(tier => ({
    tier,
    sponsors: sponsors
      .filter(s => s.tier === tier)
      .map(s => ({ ...s, committed: committedMap.get(s.id) ?? 0 })),
  })).filter(g => g.sponsors.length > 0)

  return (
    <>
      <AdminHeader title="Sponsors" />
      <main className="flex-1 p-6 space-y-10">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{sponsors.length} sponsors total</p>
          <Link href="/dashboard/sponsors/new" className="btn-primary text-sm">+ New Sponsor</Link>
        </div>

        {/* ── Section 1: Profile Onboarding ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Profile Onboarding</h2>
            <p className="text-sm text-gray-500 mt-0.5">Track what each sponsor still needs to complete before the event.</p>
          </div>

          {sponsors.length === 0 ? (
            <p className="text-sm text-gray-400">No sponsors yet.</p>
          ) : (
            <div className="space-y-6">
              {TIER_LIST.map(tier => {
                const tierSponsors = withReadiness.filter(s => s.tier === tier)
                if (!tierSponsors.length) return null
                return (
                  <div key={tier}>
                    <TierHeader tier={tier} count={tierSponsors.length} />
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: '22%' }}>Sponsor</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: '18%' }}>Contact</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: '140px' }}>Completion</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: '180px' }}>Missing</th>
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center" style={{ width: '120px' }}>Remind</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: '80px' }}>Manage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {tierSponsors.map(s => (
                            <tr key={s.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <SponsorCell name={s.name} logoUrl={s.logoUrl} website={s.website} />
                              </td>
                              <td className="px-4 py-3">
                                <ContactCell contactName={s.contactName} contactEmail={s.contactEmail} />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{
                                      width: `${s.pct}%`,
                                      background: s.pct === 100 ? '#10b981' : s.pct >= 60 ? '#f59e0b' : '#f43f5e',
                                    }} />
                                  </div>
                                  <span className={`text-xs font-semibold tabular-nums w-8 text-right ${
                                    s.pct === 100 ? 'text-emerald-600' : s.pct >= 60 ? 'text-amber-600' : 'text-rose-500'
                                  }`}>{s.pct}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {s.missing.length === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    Complete
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {s.missing.map(label => (
                                      <span key={label} className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[10px] font-medium border border-rose-100">
                                        {label}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <SponsorRemindButton
                                  sponsorId={s.id}
                                  sponsorName={s.name}
                                  contactEmail={s.contactEmail}
                                  missingCount={s.missing.length}
                                />
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <Link href={`/dashboard/sponsors/${s.id}`} className="text-primary hover:underline text-xs font-medium">
                                  Manage
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Section 2: Meetings ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Meetings</h2>
            <p className="text-sm text-gray-500 mt-0.5">Meetings scheduled per sponsor, grouped by tier.</p>
          </div>

          {sponsors.length === 0 ? (
            <p className="text-sm text-gray-400">No sponsors yet.</p>
          ) : (
            <div className="space-y-6">
              {grouped.map(({ tier, sponsors: tierSponsors }) => (
                <div key={tier}>
                  <TierHeader tier={tier} count={tierSponsors.length} />
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '100px' }} />
                        <col style={{ width: '140px' }} />
                        <col style={{ width: '80px' }} />
                      </colgroup>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <TH>Sponsor</TH>
                          <TH>Contact</TH>
                          <TH>Scheduled</TH>
                          <TH>Committed</TH>
                          <th />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {tierSponsors.map(s => {
                          const ratio = s._count.meetings > 0 ? s.committed / s._count.meetings : 0
                          const fracColor = s._count.meetings === 0 ? '#9ca3af' : ratio >= 0.8 ? '#16a34a' : ratio >= 0.5 ? '#d97706' : '#dc2626'
                          return (
                            <tr key={s.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <SponsorCell name={s.name} logoUrl={s.logoUrl} website={s.website} />
                              </td>
                              <td className="px-4 py-3">
                                <ContactCell contactName={s.contactName} contactEmail={s.contactEmail} />
                              </td>
                              <td className="px-4 py-3">
                                <span className={`font-semibold ${s._count.meetings > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                  {s._count.meetings}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-gray-100">
                                  <span className="text-gray-400 font-normal">1-1</span>
                                  <span className="font-bold" style={{ color: fracColor }}>{s.committed}/{s._count.meetings}</span>
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <Link href={`/dashboard/sponsors/${s.id}`} className="text-primary hover:underline text-xs font-medium">
                                  Manage
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </>
  )
}
