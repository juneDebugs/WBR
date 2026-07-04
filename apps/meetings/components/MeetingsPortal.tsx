'use client'
import { useState, useCallback } from 'react'
import { useMeetings } from '@/lib/hooks'
import { useQueryClient } from '@tanstack/react-query'

type Section = 'meetings' | 'requests'
type Tab = 'all' | 'inbound' | 'outbound' | 'confirmed'

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-warning',
    APPROVED: 'badge-success',
    CONFIRMED: 'badge-success',
    REJECTED: 'badge-danger',
  }
  return map[status] ?? 'badge-neutral'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function PersonRow({ person, status, timeBlock, message, direction, onApprove, onDecline, actionLoading }: {
  person: any; status: string; timeBlock?: any; message?: string;
  direction: 'inbound' | 'outbound';
  onApprove?: () => void; onDecline?: () => void;
  actionLoading?: boolean;
}) {
  return (
    <div className={`card p-5 ${
      status === 'CONFIRMED' || status === 'APPROVED' ? 'border-l-4 border-success' :
      status === 'PENDING' && direction === 'inbound' ? 'border-l-4 border-warning' : ''
    }`}>
      <div className="flex items-start gap-4">
        {person?.image ? (
          <img src={person.image} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-primary">{person?.name?.[0] ?? '?'}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink">{person?.name}</span>
            <span className={`badge ${statusBadge(status)}`}>
              {status}
            </span>
            <span className={`badge ${direction === 'inbound' ? 'badge-brand' : 'badge-neutral'}`}>
              {direction === 'inbound' ? '← Inbound' : '→ Sent'}
            </span>
          </div>
          <p className="text-sm text-ink-2 mt-0.5">
            {person?.jobTitle}{person?.company ? ` · ${person.company}` : ''}
          </p>
          {person?.email && <p className="text-xs text-ink-2 mt-0.5">{person.email}</p>}
          {message && (
            <p className="text-sm text-ink-2 mt-2 bg-fill rounded-lg px-3 py-2 italic">&ldquo;{message}&rdquo;</p>
          )}
          {timeBlock && (
            <p className="text-xs text-ink-2 mt-2 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatTime(timeBlock.startsAt)}
              {timeBlock.location ? ` · ${timeBlock.location}` : ''}
            </p>
          )}
        </div>

        {direction === 'inbound' && status === 'PENDING' && (
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onApprove} disabled={actionLoading}
              className="btn-primary btn-sm">Approve</button>
            <button onClick={onDecline} disabled={actionLoading}
              className="btn-danger btn-sm">Decline</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function MeetingsPortal({ currentUserId, currentSponsorId, defaultSection = 'meetings' }: {
  currentUserId: string
  currentSponsorId: string | null
  defaultSection?: Section
}) {
  const { data: meetingsData, isLoading } = useMeetings()
  const queryClient = useQueryClient()
  const [section, setSection] = useState<Section>(defaultSection)
  const [localUpdates, setLocalUpdates] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Tab>(defaultSection === 'meetings' ? 'confirmed' : 'all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Pure client-side switch — no server roundtrip, no Next.js navigation
  const switchSection = useCallback((s: Section) => {
    setSection(s)
    setTab(s === 'meetings' ? 'confirmed' : 'all')
    window.history.replaceState(null, '', s === 'requests' ? '/requests' : '/meetings')
  }, [])

  const requests = (meetingsData?.requests ?? []).map(r =>
    localUpdates[r.id] ? { ...r, status: localUpdates[r.id] } : r
  )
  const sponsorMeetings = meetingsData?.sponsorMeetings ?? []
  const conflicts = meetingsData?.conflicts ?? []

  async function updateStatus(requestId: string, status: string) {
    setActionLoading(requestId)
    setLocalUpdates(prev => ({ ...prev, [requestId]: status }))
    try {
      const res = await fetch(`/api/meeting-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        setLocalUpdates(prev => { const next = { ...prev }; delete next[requestId]; return next })
      } else {
        queryClient.invalidateQueries({ queryKey: ['meetings'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      }
    } finally {
      setActionLoading(null)
    }
  }

  if (isLoading && !meetingsData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="skeleton h-7 w-36" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 flex items-center gap-4">
              <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-4 w-36" />
                <div className="skeleton h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const inbound = requests.filter(r => r.requesterId !== currentUserId)
  const outbound = requests.filter(r => r.requesterId === currentUserId)
  const confirmedInbound = inbound.filter(r => r.status === 'CONFIRMED' || r.status === 'APPROVED')
  const confirmedOutbound = outbound.filter(r => r.status === 'CONFIRMED' || r.status === 'APPROVED')
  const pendingInbound = inbound.filter(r => r.status === 'PENDING')

  const isMeetings = section === 'meetings'
  const allCount = inbound.length + outbound.length
  const confirmedCount = confirmedInbound.length + confirmedOutbound.length + (isMeetings ? sponsorMeetings.length : 0)

  const tabs = [
    { key: 'all' as Tab, label: 'All', count: allCount },
    { key: 'inbound' as Tab, label: 'Inbound', count: inbound.length, dot: pendingInbound.length > 0 },
    { key: 'outbound' as Tab, label: 'Sent', count: outbound.length },
    { key: 'confirmed' as Tab, label: 'Confirmed', count: confirmedCount },
  ]

  function getPersonForRequest(r: any, direction: 'inbound' | 'outbound') {
    if (direction === 'inbound') return r.requester
    if (r.targetSponsor) {
      return {
        name: r.targetSponsor.name,
        image: r.targetSponsor.logoUrl,
        jobTitle: `${r.targetSponsor.tier} Sponsor`,
        company: null,
        email: null,
      }
    }
    return r.targetUser
  }

  function renderRequests() {
    const showInbound = tab === 'all' || tab === 'inbound'
    const showOutbound = tab === 'all' || tab === 'outbound'
    const showConfirmed = tab === 'confirmed'

    let items: React.ReactNode[] = []

    if (showConfirmed) {
      items = [
        ...confirmedInbound.map(r => (
          <PersonRow key={r.id} person={getPersonForRequest(r, 'inbound')} status={r.status}
            timeBlock={r.timeBlock} message={r.message} direction="inbound"
            actionLoading={actionLoading === r.id} />
        )),
        ...confirmedOutbound.map(r => (
          <PersonRow key={r.id} person={getPersonForRequest(r, 'outbound')} status={r.status}
            timeBlock={r.timeBlock} message={r.message} direction="outbound" />
        )),
        // Sponsor meetings only in Meetings section
        ...(isMeetings ? sponsorMeetings.map((m: any) => (
          <div key={m.id} className="card p-5 border-l-4 border-primary/50">
            <div className="flex items-center gap-4">
              {m.user.image ? (
                <img src={m.user.image} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">{m.user.name?.[0]}</span>
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-ink">{m.user.name}</p>
                <p className="text-sm text-ink-2">{m.user.jobTitle}{m.user.company ? ` · ${m.user.company}` : ''}</p>
                {m.timeBlock && (
                  <p className="text-xs text-ink-2 mt-1 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatTime(m.timeBlock.startsAt)}
                    {m.timeBlock.location ? ` · ${m.timeBlock.location}` : ''}
                  </p>
                )}
              </div>
              <span className="badge badge-brand">Scheduled</span>
            </div>
          </div>
        )) : []),
      ]
    } else {
      if (showInbound) {
        items.push(...inbound.map(r => (
          <PersonRow key={r.id} person={getPersonForRequest(r, 'inbound')} status={r.status}
            timeBlock={r.timeBlock} message={r.message} direction="inbound"
            onApprove={() => updateStatus(r.id, 'APPROVED')}
            onDecline={() => updateStatus(r.id, 'REJECTED')}
            actionLoading={actionLoading === r.id} />
        )))
      }
      if (showOutbound) {
        items.push(...outbound.map(r => (
          <PersonRow key={r.id} person={getPersonForRequest(r, 'outbound')} status={r.status}
            timeBlock={r.timeBlock} message={r.message} direction="outbound" />
        )))
      }
    }

    if (items.length === 0) {
      return (
        <div className="empty-state">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p>{isMeetings ? 'No meetings here yet.' : 'No requests here yet.'}</p>
        </div>
      )
    }

    return <div className="space-y-3">{items}</div>
  }

  return (
    <>
      {isMeetings && conflicts.length > 0 && (
        <div className="mx-4 mt-4 rounded-xl border border-danger-soft bg-danger-soft px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-danger-ink">
              {conflicts.length} presenter conflict{conflicts.length !== 1 ? 's' : ''} detected
            </p>
            <p className="text-xs text-danger-ink mt-0.5">
              {conflicts.map((c: any) => c.speakerName).join(', ')} {conflicts.length === 1 ? 'is' : 'are'} double-booked. Session schedule may change — check back for updates.
            </p>
          </div>
        </div>
      )}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* iOS-style segmented control */}
        <div className="flex items-center justify-between">
          <div className="relative flex items-center bg-fill rounded-xl p-[3px]">
            {/* Sliding indicator */}
            <div
              className="absolute top-[3px] bottom-[3px] rounded-lg bg-surface shadow-card transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
              style={{
                width: 'calc(50% - 1.5px)',
                transform: isMeetings ? 'translateX(0)' : 'translateX(calc(100% + 3px))',
              }}
            />
            <button
              onClick={() => switchSection('meetings')}
              className={`relative z-10 min-w-[120px] min-h-[40px] inline-flex items-center justify-center px-5 text-footnote font-semibold rounded-lg transition-colors duration-200 ${
                isMeetings ? 'text-ink' : 'text-ink-2 active:text-ink'
              }`}>
              Meetings
            </button>
            <button
              onClick={() => switchSection('requests')}
              className={`relative z-10 min-w-[120px] min-h-[40px] inline-flex items-center justify-center px-5 text-footnote font-semibold rounded-lg transition-colors duration-200 ${
                !isMeetings ? 'text-ink' : 'text-ink-2 active:text-ink'
              }`}>
              My Requests
            </button>
          </div>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['meetings'] })}
            className="text-xs text-ink-2 hover:text-primary px-2 py-1 rounded-lg hover:bg-fill transition-colors">
            ↻ Refresh
          </button>
        </div>

        <div className="flex gap-1 border-b border-hairline">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-1.5 ${
                tab === t.key ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-ink-2 hover:text-ink'
              }`}>
              {t.label}
              {t.count > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                  (t as any).dot ? 'bg-warning-soft text-warning-ink' : 'bg-fill text-ink-2'
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {renderRequests()}
      </div>
    </>
  )
}
