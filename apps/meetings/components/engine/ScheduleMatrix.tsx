'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { ScheduleMatrix as MatrixData, BankItem, PendingItem, MatrixSlot, SlotMeeting } from '@conference/db'
import { fmtRange, fmtTime, initials, interestBadgeClass } from './format'
import { AssignSheet, type AssignTarget } from './AssignSheet'
import { EditSheet, type EditTarget } from './EditSheet'
import { CancelModal, type CancelTarget } from './CancelModal'

export function ScheduleMatrix({ sponsorId, sponsorName, onBack }: { sponsorId: string; sponsorName: string; onBack: () => void }) {
  const [data, setData] = useState<MatrixData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeDay, setActiveDay] = useState(0)
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null)
  const [busyReq, setBusyReq] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/companies/${sponsorId}/schedule`)
      if (!res.ok) throw new Error('Failed to load schedule')
      const d: MatrixData = await res.json()
      setData(d)
      setActiveDay(prev => Math.min(prev, Math.max(0, d.days.length - 1)))
    } catch (e: any) {
      setError(e.message)
    }
  }, [sponsorId])

  useEffect(() => { load() }, [load])

  async function reviewRequest(requestId: string, status: 'APPROVED' | 'REJECTED') {
    setBusyReq(requestId)
    try {
      await fetch(`/api/staff/requests/${requestId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      await load()
    } finally { setBusyReq(null) }
  }

  const afterMutation = useCallback(() => {
    setAssignTarget(null); setEditTarget(null); setCancelTarget(null)
    load()
  }, [load])

  const day = data?.days[activeDay]

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="material-bar z-30 border-b flex items-center gap-3 px-4 h-14 flex-shrink-0">
        <button className="icon-btn icon-btn-sm" onClick={onBack} aria-label="Back to companies">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {data?.sponsor.logoUrl
            ? <Image src={data.sponsor.logoUrl} alt="" width={24} height={24} className="rounded object-contain" />
            : <div className="w-6 h-6 rounded bg-fill border border-hairline flex items-center justify-center text-[10px] font-bold text-ink-2">{initials(sponsorName)}</div>}
          <h1 className="text-title3 text-ink truncate">{sponsorName}</h1>
        </div>
        {data && (
          <div className="ml-auto flex items-center gap-2">
            <span className="badge badge-brand">{data.bank.length} unscheduled</span>
            <span className="badge badge-success">{data.confirmedCount} confirmed</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-6"><div className="card border-danger flex items-center justify-between">
          <span className="text-body text-danger-ink">Couldn’t load this schedule.</span>
          <button className="btn-secondary btn-sm" onClick={() => { setError(null); load() }}>Retry</button>
        </div></div>
      )}

      {!error && (
        <div className="split-view flex-1">
          {/* ── Unscheduled Bank ─────────────────────────────────────── */}
          <aside className="split-view-sidebar" role="region" aria-label="Unscheduled bank">
            <div className="px-4 py-3 sticky top-0 bg-surface/95 backdrop-blur z-10 border-b border-hairline">
              <p className="section-title !mb-0">Unscheduled Bank {data && `· ${data.bank.length}`}</p>
            </div>
            <div className="p-3 space-y-2">
              {!data && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20 w-full" />)}

              {data && data.pending.length > 0 && (
                <div className="mb-1">
                  <p className="section-title">Needs review · {data.pending.length}</p>
                  {data.pending.map(p => (
                    <PendingCard key={p.requestId} item={p} busy={busyReq === p.requestId}
                      onApprove={() => reviewRequest(p.requestId, 'APPROVED')}
                      onDecline={() => reviewRequest(p.requestId, 'REJECTED')} />
                  ))}
                </div>
              )}

              {data && data.bank.length === 0 && data.pending.length === 0 && (
                <div className="empty-state !py-10">
                  <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-subhead">All requests scheduled.</p>
                </div>
              )}

              {data?.bank.map(item => (
                <BankCard key={item.requestId} item={item} onAssign={() => setAssignTarget({
                  requestId: item.requestId, name: item.name, confirmedCount: item.confirmedCount, interest: item.interest,
                })} />
              ))}
            </div>
          </aside>

          {/* ── Calendar grid ────────────────────────────────────────── */}
          <main className="split-view-main" role="region" aria-label="Schedule grid">
            <div className="max-w-3xl mx-auto px-6 py-5">
              {data && data.days.length > 0 && (
                <div className="segmented mb-5 max-w-md mx-auto" role="tablist" aria-label="Conference day">
                  {data.days.map((d, i) => (
                    <button
                      key={d.dayKey}
                      role="tab"
                      aria-selected={activeDay === i}
                      tabIndex={activeDay === i ? 0 : -1}
                      onClick={() => setActiveDay(i)}
                      onKeyDown={e => {
                        if (e.key === 'ArrowRight') { e.preventDefault(); setActiveDay((i + 1) % data.days.length) }
                        if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveDay((i - 1 + data.days.length) % data.days.length) }
                      }}
                      className={`segmented-item ${activeDay === i ? 'active' : ''}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}

              {!data && <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16 w-full" />)}</div>}

              {day && day.slots.length === 0 && (
                <div className="empty-state">No time slots configured for {day.label}.</div>
              )}

              {day && (
                <div className="space-y-2" role="list" aria-label={`Schedule for ${day.label}`}>
                  {day.slots.map(slot => (
                    <SlotRow
                      key={slot.timeBlockId}
                      slot={slot}
                      dayLabel={day.label}
                      onEdit={(m) => setEditTarget({
                        sponsorMeetingId: m.sponsorMeetingId, name: m.name,
                        currentLabel: `${day.label} · ${fmtTime(slot.startsAt)} · ${m.room ?? 'No room'}`,
                      })}
                      onCancel={(m) => setCancelTarget({
                        sponsorMeetingId: m.sponsorMeetingId, name: m.name,
                        summary: `${day.label} · ${fmtTime(slot.startsAt)} · ${m.room ?? 'No room'}`,
                      })}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      )}

      {assignTarget && <AssignSheet sponsorId={sponsorId} target={assignTarget} onClose={() => setAssignTarget(null)} onDone={afterMutation} />}
      {editTarget && <EditSheet target={editTarget} onClose={() => setEditTarget(null)} onDone={afterMutation} />}
      {cancelTarget && <CancelModal target={cancelTarget} onClose={() => setCancelTarget(null)} onDone={afterMutation} />}
    </div>
  )
}

// ── Bank candidate card with HUD popover ─────────────────────────────────────
function BankCard({ item, onAssign }: { item: BankItem; onAssign: () => void }) {
  const [showHud, setShowHud] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const open = () => { timer.current = setTimeout(() => setShowHud(true), 300) }
  const close = () => { if (timer.current) clearTimeout(timer.current); setShowHud(false) }

  return (
    <div
      className="relative"
      onMouseEnter={open}
      onMouseLeave={close}
    >
      <div className="card !p-3" role="option" aria-selected="false" tabIndex={0}
        onFocus={() => setShowHud(true)} onBlur={() => setShowHud(false)}>
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-fill border border-hairline overflow-hidden flex items-center justify-center flex-shrink-0">
            {item.image ? <Image src={item.image} alt="" width={36} height={36} className="object-cover w-full h-full" /> : <span className="text-ink-2 font-bold text-xs">{initials(item.name)}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-headline text-ink truncate">{item.name}</p>
            {item.company && <p className="text-caption text-ink-3 truncate">{item.company}</p>}
          </div>
          <span className="rank-chip flex-shrink-0" title={`Ranked ${item.rank} of ${item.total} by interest`}>{item.rank}/{item.total}</span>
        </div>
        <div className="flex items-center gap-2 mt-2.5">
          <span className={`badge ${interestBadgeClass(item.interest)}`}>{item.interest}</span>
          <span className="text-caption text-ink-3 inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            {item.confirmedCount}
          </span>
          <button className="btn-primary btn-sm ml-auto" onClick={onAssign}>Assign…</button>
        </div>
      </div>

      {showHud && (
        <div className="popover-card absolute left-full top-0 ml-2 z-40" role="group" aria-label={`Details for ${item.name}`}
          onMouseEnter={() => { if (timer.current) clearTimeout(timer.current) }} onMouseLeave={close}>
          <p className="text-headline text-ink mb-2">{item.name}</p>
          <dl className="space-y-1.5 text-footnote">
            <Row label="Rank" value={`${item.rank} of ${item.total}`} />
            <Row label="Interest" value={<span className={`badge ${interestBadgeClass(item.interest)}`}>{item.interest} · {item.interestScore}</span>} />
            <Row label="Confirmed" value={`${item.confirmedCount} meeting${item.confirmedCount === 1 ? '' : 's'}`} />
            {item.company && <Row label="Company" value={item.company} />}
            {item.matched.length > 0 && <Row label="Match" value={item.matched.slice(0, 3).join(', ')} />}
          </dl>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink text-right">{value}</dd>
    </div>
  )
}

function PendingCard({ item, busy, onApprove, onDecline }: { item: PendingItem; busy: boolean; onApprove: () => void; onDecline: () => void }) {
  return (
    <div className="card !p-3 border-warning/40 mb-2">
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-fill border border-hairline overflow-hidden flex items-center justify-center flex-shrink-0">
          {item.image ? <Image src={item.image} alt="" width={36} height={36} className="object-cover w-full h-full" /> : <span className="text-ink-2 font-bold text-xs">{initials(item.name)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-headline text-ink truncate">{item.name}</p>
          {item.company && <p className="text-caption text-ink-3 truncate">{item.company}</p>}
        </div>
        <span className={`badge ${interestBadgeClass(item.interest)}`}>{item.interest}</span>
      </div>
      {item.message && <p className="text-caption text-ink-2 mt-2 italic border-l-2 border-hairline pl-2 line-clamp-2">“{item.message}”</p>}
      <div className="flex gap-2 mt-2.5">
        <button className="btn-secondary btn-sm flex-1" disabled={busy} onClick={onDecline}>Decline</button>
        <button className="btn-primary btn-sm flex-1" disabled={busy} onClick={onApprove}>{busy ? '…' : 'Approve'}</button>
      </div>
    </div>
  )
}

// ── Calendar slot row ────────────────────────────────────────────────────────
function SlotRow({ slot, dayLabel, onEdit, onCancel }: {
  slot: MatrixSlot
  dayLabel: string
  onEdit: (m: SlotMeeting) => void
  onCancel: (m: SlotMeeting) => void
}) {
  const empty = slot.meetings.length === 0
  return (
    <div role="listitem" className={`rounded-2xl border ${empty ? 'border-dashed border-hairline bg-surface/50' : 'border-hairline bg-surface'} px-4 py-3`}>
      <div className="flex items-center gap-4">
        <div className="w-24 flex-shrink-0">
          <p className="text-footnote text-ink-2 tabular-nums">{fmtRange(slot.startsAt, slot.endsAt)}</p>
        </div>
        <div className="flex-1 min-w-0">
          {empty ? (
            <p className="text-subhead text-ink-3 italic">Open — assign a candidate from the bank</p>
          ) : (
            <div className="space-y-2">
              {slot.meetings.map(m => (
                <div key={m.sponsorMeetingId} className="group flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-fill border border-hairline overflow-hidden flex items-center justify-center flex-shrink-0">
                    {m.image ? <Image src={m.image} alt="" width={28} height={28} className="object-cover w-full h-full" /> : <span className="text-ink-2 font-bold text-[10px]">{initials(m.name)}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-ink truncate">{m.name}</p>
                    <p className="text-caption text-ink-3">{m.room ?? 'No room assigned'}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button className="icon-btn icon-btn-sm" aria-label={`Reschedule meeting with ${m.name}`} onClick={() => onEdit(m)}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button className="icon-btn icon-btn-sm text-danger" aria-label={`Cancel meeting with ${m.name}`} onClick={() => onCancel(m)}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
