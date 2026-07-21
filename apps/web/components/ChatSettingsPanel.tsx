'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SponsorLogo } from '@/components/SponsorLogo'
import { Toggle } from '@/components/Toggle'

// ─── Client-safe view model (mirrors apps/web/lib/chat-settings-server.ts) ────
export type VendorRow = {
  sponsorId: string
  name: string
  tier: string
  logoUrl: string | null
  toAttendees: boolean
  toSpeakers: boolean
}
export type StaffRow = {
  userId: string
  name: string
  email: string
  toAttendees: boolean
  toVendors: boolean
  toSpeakers: boolean
}
export type ChatSettingsData = {
  vendorGlobal: { enabled: boolean }
  vendors: VendorRow[]
  staff: StaffRow[]
}

type Status = 'idle' | 'saving' | 'saved' | 'error'

// ─── Switch — the shared squash-stretch Toggle (see components/Toggle.tsx) ─────
function Switch({
  checked,
  disabled,
  labelledBy,
  onChange,
  size,
}: {
  checked: boolean
  disabled: boolean
  labelledBy: string
  onChange: (next: boolean) => void
  size?: 'md' | 'lg'
}) {
  return <Toggle checked={checked} disabled={disabled} labelledBy={labelledBy} onChange={onChange} size={size} />
}

const TIER_BADGE: Record<string, string> = {
  PLATINUM: 'bg-fill text-ink-2',
  GOLD: 'bg-warning-soft text-warning-ink',
  SILVER: 'bg-fill text-ink-2',
  BRONZE: 'bg-warning-soft text-warning-ink',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

// Deep-ish equality for the draft/snapshot dirty check.
function sameData(a: ChatSettingsData, b: ChatSettingsData): boolean {
  if (a.vendorGlobal.enabled !== b.vendorGlobal.enabled) return false
  if (a.vendors.length !== b.vendors.length) return false
  for (let i = 0; i < a.vendors.length; i++) {
    const x = a.vendors[i]
    const y = b.vendors[i]
    if (x.sponsorId !== y.sponsorId || x.toAttendees !== y.toAttendees || x.toSpeakers !== y.toSpeakers) return false
  }
  if (a.staff.length !== b.staff.length) return false
  for (let i = 0; i < a.staff.length; i++) {
    const x = a.staff[i]
    const y = b.staff[i]
    if (x.userId !== y.userId || x.toAttendees !== y.toAttendees || x.toVendors !== y.toVendors || x.toSpeakers !== y.toSpeakers)
      return false
  }
  return true
}

function cloneData(d: ChatSettingsData): ChatSettingsData {
  return {
    vendorGlobal: { ...d.vendorGlobal },
    vendors: d.vendors.map(v => ({ ...v })),
    staff: d.staff.map(s => ({ ...s })),
  }
}

export function ChatSettingsPanel({
  initialData,
  canEdit,
  onDirtyChange,
  registerDiscard,
}: {
  initialData: ChatSettingsData
  canEdit: boolean
  onDirtyChange?: (dirty: boolean) => void
  registerDiscard?: (fn: () => void) => void
}) {
  const [snapshot, setSnapshot] = useState<ChatSettingsData>(() => cloneData(initialData))
  const [draft, setDraft] = useState<ChatSettingsData>(() => cloneData(initialData))
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [vendorQuery, setVendorQuery] = useState('')
  const [staffQuery, setStaffQuery] = useState('')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const dirty = useMemo(() => !sameData(draft, snapshot), [draft, snapshot])
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const discard = useCallback(() => {
    setDraft(cloneData(snapshot))
    setStatus('idle')
    setErrorMsg('')
  }, [snapshot])
  useEffect(() => {
    registerDiscard?.(discard)
  }, [registerDiscard, discard])

  // Warn before a full page unload while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  const busy = status === 'saving'
  const vendorGlobalOn = draft.vendorGlobal.enabled

  function markTouched() {
    if (status === 'saved') setStatus('idle')
  }

  function setVendorGlobal(enabled: boolean) {
    if (!canEdit) return
    setDraft(prev => ({ ...cloneData(prev), vendorGlobal: { enabled } }))
    markTouched()
  }
  function setVendorField(sponsorId: string, field: 'toAttendees' | 'toSpeakers', value: boolean) {
    if (!canEdit) return
    setDraft(prev => {
      const next = cloneData(prev)
      const row = next.vendors.find(v => v.sponsorId === sponsorId)
      if (row) row[field] = value
      return next
    })
    markTouched()
  }
  function setStaffField(userId: string, field: 'toAttendees' | 'toVendors' | 'toSpeakers', value: boolean) {
    if (!canEdit) return
    setDraft(prev => {
      const next = cloneData(prev)
      const row = next.staff.find(s => s.userId === userId)
      if (row) row[field] = value
      return next
    })
    markTouched()
  }

  const filteredVendors = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase()
    if (!q) return draft.vendors
    return draft.vendors.filter(v => v.name.toLowerCase().includes(q))
  }, [draft.vendors, vendorQuery])

  const filteredStaff = useMemo(() => {
    const q = staffQuery.trim().toLowerCase()
    if (!q) return draft.staff
    return draft.staff.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
  }, [draft.staff, staffQuery])

  async function save() {
    setStatus('saving')
    setErrorMsg('')

    // Send only what changed.
    const vendorGlobal =
      draft.vendorGlobal.enabled !== snapshot.vendorGlobal.enabled ? { enabled: draft.vendorGlobal.enabled } : undefined

    const snapVendors = new Map(snapshot.vendors.map(v => [v.sponsorId, v]))
    const vendors = draft.vendors
      .filter(v => {
        const prev = snapVendors.get(v.sponsorId)
        return !prev || prev.toAttendees !== v.toAttendees || prev.toSpeakers !== v.toSpeakers
      })
      .map(v => ({ sponsorId: v.sponsorId, toAttendees: v.toAttendees, toSpeakers: v.toSpeakers }))

    const snapStaff = new Map(snapshot.staff.map(s => [s.userId, s]))
    const staff = draft.staff
      .filter(s => {
        const prev = snapStaff.get(s.userId)
        return !prev || prev.toAttendees !== s.toAttendees || prev.toVendors !== s.toVendors || prev.toSpeakers !== s.toSpeakers
      })
      .map(s => ({ userId: s.userId, toAttendees: s.toAttendees, toVendors: s.toVendors, toSpeakers: s.toSpeakers }))

    try {
      const res = await fetch('/api/chat/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorGlobal, vendors, staff }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErrorMsg(d.error ?? 'Couldn’t save chat settings. Your changes weren’t applied.')
        setStatus('error')
        setTimeout(() => errorRef.current?.focus(), 0)
        return
      }
      const body = (await res.json().catch(() => null)) as (ChatSettingsData & { ok?: boolean }) | null
      // Trust the server-normalized view when present, else our optimistic draft.
      const next: ChatSettingsData = body?.vendors && body?.staff
        ? { vendorGlobal: body.vendorGlobal, vendors: body.vendors, staff: body.staff }
        : cloneData(draft)
      setSnapshot(cloneData(next))
      setDraft(cloneData(next))
      setStatus('saved')
      savedTimer.current = setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 3000)
    } catch {
      setErrorMsg('Network error — chat settings weren’t saved.')
      setStatus('error')
      setTimeout(() => errorRef.current?.focus(), 0)
    }
  }

  const showSaveBar = canEdit && (dirty || status === 'saving' || status === 'saved')

  return (
    <div className="max-w-4xl space-y-6 pb-24">
      <p className="text-sm text-ink-2 max-w-2xl">
        Control who can start new conversations. These rules apply when a vendor or staff member sends a
        friend request or opens a new direct message — existing conversations are never interrupted.
      </p>

      {!canEdit && (
        <div role="status" className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 border border-brand/30 rounded-xl">
          <InfoIcon className="w-4 h-4 text-brand flex-shrink-0" />
          <p className="text-sm text-brand-700">You’re viewing chat settings in read-only mode.</p>
        </div>
      )}

      {status === 'error' && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="flex items-center justify-between gap-2 px-4 py-2.5 bg-danger-soft border border-danger/30 rounded-xl focus:outline-none"
        >
          <p className="text-sm text-danger-ink">{errorMsg}</p>
          <button onClick={() => setStatus(dirty ? 'idle' : 'idle')} className="text-danger hover:text-danger-ink" aria-label="Dismiss error">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── 1. Master vendor switch ─────────────────────────────────────────── */}
      <section className="bg-white border border-hairline rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id="vendor-global-label" className="text-headline text-ink flex items-center gap-2">
              <StorefrontIcon className="w-[18px] h-[18px] text-brand" />
              Vendor messaging
            </h2>
            <p className="text-sm text-ink-2 mt-0.5">
              Master switch for all vendor friend &amp; message requests to attendees and speakers. Turn this off to
              silence every vendor at once, regardless of the per-vendor rules below.
            </p>
          </div>
          <Switch checked={vendorGlobalOn} disabled={!canEdit || busy} labelledBy="vendor-global-label" onChange={setVendorGlobal} size="lg" />
        </div>
        {!vendorGlobalOn && (
          <div className="px-5 py-2.5 bg-warning-soft border-t border-warning/20 flex items-center gap-2">
            <WarnIcon className="w-4 h-4 text-warning-ink flex-shrink-0" />
            <p className="text-caption text-warning-ink">
              All vendors are currently blocked from messaging attendees and speakers. Per-vendor rules are paused
              until this is turned back on.
            </p>
          </div>
        )}
      </section>

      {/* ── 2. Per-vendor rules ─────────────────────────────────────────────── */}
      <MatrixSection
        title="Per-vendor permissions"
        icon={<StorefrontIcon className="w-[18px] h-[18px] text-brand" />}
        subtitle="Allow each vendor to send one friend request and message to attendees and/or speakers."
        columns={['Attendees', 'Speakers']}
        search={{ value: vendorQuery, onChange: setVendorQuery, placeholder: 'Search vendors…' }}
        dimmed={!vendorGlobalOn}
        dimNote={!vendorGlobalOn ? 'Turn on vendor messaging above to configure individual vendors.' : undefined}
        emptyLabel={draft.vendors.length === 0 ? 'No vendors yet.' : 'No vendors match your search.'}
        rows={filteredVendors.map(v => ({
          key: v.sponsorId,
          leading: (
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-fill border border-hairline grid place-items-center overflow-hidden">
                <SponsorLogo
                  name={v.name}
                  logoUrl={v.logoUrl}
                  className="w-full h-full object-contain p-1"
                  fallbackClassName="text-ink-2 font-semibold text-xs"
                />
                <span aria-hidden="true" style={{ display: 'none' }} className="text-ink-2 font-semibold text-xs">
                  {initials(v.name)}
                </span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{v.name}</p>
                <span className={`inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${TIER_BADGE[v.tier] ?? 'bg-fill text-ink-2'}`}>
                  {v.tier}
                </span>
              </div>
            </div>
          ),
          labelId: `vendor-${v.sponsorId}-name`,
          cells: [
            <Switch
              key="a"
              checked={v.toAttendees}
              disabled={!canEdit || busy || !vendorGlobalOn}
              labelledBy={`vendor-${v.sponsorId}-name col-vendor-attendees`}
              onChange={next => setVendorField(v.sponsorId, 'toAttendees', next)}
            />,
            <Switch
              key="s"
              checked={v.toSpeakers}
              disabled={!canEdit || busy || !vendorGlobalOn}
              labelledBy={`vendor-${v.sponsorId}-name col-vendor-speakers`}
              onChange={next => setVendorField(v.sponsorId, 'toSpeakers', next)}
            />,
          ],
        }))}
        columnIds={['col-vendor-attendees', 'col-vendor-speakers']}
      />

      {/* ── 3. Per-staff rules ──────────────────────────────────────────────── */}
      <MatrixSection
        title="WBR staff permissions"
        icon={<ShieldIcon className="w-[18px] h-[18px] text-brand" />}
        subtitle="Allow each staff member to send friend requests and messages to attendees, vendors and/or speakers."
        columns={['Attendees', 'Vendors', 'Speakers']}
        search={{ value: staffQuery, onChange: setStaffQuery, placeholder: 'Search staff…' }}
        emptyLabel={draft.staff.length === 0 ? 'No staff members yet.' : 'No staff match your search.'}
        rows={filteredStaff.map(s => ({
          key: s.userId,
          leading: (
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex-shrink-0 w-9 h-9 rounded-full bg-fill text-ink-2 grid place-items-center text-xs font-semibold">
                {initials(s.name)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{s.name}</p>
                <p className="text-caption text-ink-3 truncate">{s.email}</p>
              </div>
            </div>
          ),
          labelId: `staff-${s.userId}-name`,
          cells: [
            <Switch
              key="a"
              checked={s.toAttendees}
              disabled={!canEdit || busy}
              labelledBy={`staff-${s.userId}-name col-staff-attendees`}
              onChange={next => setStaffField(s.userId, 'toAttendees', next)}
            />,
            <Switch
              key="v"
              checked={s.toVendors}
              disabled={!canEdit || busy}
              labelledBy={`staff-${s.userId}-name col-staff-vendors`}
              onChange={next => setStaffField(s.userId, 'toVendors', next)}
            />,
            <Switch
              key="s"
              checked={s.toSpeakers}
              disabled={!canEdit || busy}
              labelledBy={`staff-${s.userId}-name col-staff-speakers`}
              onChange={next => setStaffField(s.userId, 'toSpeakers', next)}
            />,
          ],
        }))}
        columnIds={['col-staff-attendees', 'col-staff-vendors', 'col-staff-speakers']}
      />

      {/* ── Sticky save bar ─────────────────────────────────────────────────── */}
      {showSaveBar && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(56rem,calc(100vw-3rem))] flex items-center justify-between gap-3 bg-white border border-hairline rounded-2xl shadow-pop px-4 py-3">
          {status === 'saved' ? (
            <span role="status" className="flex items-center gap-1.5 text-sm text-success-ink">
              <CheckIcon className="w-4 h-4" />
              All changes saved
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-ink-2">
              <span className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />
              Unsaved changes
            </span>
          )}
          <div className="flex items-center gap-2">
            {status !== 'saved' && (
              <button type="button" onClick={discard} disabled={busy} className="btn-secondary">
                Discard
              </button>
            )}
            {status !== 'saved' && (
              <button type="button" onClick={save} disabled={busy || !dirty} className="btn-primary">
                {busy && <Spinner />}
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reusable matrix section (search + column headers + rows of switches) ─────
type MatrixRow = { key: string; leading: React.ReactNode; labelId: string; cells: React.ReactNode[] }
function MatrixSection({
  title,
  subtitle,
  icon,
  columns,
  columnIds,
  rows,
  search,
  dimmed,
  dimNote,
  emptyLabel,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  columns: string[]
  columnIds: string[]
  rows: MatrixRow[]
  search: { value: string; onChange: (v: string) => void; placeholder: string }
  dimmed?: boolean
  dimNote?: string
  emptyLabel: string
}) {
  return (
    <section className="bg-white border border-hairline rounded-2xl shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-hairline">
        <h2 className="text-headline text-ink flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <p className="text-sm text-ink-2 mt-0.5">{subtitle}</p>
        {dimNote && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-fill rounded-xl">
            <InfoIcon className="w-4 h-4 text-ink-3 flex-shrink-0" />
            <p className="text-caption text-ink-2">{dimNote}</p>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-b border-hairline">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
          <input
            type="search"
            value={search.value}
            onChange={e => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="w-full pl-9 pr-3 py-2 text-sm bg-fill border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white focus:border-hairline transition-colors"
          />
        </div>
      </div>

      <div className={`overflow-x-auto ${dimmed ? 'opacity-50' : ''}`}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-hairline">
              <th className="py-2.5 px-5 text-left" />
              {columns.map((c, i) => (
                <th
                  key={c}
                  id={columnIds[i]}
                  scope="col"
                  className="py-2.5 px-3 text-center text-caption font-semibold uppercase tracking-wide text-ink-2 w-[84px]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-5 py-10 text-center text-sm text-ink-3">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.key} className="hover:bg-fill/60 transition-colors">
                  <th scope="row" id={row.labelId} className="px-5 py-2.5 text-left font-normal">
                    {row.leading}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="px-3 py-2.5 text-center">
                      <span className="inline-flex justify-center w-full">{cell}</span>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Inline icons (stroke, HIG-weight) ───────────────────────────────────────
function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function WarnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m0 3.75h.008M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  )
}
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m21 21-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
    </svg>
  )
}
function StorefrontIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 21V9.349m16.5 11.651V9.349M3.75 9.349a3 3 0 0 0 4.125-.35 3 3 0 0 0 4.125.35 3 3 0 0 0 4.125-.35 3 3 0 0 0 4.125.35M3.75 9.349V4.5A1.5 1.5 0 0 1 5.25 3h13.5a1.5 1.5 0 0 1 1.5 1.5v4.849M8.25 21v-4.5a1.5 1.5 0 0 1 1.5-1.5h1.5a1.5 1.5 0 0 1 1.5 1.5V21M3 21h18" />
    </svg>
  )
}
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.96 11.96 0 0 1 3.598 6 12 12 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622A12 12 0 0 0 20.4 6 11.96 11.96 0 0 1 12 2.714Z" />
    </svg>
  )
}
