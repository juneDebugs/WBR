export const revalidate = 120
import { prisma } from '@conference/db'
import { unstable_cache } from 'next/cache'
import { AdminHeader } from '@/components/AdminHeader'
import { SponsorLogo } from '@/components/SponsorLogo'
import { TimeBlockSearch } from '@/components/TimeBlockSearch'
import { TimeBlockGroup } from '@/components/TimeBlockGroup'
import { format } from 'date-fns'
import { permissionDenied } from '@/lib/require-permission'

import Link from 'next/link'
const ROLE_STYLES: Record<string, string> = {
  ATTENDEE: 'bg-brand-50 text-brand-700',
  SPEAKER:  'bg-brand-100 text-brand-800',
  SPONSOR:  'bg-warning-soft text-warning-ink',
  STAFF:    'bg-success-soft text-success-ink',
}

const TIER_STYLES: Record<string, string> = {
  PLATINUM: 'bg-fill-2 text-ink',
  GOLD:     'bg-warning-soft text-warning-ink',
  SILVER:   'bg-fill text-ink-2',
  BRONZE:   'bg-danger-soft text-danger-ink',
}

const getCachedTimeBlocksData = unstable_cache(
  async () => {
    const [users, sponsors, totalTimeBlocks] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ['ATTENDEE', 'SPEAKER', 'STAFF'] } },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          company: true,
          meetingsAsA: {
            select: { timeBlock: { select: { id: true, startsAt: true, endsAt: true, location: true } } },
            orderBy: { timeBlock: { startsAt: 'asc' } },
          },
          meetingsAsB: {
            select: { timeBlock: { select: { id: true, startsAt: true, endsAt: true, location: true } } },
            orderBy: { timeBlock: { startsAt: 'asc' } },
          },
          blackoutTimes: {
            select: { id: true, startsAt: true, endsAt: true, reason: true },
            orderBy: { startsAt: 'asc' },
          },
        },
      }),
      prisma.sponsor.findMany({
        orderBy: [{ tier: 'asc' }, { name: 'asc' }],
        include: {
          users: { select: { id: true, name: true } },
          meetings: {
            include: { timeBlock: true, user: { select: { id: true, name: true, email: true } } },
            orderBy: { timeBlock: { startsAt: 'asc' } },
          },
        },
      }),
      prisma.timeBlock.count(),
    ])
    return [users, sponsors, totalTimeBlocks] as const
  },
  ['web-time-blocks-data'],
  { revalidate: 120, tags: ['time-blocks', 'meetings', 'users'] },
)

export default async function TimeBlocksPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const denied = await permissionDenied('timeBlocks', 'Time Blocks')
  if (denied) return denied

  const params = await searchParams
  const q = params.q?.toLowerCase().trim() ?? ''

  const [users, sponsors, totalTimeBlocks] = await getCachedTimeBlocksData()

  const filteredUsers = q
    ? users.filter(u =>
        (u.name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.company ?? '').toLowerCase().includes(q)
      )
    : users

  const filteredSponsors = q
    ? sponsors.filter(s => s.name.toLowerCase().includes(q) || s.tier.toLowerCase().includes(q))
    : sponsors

  const grouped = {
    SPEAKER:  filteredUsers.filter(u => u.role === 'SPEAKER'),
    ATTENDEE: filteredUsers.filter(u => u.role === 'ATTENDEE'),
    STAFF:    filteredUsers.filter(u => u.role === 'STAFF'),
  }

  const sections = [
    { label: 'Speakers',  role: 'SPEAKER',  people: grouped.SPEAKER },
    { label: 'Attendees', role: 'ATTENDEE', people: grouped.ATTENDEE },
    { label: 'Staff',     role: 'STAFF',    people: grouped.STAFF },
  ].filter(s => s.people.length > 0)

  return (
    <>
      <AdminHeader title="Time Blocks" />
      <main className="flex-1 p-6 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <TimeBlockSearch defaultQuery={q} />
          <Link href="/dashboard/time-blocks/new" className="btn-primary text-sm whitespace-nowrap">
            + New Time Block
          </Link>
        </div>

        <div className="space-y-8">

          {/* ── Sponsors ── */}
          {filteredSponsors.length > 0 && (
            <TimeBlockGroup label="Sponsors" count={filteredSponsors.length} badgeClass="bg-warning-soft text-warning-ink">
              {filteredSponsors.map(sponsor => (
                  <div key={sponsor.id} className="bg-white border border-hairline rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline bg-fill">
                      <div className="w-8 h-8 rounded-lg bg-white border border-hairline flex items-center justify-center overflow-hidden flex-shrink-0">
                        <SponsorLogo name={sponsor.name} logoUrl={sponsor.logoUrl} className="w-full h-full object-contain p-0.5" fallbackClassName="text-ink-2 font-bold text-xs" />
                      </div>
                      <p className="font-semibold text-ink text-sm">{sponsor.name}</p>
                      <span className={`ml-1 text-caption font-bold px-2 py-0.5 rounded-full ${TIER_STYLES[sponsor.tier]}`}>
                        {sponsor.tier}
                      </span>
                      <Link href={`/dashboard/sponsors/${sponsor.id}`} className="ml-auto text-xs text-primary hover:underline">
                        Manage
                      </Link>
                    </div>
                    {sponsor.meetings.length === 0 ? (
                      <p className="text-xs text-ink-2 px-4 py-3 italic">No meetings scheduled</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="border-b border-hairline">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-ink-2">Sponsor Rep</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-ink-2">Attendee</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-ink-2">Time</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-ink-2">Location</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                          {sponsor.meetings.map(m => {
                            const rep = sponsor.users.find((u: any) => u.id === m.repId)
                            return (
                              <tr key={m.id} className="hover:bg-fill">
                                <td className="px-4 py-2.5 text-primary font-medium text-xs">{rep?.name ?? '—'}</td>
                                <td className="px-4 py-2.5 text-ink font-medium">{m.user.name ?? m.user.email ?? '—'}</td>
                                <td className="px-4 py-2.5 text-ink-2 whitespace-nowrap text-xs">
                                  {format(m.timeBlock.startsAt, 'EEE MMM d, h:mm a')} – {format(m.timeBlock.endsAt, 'h:mm a')}
                                </td>
                                <td className="px-4 py-2.5 text-ink-2 text-xs">{m.timeBlock.location ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
            </TimeBlockGroup>
          )}

          {/* ── Users by role ── */}
          {sections.map(({ label, role, people }) => (
            <TimeBlockGroup key={role} label={label} count={people.length} badgeClass={ROLE_STYLES[role]}>
              {people.map(user => {
                  const allMeetings = [
                    ...user.meetingsAsA.map(m => ({ ...m.timeBlock, note: 'Meeting', partner: null })),
                    ...user.meetingsAsB.map(m => ({ ...m.timeBlock, note: 'Meeting', partner: null })),
                  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

                  const totalItems = allMeetings.length + user.blackoutTimes.length

                  return (
                    <div key={user.id} className="bg-white border border-hairline rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline bg-fill">
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-fill-2 flex items-center justify-center flex-shrink-0">
                          {user.image ? (
                            <img src={user.image} alt={user.name ?? ''} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-ink-2 text-xs font-bold">{(user.name ?? '?')[0]}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-ink text-sm">{user.name ?? '—'}</p>
                          {user.email && <p className="text-xs text-ink-2">{user.email}</p>}
                        </div>
                        <Link href={`/dashboard/attendees/${user.id}`} className="ml-auto text-xs text-primary hover:underline">
                          Profile
                        </Link>
                      </div>
                      {totalItems === 0 ? (
                        <p className="text-xs text-ink-2 px-4 py-3 italic">No time blocks assigned</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="border-b border-hairline">
                            <tr>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-ink-2">Type</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-ink-2">Time</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-ink-2">Location / Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-hairline">
                            {allMeetings.map(tb => (
                              <tr key={tb.id} className="hover:bg-fill">
                                <td className="px-4 py-2.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-semibold bg-brand-50 text-brand-700">Meeting</span>
                                </td>
                                <td className="px-4 py-2.5 text-ink-2 whitespace-nowrap text-xs">
                                  {format(tb.startsAt, 'EEE MMM d, h:mm a')} – {format(tb.endsAt, 'h:mm a')}
                                </td>
                                <td className="px-4 py-2.5 text-ink-2 text-xs">{tb.location ?? '—'}</td>
                              </tr>
                            ))}
                            {user.blackoutTimes.map(bt => (
                              <tr key={bt.id} className="hover:bg-fill">
                                <td className="px-4 py-2.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-semibold bg-danger-soft text-danger-ink">Blackout</span>
                                </td>
                                <td className="px-4 py-2.5 text-ink-2 whitespace-nowrap text-xs">
                                  {format(bt.startsAt, 'EEE MMM d, h:mm a')} – {format(bt.endsAt, 'h:mm a')}
                                </td>
                                <td className="px-4 py-2.5 text-ink-2 text-xs">{bt.reason ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
            </TimeBlockGroup>
          ))}

          {sections.length === 0 && filteredSponsors.length === 0 && (
            <div className="bg-white border border-hairline rounded-xl p-12 text-center">
              <p className="font-medium text-ink">{q ? `No results for "${params.q}"` : 'No time blocks assigned yet'}</p>
              <p className="text-sm text-ink-2 mt-1">{q ? 'Try a different name or sponsor.' : 'Create time blocks and assign them via attendee profiles or sponsor meetings.'}</p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
