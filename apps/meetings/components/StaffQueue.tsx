'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { format } from 'date-fns'

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  CONFIRMED: 'badge-success',
}

export function StaffQueue({ requests: initialRequests, timeBlocks }: { requests: any[], timeBlocks: any[] }) {
  const [requests, setRequests] = useState(initialRequests)
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'CONFIRMED' | 'REJECTED'>('PENDING')
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [selectedTimeBlock, setSelectedTimeBlock] = useState<string>('')
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()
  const queryClient = useQueryClient()

  async function updateStatus(id: string, status: string, timeBlockId?: string) {
    setLoading(id)
    try {
      const res = await fetch(`/api/meeting-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(timeBlockId ? { timeBlockId } : {}) }),
      })
      if (res.ok) {
        const updated = await res.json()
        setRequests(prev => prev.map(r => r.id === id ? updated : r))
        setAssigningId(null)
        setSelectedTimeBlock('')
        queryClient.invalidateQueries({ queryKey: ['meetings'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        router.refresh()
      }
    } finally {
      setLoading(null)
    }
  }

  const filtered = filter === 'ALL' ? requests : requests.filter(r => r.status === filter)
  const counts = {
    PENDING: requests.filter(r => r.status === 'PENDING').length,
    APPROVED: requests.filter(r => r.status === 'APPROVED').length,
    CONFIRMED: requests.filter(r => r.status === 'CONFIRMED').length,
    REJECTED: requests.filter(r => r.status === 'REJECTED').length,
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-title3 text-ink">Meeting Request Queue</h1>
        <span className="text-sm text-ink-2">{requests.length} total</span>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {(['PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED', 'ALL'] as const).map(s => (
          <button key={s}
            onClick={() => setFilter(s)}
            className={`chip flex-shrink-0 ${filter === s ? 'chip-active' : 'chip-inactive'}`}>
            {s === 'ALL' ? 'All' : s}
            {s !== 'ALL' && counts[s] > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                filter === s ? 'bg-white/20 text-white' : 'bg-fill text-ink-2'
              }`}>{counts[s]}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-ink-2 text-sm">No {filter === 'ALL' ? '' : filter.toLowerCase()} requests.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const requester = r.requester
            const target = r.targetUser ?? null
            const sponsor = r.targetSponsor ?? null

            return (
              <div key={r.id} className={`card ${r.status === 'PENDING' ? 'border-warning' : ''}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex gap-2 items-center flex-wrap">
                      {/* Requester */}
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                          {(requester?.name ?? '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-ink">{requester?.name ?? '—'}</p>
                          <p className="text-xs text-ink-2">{requester?.company ?? requester?.role}</p>
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-ink-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      {/* Target */}
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-fill border border-hairline overflow-hidden flex items-center justify-center flex-shrink-0">
                          {sponsor?.logoUrl ? (
                            <Image src={sponsor.logoUrl} alt={sponsor.name} width={32} height={32} className="object-contain p-0.5" />
                          ) : (
                            <span className="text-ink-2 font-bold text-xs">
                              {(sponsor?.name ?? target?.name ?? '?')[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-ink">{sponsor?.name ?? target?.name ?? '—'}</p>
                          <p className="text-xs text-ink-2">{sponsor ? `${sponsor.tier} Sponsor` : (target?.company ?? target?.role)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${STATUS_STYLES[r.status] ?? 'badge-neutral'} flex-shrink-0`}>{r.status}</span>
                </div>

                {r.message && (
                  <p className="text-xs text-ink-2 mt-2 italic border-l-2 border-hairline pl-2">&ldquo;{r.message}&rdquo;</p>
                )}

                {r.timeBlock && (
                  <p className="text-xs text-primary mt-2 font-medium">
                    {format(new Date(r.timeBlock.startsAt), 'EEE MMM d, h:mm a')} – {format(new Date(r.timeBlock.endsAt), 'h:mm a')}
                    {r.timeBlock.location && ` · ${r.timeBlock.location}`}
                  </p>
                )}

                {/* Staff actions */}
                {r.status === 'PENDING' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => updateStatus(r.id, 'APPROVED')}
                      disabled={loading === r.id}
                      className="btn-primary btn-sm flex-1">
                      Approve
                    </button>
                    <button
                      onClick={() => updateStatus(r.id, 'REJECTED')}
                      disabled={loading === r.id}
                      className="btn-danger btn-sm flex-1">
                      Reject
                    </button>
                  </div>
                )}

                {r.status === 'APPROVED' && (
                  <div className="mt-3">
                    {assigningId === r.id ? (
                      <div className="space-y-2">
                        <select
                          value={selectedTimeBlock}
                          onChange={e => setSelectedTimeBlock(e.target.value)}
                          className="select">
                          <option value="">Select a time block…</option>
                          {timeBlocks.map(tb => (
                            <option key={tb.id} value={tb.id}>
                              {format(new Date(tb.startsAt), 'EEE MMM d, h:mm a')} – {format(new Date(tb.endsAt), 'h:mm a')}
                              {tb.location ? ` · ${tb.location}` : ''}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => setAssigningId(null)} className="btn-secondary btn-sm flex-1">Cancel</button>
                          <button
                            onClick={() => updateStatus(r.id, 'CONFIRMED', selectedTimeBlock)}
                            disabled={!selectedTimeBlock || loading === r.id}
                            className="btn-primary btn-sm flex-1">
                            {loading === r.id ? 'Confirming…' : 'Confirm & Assign'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAssigningId(r.id)}
                        className="btn-primary btn-sm w-full">
                        Assign Time Block & Finalize
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
