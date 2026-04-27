'use client'
import { format } from 'date-fns'

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CONFIRMED: 'bg-indigo-100 text-indigo-700',
}

export function RequestsList({ requests, currentUserId }: { requests: any[], currentUserId: string }) {
  if (requests.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-400">No meeting requests yet.</p>
        <a href="/browse" className="mt-2 text-primary text-sm hover:underline block">Browse and request meetings →</a>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-bold text-gray-900 text-lg mb-5">My Meeting Requests</h1>
      <div className="space-y-3">
        {requests.map(r => {
          const isMine = r.requesterId === currentUserId
          const otherPerson = isMine ? r.targetUser : r.requester
          const sponsor = r.targetSponsor
          const displayName = sponsor?.name ?? otherPerson?.name ?? '—'
          const displaySub = sponsor ? `${sponsor.tier} Sponsor` : otherPerson?.company ?? otherPerson?.role ?? ''

          return (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {sponsor?.logoUrl ? (
                      <img src={sponsor.logoUrl} alt={sponsor.name} loading="lazy" className="w-full h-full object-contain p-1" />
                    ) : otherPerson?.image ? (
                      <img src={otherPerson.image} alt={displayName} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-500 font-bold text-sm">{displayName[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
                    <p className="text-xs text-gray-400">{displaySub}</p>
                    {r.message && <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{r.message}&rdquo;</p>}
                    {r.timeBlock && (
                      <p className="text-xs text-indigo-600 mt-1 font-medium">
                        {format(new Date(r.timeBlock.startsAt), 'EEE MMM d, h:mm a')} – {format(new Date(r.timeBlock.endsAt), 'h:mm a')}
                        {r.timeBlock.location && ` · ${r.timeBlock.location}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`badge ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                  <span className="text-[10px] text-gray-400">{isMine ? 'Sent' : 'Received'}</span>
                  <span className="text-[10px] text-gray-300">{format(new Date(r.createdAt), 'MMM d')}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
