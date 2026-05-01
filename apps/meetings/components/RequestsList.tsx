'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Tab = 'all' | 'inbound' | 'outbound' | 'confirmed'

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-100',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    REJECTED: 'bg-red-50 text-red-600 border-red-100',
  }
  return map[status] ?? 'bg-gray-50 text-gray-600 border-gray-100'
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
      status === 'CONFIRMED' || status === 'APPROVED' ? 'border-l-4 border-emerald-400' :
      status === 'PENDING' && direction === 'inbound' ? 'border-l-4 border-amber-400' : ''
    }`}>
      <div className="flex items-start gap-4">
        {person?.image ? (
          <img src={person.image} alt="" loading="lazy" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-primary">{person?.name?.[0] ?? '?'}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{person?.name}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadge(status)}`}>
              {status}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              direction === 'inbound' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'
            }`}>
              {direction === 'inbound' ? '← Inbound' : '→ Sent'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {person?.jobTitle}{person?.company ? ` · ${person.company}` : ''}
          </p>
          {person?.email && <p className="text-xs text-gray-400 mt-0.5">{person.email}</p>}
          {message && (
            <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2 italic">&ldquo;{message}&rdquo;</p>
          )}
          {timeBlock && (
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
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
              className="btn-primary text-xs px-3 py-1.5">Approve</button>
            <button onClick={onDecline} disabled={actionLoading}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">Decline</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function RequestsList({ requests, currentUserId }: { requests: any[], currentUserId: string }) {
  const router = useRouter()
  const refresh = useCallback(() => router.refresh(), [router])
  const [tab, setTab] = useState<Tab>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    const i = setInterval(refresh, 3000)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', onVisible) }
  }, [refresh])

  async function updateStatus(requestId: string, status: string) {
    setActionLoading(requestId)
    try {
      await fetch(`/api/meeting-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      refresh()
    } finally {
      setActionLoading(null)
    }
  }

  const inbound = requests.filter(r => r.requesterId !== currentUserId)
  const outbound = requests.filter(r => r.requesterId === currentUserId)

  const confirmedInbound = inbound.filter(r => r.status === 'CONFIRMED' || r.status === 'APPROVED')
  const confirmedOutbound = outbound.filter(r => r.status === 'CONFIRMED' || r.status === 'APPROVED')
  const pendingInbound = inbound.filter(r => r.status === 'PENDING')

  const allCount = inbound.length + outbound.length
  const confirmedCount = confirmedInbound.length + confirmedOutbound.length

  const tabs = [
    { key: 'all' as Tab, label: 'All', count: allCount },
    { key: 'inbound' as Tab, label: 'Inbound', count: inbound.length, dot: pendingInbound.length > 0 },
    { key: 'outbound' as Tab, label: 'Sent', count: outbound.length },
    { key: 'confirmed' as Tab, label: 'Confirmed', count: confirmedCount },
  ]

  function getPersonForRequest(r: any, direction: 'inbound' | 'outbound') {
    if (direction === 'inbound') {
      return r.requester
    }
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
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p>No requests here yet.</p>
        </div>
      )
    }

    return <div className="space-y-3">{items}</div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Requests</h1>
          <p className="text-sm text-gray-500 mt-1">All meeting requests — inbound from attendees and sent by your team</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-xs text-gray-400">Live</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-1.5 ${
              tab === t.key ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-gray-500 hover:text-gray-800'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                (t as any).dot ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {renderRequests()}
    </div>
  )
}
