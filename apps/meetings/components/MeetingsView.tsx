'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

const STATUS_STYLES: Record<string, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  CONFIRMED:'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-500',
}

const STATUS_ORDER = ['CONFIRMED', 'PENDING', 'APPROVED', 'REJECTED']

type Tab = 'All' | 'Confirmed' | 'Pending' | 'Rejected'

interface Props {
  requests: any[]
  sponsorMeetings: any[]
  currentUserId: string
  currentSponsorId: string | null
}

export function MeetingsView({ requests, sponsorMeetings, currentUserId, currentSponsorId }: Props) {
  const [tab, setTab] = useState<Tab>('All')
  const router = useRouter()

  const refresh = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    // Poll every 3 seconds for status changes
    const interval = setInterval(refresh, 3000)
    // Also refresh instantly when the tab becomes visible again
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const filtered = requests.filter(r => {
    if (tab === 'All') return true
    if (tab === 'Confirmed') return r.status === 'CONFIRMED'
    if (tab === 'Pending') return r.status === 'PENDING' || r.status === 'APPROVED'
    if (tab === 'Rejected') return r.status === 'REJECTED'
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status)
    const bi = STATUS_ORDER.indexOf(b.status)
    if (ai !== bi) return ai - bi
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const confirmedCount = requests.filter(r => r.status === 'CONFIRMED').length
  const pendingCount = requests.filter(r => r.status === 'PENDING' || r.status === 'APPROVED').length

  const TABS: Tab[] = ['All', 'Confirmed', 'Pending', 'Rejected']

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="font-bold text-gray-900 text-xl">Meetings</h1>
        <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          live
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-5">All requested and confirmed meetings</p>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5">
        {TABS.map(t => {
          const count = t === 'Confirmed' ? confirmedCount : t === 'Pending' ? pendingCount : null
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-gray-500'
              }`}
            >
              {t}
              {count !== null && count > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                  t === 'Confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Confirmed sponsor meetings block (for sponsor users) */}
      {(tab === 'All' || tab === 'Confirmed') && sponsorMeetings.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Confirmed Sponsor Meetings</p>
          <div className="space-y-3">
            {sponsorMeetings.map(m => (
              <div key={m.id} className="rounded-2xl border border-green-100 bg-green-50/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {m.user?.image ? (
                      <img src={m.user.image} alt={m.user.name ?? ''} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-500 font-bold text-sm">{(m.user?.name ?? '?')[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{m.user?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{[m.user?.jobTitle, m.user?.company].filter(Boolean).join(' · ')}</p>
                    <p className="text-xs text-green-600 mt-1 font-medium">
                      {format(new Date(m.timeBlock.startsAt), 'EEE MMM d, h:mm a')} – {format(new Date(m.timeBlock.endsAt), 'h:mm a')}
                      {m.timeBlock.location ? ` · ${m.timeBlock.location}` : ''}
                    </p>
                  </div>
                  <span className="badge bg-green-100 text-green-700 flex-shrink-0">Confirmed</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meeting Requests */}
      {sorted.length === 0 && sponsorMeetings.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No meetings yet</p>
          <p className="text-gray-400 text-sm mt-1">Browse and request meetings to get started.</p>
          <a href="/browse" className="inline-block mt-4 text-primary text-sm font-medium hover:underline">
            Browse Attendees & Sponsors →
          </a>
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-center text-gray-400 py-8 text-sm">No meetings in this category.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map(r => {
            const isMine = r.requesterId === currentUserId
            const otherPerson = isMine ? r.targetUser : r.requester
            const sponsor = r.targetSponsor
            const displayName = sponsor?.name ?? otherPerson?.name ?? '—'
            const displaySub = sponsor
              ? `${sponsor.tier} Sponsor`
              : [otherPerson?.jobTitle, otherPerson?.company].filter(Boolean).join(' · ')

            return (
              <div
                key={r.id}
                className={`rounded-2xl border p-4 ${
                  r.status === 'CONFIRMED'
                    ? 'border-green-100 bg-green-50/30'
                    : r.status === 'REJECTED'
                    ? 'border-red-100 bg-red-50/20 opacity-60'
                    : 'border-gray-100 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {sponsor?.logoUrl ? (
                      <img src={sponsor.logoUrl} alt={sponsor.name} loading="lazy" className="w-full h-full object-contain p-1" />
                    ) : otherPerson?.image ? (
                      <img src={otherPerson.image} alt={displayName} loading="lazy" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <span className="text-gray-500 font-bold text-sm">{displayName[0]?.toUpperCase()}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
                        {displaySub && <p className="text-xs text-gray-400 mt-0.5">{displaySub}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`badge ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                        </span>
                        <span className="text-[10px] text-gray-400">{isMine ? 'Sent by you' : 'Received'}</span>
                      </div>
                    </div>

                    {r.message && (
                      <p className="text-xs text-gray-500 mt-2 italic border-l-2 border-gray-200 pl-2">
                        &ldquo;{r.message}&rdquo;
                      </p>
                    )}

                    {r.timeBlock && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green-700">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {format(new Date(r.timeBlock.startsAt), 'EEE MMM d, h:mm a')} – {format(new Date(r.timeBlock.endsAt), 'h:mm a')}
                        {r.timeBlock.location && ` · ${r.timeBlock.location}`}
                      </div>
                    )}

                    <p className="text-[10px] text-gray-300 mt-1.5">
                      Requested {format(new Date(r.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
