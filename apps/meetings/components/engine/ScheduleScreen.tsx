'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScheduleMatrix as MatrixData, BankItem, PendingItem, ScheduledItem, MiscItem, MatrixSlot, MeetingPriority } from '@conference/db'
import { fmtRange, fmtDate } from './format'
import { AssignLocationModal, type AssignLocationTarget } from './AssignLocationModal'
import { EditMeetingModal, type EditTarget } from './EditMeetingModal'
import { CancelMeetingModal, type CancelTarget } from './CancelMeetingModal'

type Company = { id: string; name: string }
type SelectedCand = { requestId: string; userId: string; name: string; company: string | null }

const SUBTABS = ['Request Meeting', 'Received', 'Sent', 'Meeting Times'] as const

const PRIORITY_LABEL = { BEST_FIT: 'Best Fit', MED: 'Med', LOW: 'Low' } as const
const PRIORITY_BADGE = { BEST_FIT: 'badge badge-brand', MED: 'badge badge-warning', LOW: 'badge badge-neutral' } as const

// Best Fit first, then Med, then Low — matches the auto-scheduler fill order.
const PRIORITY_ORDER: MeetingPriority[] = ['BEST_FIT', 'MED', 'LOW']

type TierSummaryRow = { tier: MeetingPriority; eligible: number; scheduled: number; skipped: number }
type AutoScheduleResult = {
  dryRun: boolean
  scheduled: unknown[]
  skipped: unknown[]
  byTier: TierSummaryRow[]
  totalEligible: number
}

export function ScheduleScreen({
  sponsorId, sponsorName, companies, onSwitchCompany, onBack,
}: {
  sponsorId: string
  sponsorName: string
  companies: Company[]
  onSwitchCompany: (id: string) => void
  onBack: () => void
}) {
  const [data, setData] = useState<MatrixData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeDay, setActiveDay] = useState(0)
  const [subtab, setSubtab] = useState<typeof SUBTABS[number]>('Meeting Times')
  const [selected, setSelected] = useState<SelectedCand | null>(null)
  const [assignTarget, setAssignTarget] = useState<AssignLocationTarget | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [autoOpen, setAutoOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/companies/${sponsorId}/schedule`)
      if (!res.ok) throw new Error('Failed to load schedule')
      const d: MatrixData = await res.json()
      setData(d)
      setActiveDay(p => Math.min(p, Math.max(0, d.days.length - 1)))
    } catch (e: any) { setError(e.message) }
  }, [sponsorId])
  useEffect(() => { load(); setSelected(null) }, [load])

  const afterMutation = useCallback(() => {
    setAssignTarget(null); setEditTarget(null); setCancelTarget(null); setSelected(null); load()
  }, [load])

  const day = data?.days[activeDay]

  function scheduleAt(slot: MatrixSlot) {
    if (!selected) { setHint('Select a candidate from the Unscheduled list first, then click “Schedule at…”.'); return }
    if (slot.capacityLeft <= 0) { setHint('That time slot is full for this company.'); return }
    setHint(null)
    setAssignTarget({
      requestId: selected.requestId, candidateName: selected.name, candidateCompany: selected.company,
      timeBlockId: slot.timeBlockId, startsAt: slot.startsAt, endsAt: slot.endsAt,
    })
  }

  const TH = 'border border-[#ddd] bg-[#eef1f5] px-2 py-1.5 text-left text-[12px] font-bold text-[#333]'
  const TD = 'border border-[#ddd] px-2 py-1.5 text-[12px] text-[#333] align-top'

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Switch company row */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#ddd] bg-[#fafafa] text-[13px]">
        <button onClick={onBack} className="text-[#337ab7] hover:underline">← Companies</button>
        <span className="mx-2 text-[#ccc]">|</span>
        <span className="text-[#555]">Switch company:</span>
        <select className="border border-[#ccc] rounded px-2 py-1 text-[13px] bg-white" value={sponsorId} onChange={e => onSwitchCompany(e.target.value)}>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="ml-1 border border-[#ccc] rounded px-2 py-1 bg-white text-[#555] cursor-default">Next ▾</span>
        <button className="btn-primary ml-auto" onClick={() => setAutoOpen(true)}>Auto-Schedule by Priority</button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0.5 px-4 pt-2 bg-[#fafafa] border-b border-[#ddd]">
        {SUBTABS.map(t => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`px-3 py-1.5 text-[13px] border border-b-0 rounded-t ${subtab === t ? 'bg-white text-[#333] border-[#ddd] font-semibold -mb-px' : 'bg-[#eef1f5] text-[#337ab7] border-transparent hover:bg-[#e2e8f0]'}`}
          >{t}</button>
        ))}
      </div>

      {error && <div className="m-4 border border-[#d9534f] bg-[#f2dede] text-[#a94442] px-3 py-2 text-[13px] rounded">Couldn’t load this schedule. <button className="underline" onClick={() => { setError(null); load() }}>Retry</button></div>}

      {subtab === 'Meeting Times' && (
        <div className="flex" style={{ minHeight: 520 }}>
          {/* ── Left sidebar ── */}
          <aside className="w-72 flex-shrink-0 border-r border-[#ddd] bg-[#fbfbfb] overflow-y-auto">
            <Section title="Misc" count={data?.misc.length}>
              {data?.misc.map(m => <MiscRow key={m.requestId} item={m} />)}
              {data && data.misc.length === 0 && <Empty />}
            </Section>
            <Section title="Already Scheduled" count={data?.alreadyScheduled.length} defaultOpen={false}>
              {data?.alreadyScheduled.map(s => <ScheduledRow key={s.sponsorMeetingId} item={s} />)}
              {data && data.alreadyScheduled.length === 0 && <Empty />}
            </Section>
            <Section title="Unscheduled" count={(data?.pending.length ?? 0) + (data?.bank.length ?? 0)} defaultOpen>
              {!data && <div className="px-3 py-2 text-[12px] text-[#999]">Loading…</div>}
              {data?.pending.map(p => (
                <CandidateRow key={p.requestId} kind="Inbound" name={p.name} company={p.company}
                  rank={0} total={0} confirmed={0} interestOutOf5={Math.round(p.interestScore / 20)} interest={p.interest}
                  priority={p.priority ?? 'MED'}
                  selected={selected?.requestId === p.requestId}
                  onSelect={() => setSelected({ requestId: p.requestId, userId: p.userId, name: p.name, company: p.company })}
                  sponsorName={sponsorName} />
              ))}
              {data?.bank.map(b => (
                <CandidateRow key={b.requestId} kind="Approved" name={b.name} company={b.company}
                  rank={b.rank} total={b.total} confirmed={b.confirmedCount} interestOutOf5={b.interestOutOf5} interest={b.interest}
                  priority={b.priority ?? 'MED'}
                  selected={selected?.requestId === b.requestId}
                  onSelect={() => setSelected({ requestId: b.requestId, userId: b.userId, name: b.name, company: b.company })}
                  sponsorName={sponsorName} />
              ))}
              {data && data.pending.length === 0 && data.bank.length === 0 && <div className="px-3 py-3 text-[12px] text-[#999]">All requests scheduled.</div>}
            </Section>
          </aside>

          {/* ── Right: presentation info + calendar ── */}
          <main className="flex-1 min-w-0 overflow-x-auto">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#ddd]">
              <span className="text-[13px] font-semibold text-[#555]">ⓘ Presentation Info</span>
              <div className="flex gap-1 text-[12px]">
                {['Add Note', 'Add Meeting', 'Cancel', 'Info'].map(b => (
                  <span key={b} className="border border-[#ccc] rounded px-2 py-1 bg-white text-[#555] cursor-default">{b}</span>
                ))}
              </div>
            </div>

            {/* Day tabs */}
            {data && data.days.length > 0 && (
              <div className="flex gap-0.5 px-4 pt-2 border-b border-[#ddd]" role="tablist" aria-label="Conference day">
                {data.days.map((d, i) => (
                  <button key={d.dayKey} role="tab" aria-selected={activeDay === i} tabIndex={activeDay === i ? 0 : -1}
                    onClick={() => setActiveDay(i)}
                    onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); setActiveDay((i + 1) % data.days.length) } if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveDay((i - 1 + data.days.length) % data.days.length) } }}
                    className={`px-3 py-1.5 text-[13px] border border-b-0 rounded-t ${activeDay === i ? 'bg-white text-[#333] border-[#ddd] font-semibold -mb-px' : 'bg-[#eef1f5] text-[#337ab7] border-transparent hover:bg-[#e2e8f0]'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}

            {hint && <div className="mx-4 mt-2 border border-[#f0ad4e] bg-[#fcf8e3] text-[#8a6d3b] px-3 py-1.5 text-[12px] rounded">{hint}</div>}

            <div className="p-4">
              {!data && <div className="text-[13px] text-[#777]">Loading schedule…</div>}
              {day && day.slots.length === 0 && <div className="text-[13px] text-[#777]">No time slots for {day.label}.</div>}
              {day && day.slots.length > 0 && (
                <table className="border-collapse w-full" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th className={TH} style={{ width: 120 }}>Meet As</th>
                      <th className={TH} style={{ width: 160 }}>Time Slot ⓘ</th>
                      <th className={TH} style={{ width: 120 }}>Location</th>
                      <th className={TH}>Meeting With</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.slots.map(slot => {
                      const empty = slot.meetings.length === 0
                      return (
                        <tr key={slot.timeBlockId} className="hover:bg-[#f9f9f9]">
                          <td className={TD}>
                            <button
                              className={`text-[12px] ${selected && slot.capacityLeft > 0 ? 'text-[#337ab7] hover:underline' : 'text-[#999]'}`}
                              onClick={() => scheduleAt(slot)}
                            >Schedule at…</button>
                          </td>
                          <td className={TD + ' whitespace-nowrap'}>{fmtRange(slot.startsAt, slot.endsAt)}</td>
                          <td className={TD}>{empty ? <span className="text-[#bbb]">-</span> : (slot.meetings[0].room ?? sponsorName)}</td>
                          <td className={TD}>
                            {empty ? <span className="text-[#bbb]">—</span> : (
                              <div className="space-y-1">
                                {slot.meetings.map(m => (
                                  <div key={m.sponsorMeetingId} className="flex items-center gap-2">
                                    <div className="min-w-0">
                                      <span className="text-[#333]">{m.company ?? sponsorName}</span>
                                      <span className="text-[#777]"> / {m.name}</span>
                                    </div>
                                    <span className="ml-auto flex items-center gap-1">
                                      <button aria-label={`Edit meeting with ${m.name}`} title="Edit" className="text-[#337ab7] hover:text-[#23527c]"
                                        onClick={() => setEditTarget({ sponsorMeetingId: m.sponsorMeetingId, attendeeName: m.name, attendeeCompany: m.company })}>✎</button>
                                      <button aria-label={`Cancel meeting with ${m.name}`} title="Cancel" className="text-[#d9534f] hover:text-[#a94442]"
                                        onClick={() => setCancelTarget({ sponsorMeetingId: m.sponsorMeetingId, attendeeName: m.name, attendeeCompany: m.company, when: `${fmtDate(slot.startsAt)} ${fmtRange(slot.startsAt, slot.endsAt)} · ${m.room ?? sponsorName}` })}>✕</button>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </main>

          {/* Customize side tab (cosmetic) */}
          <div className="w-6 flex-shrink-0 bg-[#337ab7] text-white flex items-center justify-center">
            <span className="text-[11px]" style={{ writingMode: 'vertical-rl' }}>Customize</span>
          </div>
        </div>
      )}

      {subtab !== 'Meeting Times' && (
        <div className="p-8 text-[13px] text-[#777]">The “{subtab}” tab mirrors the meeting-request lifecycle for this company. Use <b>Meeting Times</b> to schedule.</div>
      )}

      {assignTarget && <AssignLocationModal sponsorId={sponsorId} sponsorName={sponsorName} target={assignTarget} onClose={() => setAssignTarget(null)} onDone={afterMutation} />}
      {editTarget && <EditMeetingModal sponsorName={sponsorName} target={editTarget} onClose={() => setEditTarget(null)} onDone={afterMutation} />}
      {cancelTarget && <CancelMeetingModal target={cancelTarget} onClose={() => setCancelTarget(null)} onDone={afterMutation} />}
      {autoOpen && <AutoSchedulePanel sponsorId={sponsorId} sponsorName={sponsorName} onClose={() => setAutoOpen(false)} onApplied={() => { setAutoOpen(false); setSelected(null); load() }} />}
    </div>
  )
}

// ── Sidebar section (collapsible) ──
function Section({ title, count, defaultOpen = true, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[#e5e5e5]">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-1 px-2 py-1.5 text-[12px] font-bold text-[#444] bg-[#eef1f5] hover:bg-[#e2e8f0]">
        <span className="text-[9px]">{open ? '▾' : '▸'}</span>{title}{typeof count === 'number' && <span className="text-[#888] font-normal">· {count}</span>}
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}
const Empty = () => <div className="px-3 py-2 text-[12px] text-[#bbb]">None</div>

// ── Candidate row with HUD tooltip ──
function CandidateRow({ kind, name, company, rank, total, confirmed, interestOutOf5, interest, priority, selected, onSelect, sponsorName }: {
  kind: 'Inbound' | 'Approved'; name: string; company: string | null; rank: number; total: number; confirmed: number
  interestOutOf5: number; interest: string; priority: MeetingPriority; selected: boolean; onSelect: () => void; sponsorName: string
}) {
  const [hud, setHud] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (
    <div className="relative"
      onMouseEnter={() => { timer.current = setTimeout(() => setHud(true), 300) }}
      onMouseLeave={() => { if (timer.current) clearTimeout(timer.current); setHud(false) }}>
      <button
        onClick={onSelect}
        onFocus={() => setHud(true)} onBlur={() => setHud(false)}
        className={`w-full text-left flex items-start gap-1.5 px-2 py-1.5 border-b border-[#f0f0f0] ${selected ? 'bg-[#d9edf7]' : 'hover:bg-[#f3f7fb]'}`}
      >
        <input type="checkbox" readOnly checked={selected} className="mt-0.5" tabIndex={-1} />
        <span className="min-w-0 flex-1">
          <span className="text-[12px] text-[#333]">{name}{company ? <span className="text-[#888]">, {company}</span> : ''}</span>
          {kind === 'Approved' && <span className="text-[11px] text-[#777]"> ({rank}/{total} ; {confirmed})</span>}
        </span>
        <span className={`${PRIORITY_BADGE[priority]} shrink-0`}>{PRIORITY_LABEL[priority]}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${kind === 'Inbound' ? 'bg-[#5bc0de] text-white' : 'bg-[#5cb85c] text-white'}`}>{kind}</span>
      </button>
      {hud && (
        <div className="absolute left-full top-0 ml-1 z-40 w-56 bg-[#333] text-white text-[11px] rounded shadow-lg p-2.5" role="group" aria-label={`Details for ${name}`}>
          <div className="mb-1"><span className="text-[#9ecbff]">Target:</span> {name}{company ? `, ${company}` : ''}</div>
          <div><span className="text-[#9ecbff]">Priority:</span> {PRIORITY_LABEL[priority]}</div>
          <div><span className="text-[#9ecbff]">Interest Level:</span> {interestOutOf5}/5</div>
          <div><span className="text-[#9ecbff]">Source:</span> {sponsorName}</div>
          {kind === 'Approved' && <div><span className="text-[#9ecbff]">Ranking:</span> {rank}</div>}
          <div><span className="text-[#9ecbff]">Interest Level:</span> {interest}</div>
        </div>
      )}
    </div>
  )
}

function ScheduledRow({ item }: { item: ScheduledItem }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#f0f0f0] text-[12px]">
      <span className="min-w-0 flex-1 text-[#333]">{item.name}{item.company ? <span className="text-[#888]">, {item.company}</span> : ''} <span className="text-[#777]">(; {item.confirmedCount})</span></span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#777] text-white">Scheduled</span>
    </div>
  )
}
function MiscRow({ item }: { item: MiscItem }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#f0f0f0] text-[12px]">
      <span className="min-w-0 flex-1 text-[#777]">{item.name}{item.company ? `, ${item.company}` : ''}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#d9534f] text-white">{item.status}</span>
    </div>
  )
}

// ── Auto-Schedule by Priority (dry-run preview → apply) ──
function AutoSchedulePanel({ sponsorId, sponsorName, onClose, onApplied }: {
  sponsorId: string; sponsorName: string; onClose: () => void; onApplied: () => void
}) {
  const [preview, setPreview] = useState<AutoScheduleResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/staff/meetings/auto-schedule', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sponsorId, dryRun: true }),
        })
        if (!res.ok) throw new Error('Failed to preview auto-schedule')
        const d: AutoScheduleResult = await res.json()
        if (alive) setPreview(d)
      } catch (e: any) { if (alive) setError(e.message) }
    })()
    return () => { alive = false }
  }, [sponsorId])

  async function apply() {
    setApplying(true); setError(null)
    try {
      const res = await fetch('/api/staff/meetings/auto-schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorId }),
      })
      if (!res.ok) throw new Error('Failed to apply auto-schedule')
      onApplied()
    } catch (e: any) { setError(e.message); setApplying(false) }
  }

  const empty = preview && preview.totalEligible === 0
  const byTier = preview ? PRIORITY_ORDER.map(t => preview.byTier.find(r => r.tier === t)).filter(Boolean) as TierSummaryRow[] : []
  const totalScheduled = byTier.reduce((n, r) => n + r.scheduled, 0)
  const totalSkipped = byTier.reduce((n, r) => n + r.skipped, 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Auto-schedule preview">
      <div className="bg-surface rounded-2xl w-full max-w-md p-5 shadow-elevated" style={{ fontFamily: 'inherit' }}>
        <h2 className="text-[17px] font-semibold text-[#1c1c1e] mb-3">Auto-Schedule Preview — {sponsorName}</h2>

        {error && <div className="mb-3 border border-[#d9534f] bg-[#f2dede] text-[#a94442] px-3 py-2 text-[13px] rounded">{error}</div>}

        {!preview && !error && <div className="text-[13px] text-[#777] py-4">Loading preview…</div>}

        {empty && <div className="text-[13px] text-[#555] py-3">No unscheduled requests for this company.</div>}

        {preview && !empty && (
          <div className="space-y-2">
            {byTier.map(r => (
              <div key={r.tier} className="flex items-center gap-2 text-[13px]">
                <span className={PRIORITY_BADGE[r.tier]}>{PRIORITY_LABEL[r.tier]}</span>
                <span className="text-[#333]">{r.scheduled} scheduled · {r.skipped} skipped</span>
                <span className="ml-auto text-[#888]">{r.eligible} eligible</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-[13px] pt-2 mt-1 border-t border-[#e5e5e5]">
              <span className="font-semibold text-[#1c1c1e]">Total</span>
              <span className="text-[#333]">{totalScheduled} scheduled · {totalSkipped} skipped</span>
              <span className="ml-auto text-[#888]">{preview.totalEligible} eligible</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          {empty ? (
            <button className="btn-secondary" onClick={onClose}>Close</button>
          ) : (
            <>
              <button className="btn-secondary" onClick={onClose} disabled={applying}>Cancel</button>
              <button className="btn-primary" onClick={apply} disabled={applying || !preview}>{applying ? 'Working…' : 'Apply'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
