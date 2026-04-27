export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { SponsorLogo } from '@/components/SponsorLogo'
import { TimeBlockSearch } from '@/components/TimeBlockSearch'
import { TimeBlockGroup } from '@/components/TimeBlockGroup'
import { format } from 'date-fns'
import Link from 'next/link'
import { Suspense } from 'react'

const ROLE_STYLES: Record<string, string> = {
  ATTENDEE: 'bg-blue-100 text-blue-700',
  SPEAKER:  'bg-purple-100 text-purple-700',
  SPONSOR:  'bg-amber-100 text-amber-700',
  STAFF:    'bg-green-100 text-green-700',
}

const TIER_STYLES: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700',
  GOLD:     'bg-amber-100 text-amber-700',
  SILVER:   'bg-gray-100 text-gray-600',
  BRONZE:   'bg-orange-100 text-orange-700',
}

export default async function TimeBlocksPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.toLowerCase().trim() ?? ''

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
          <Suspense>
            <TimeBlockSearch />
          </Suspense>
          <Link href="/dashboard/time-blocks/new" className="btn-primary text-sm whitespace-nowrap">
            + New Time Block
          </Link>
        </div>

        <div className="space-y-8">

          {/* ── Sponsors ── */}
          {filteredSponsors.length > 0 && (
            <TimeBlockGroup label="Sponsors" count={filteredSponsors.length} badgeClass="bg-amber-100 text-amber-700">
              {filteredSponsors.map(sponsor => (
                  <div key={sponsor.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        <SponsorLogo name={sponsor.name} logoUrl={sponsor.logoUrl} className="w-full h-full object-contain p-0.5" fallbackClassName="text-gray-500 font-bold text-xs" />
                      </div>
                      <p className="font-semibold text-gray-900 text-sm">{sponsor.name}</p>
                      <span className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${TIER_STYLES[sponsor.tier]}`}>
                        {sponsor.tier}
                      </span>
                      <Link href={`/dashboard/sponsors/${sponsor.id}`} className="ml-auto text-xs text-primary hover:underline">
                        Manage
                      </Link>
                    </div>
                    {sponsor.meetings.length === 0 ? (
                      <p className="text-xs text-gray-400 px-4 py-3 italic">No meetings scheduled</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-100">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Sponsor Rep</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Attendee</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Time</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Location</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sponsor.meetings.map(m => {
                            const rep = sponsor.users.find((u: any) => u.id === m.repId)
                            return (
                              <tr key={m.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-primary font-medium text-xs">{rep?.name ?? '—'}</td>
                                <td className="px-4 py-2.5 text-gray-900 font-medium">{m.user.name ?? m.user.email ?? '—'}</td>
                                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                                  {format(m.timeBlock.startsAt, 'EEE MMM d, h:mm a')} – {format(m.timeBlock.endsAt, 'h:mm a')}
                                </td>
                                <td className="px-4 py-2.5 text-gray-400 text-xs">{m.timeBlock.location ?? '—'}</td>
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
                    <div key={user.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
                          {user.image ? (
                            <img src={user.image} alt={user.name ?? ''} width={32} height={32} loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-gray-500 text-xs font-bold">{(user.name ?? '?')[0]}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{user.name ?? '—'}</p>
                          {user.email && <p className="text-xs text-gray-400">{user.email}</p>}
                        </div>
                        <Link href={`/dashboard/attendees/${user.id}`} className="ml-auto text-xs text-primary hover:underline">
                          Profile
                        </Link>
                      </div>
                      {totalItems === 0 ? (
                        <p className="text-xs text-gray-400 px-4 py-3 italic">No time blocks assigned</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="border-b border-gray-100">
                            <tr>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Type</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Time</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Location / Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {allMeetings.map(tb => (
                              <tr key={tb.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600">Meeting</span>
                                </td>
                                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                                  {format(tb.startsAt, 'EEE MMM d, h:mm a')} – {format(tb.endsAt, 'h:mm a')}
                                </td>
                                <td className="px-4 py-2.5 text-gray-400 text-xs">{tb.location ?? '—'}</td>
                              </tr>
                            ))}
                            {user.blackoutTimes.map(bt => (
                              <tr key={bt.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600">Blackout</span>
                                </td>
                                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                                  {format(bt.startsAt, 'EEE MMM d, h:mm a')} – {format(bt.endsAt, 'h:mm a')}
                                </td>
                                <td className="px-4 py-2.5 text-gray-400 text-xs">{bt.reason ?? '—'}</td>
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
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <p className="font-medium text-gray-700">{q ? `No results for "${searchParams.q}"` : 'No time blocks assigned yet'}</p>
              <p className="text-sm text-gray-400 mt-1">{q ? 'Try a different name or sponsor.' : 'Create time blocks and assign them via attendee profiles or sponsor meetings.'}</p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
