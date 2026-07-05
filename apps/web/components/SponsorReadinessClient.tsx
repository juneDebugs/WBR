'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { healthBarFill, healthTextColor, missingBarFill } from '@/lib/health-color'

const TIER_COLOR: Record<string, string> = {
  PLATINUM: 'bg-brand-100 text-brand-700',
  GOLD:     'bg-warning-soft text-warning-ink',
  SILVER:   'bg-fill text-ink-2',
  BRONZE:   'bg-orange-100 text-orange-700',
}

// Readiness bars use the red→yellow→green health scale (red = bad, yellow = ok,
// green = excellent) from lib/health-color — see that module for the thresholds.
function Bar({ pct, height = 'h-1.5' }: { pct: number; height?: string }) {
  return (
    <div className={`w-full bg-fill rounded-full ${height} overflow-hidden`}>
      <div className={`${height} rounded-full transition-all duration-500`} style={healthBarFill(pct)} />
    </div>
  )
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-fill rounded-xl p-4 flex flex-col gap-1">
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs font-medium text-ink">{label}</span>
      {sub && <span className="text-xs text-ink-2">{sub}</span>}
    </div>
  )
}

export function SponsorReadinessClient({ sponsors, metrics }: {
  sponsors: any[]
  metrics: {
    totalSponsors: number; avgPct: number; fullyReady: number;
    inProgress: number; notStarted: number;
    topMissing: { label: string; count: number; pct: number }[]
    tierBreakdown: { tier: string; count: number; avg: number }[]
  }
}) {
  const [expanded, setExpanded] = useState(false)
  const [drafting, setDrafting] = useState<string | null>(null)   // sponsorId being drafted
  const [reminded, setReminded] = useState<Set<string>>(new Set())
  const [sendingAll, setSendingAll] = useState(false)
  const [allSent, setAllSent] = useState(false)
  const [sentModal, setSentModal] = useState<{ sponsor: any; body: string } | null>(null)

  // Draft compose modal state
  const [composeModal, setComposeModal] = useState<{
    sponsorId: string; sponsor: any;
    subject: string; body: string;
  } | null>(null)
  const [sending, setSending] = useState(false)

  // Step 1: fetch draft and open compose modal
  async function openReminder(sponsorId: string) {
    setDrafting(sponsorId)
    try {
      const res = await fetch('/api/sponsors/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorId, draftOnly: true }),
      })
      const data = await res.json()
      const sponsor = sponsors.find(s => s.id === sponsorId)
      setComposeModal({
        sponsorId,
        sponsor,
        subject: `Action Required: Complete your WBR 2027 Sponsor Profile (${data.pct}% done)`,
        body: data.preview,
      })
    } finally {
      setDrafting(null)
    }
  }

  // Step 2: send the (possibly edited) email
  async function sendReminder() {
    if (!composeModal) return
    setSending(true)
    try {
      await fetch('/api/sponsors/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorId: composeModal.sponsorId,
          subject: composeModal.subject,
          body: composeModal.body,
        }),
      })
      setReminded(prev => new Set([...prev, composeModal.sponsorId]))
      setSentModal({ sponsor: composeModal.sponsor, body: composeModal.body })
      setComposeModal(null)
    } finally {
      setSending(false)
    }
  }

  async function sendAllReminders() {
    setSendingAll(true)
    const incomplete = sponsors.filter(s => s.pct < 100)
    for (const s of incomplete) {
      await fetch('/api/sponsors/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorId: s.id }),
      })
      setReminded(prev => new Set([...prev, s.id]))
    }
    setSendingAll(false)
    setAllSent(true)
    setTimeout(() => setAllSent(false), 4000)
  }

  const incomplete = sponsors.filter(s => s.pct < 100)

  return (
    <div className="bg-white border border-hairline rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-left">
            <h2 className="font-semibold text-ink leading-tight">Sponsor Asset Readiness</h2>
            <p className="text-xs text-ink-2">{metrics.totalSponsors} sponsors · avg {metrics.avgPct}% complete</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!expanded && (
            <div className="flex items-center gap-2">
              <Bar pct={metrics.avgPct} height="h-2" />
            </div>
          )}
          <button onClick={() => setExpanded(e => !e)}
            className="btn-primary btn-sm">
            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          {incomplete.length > 0 && (
            <button onClick={sendAllReminders} disabled={sendingAll || allSent}
              className="btn-primary btn-sm">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {allSent ? 'All Sent ✓' : sendingAll ? 'Sending…' : `Remind All (${incomplete.length})`}
            </button>
          )}
        </div>
      </div>

      {/* MINIMIZED: summary metrics */}
      {!expanded && (
        <div className="p-5 space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Avg Completion" value={`${metrics.avgPct}%`} color={metrics.avgPct >= 80 ? 'text-success-ink' : metrics.avgPct >= 50 ? 'text-warning-ink' : 'text-danger-ink'} />
            <MetricCard label="Fully Ready" value={metrics.fullyReady} sub={`of ${metrics.totalSponsors} sponsors`} color="text-brand-700" />
            <MetricCard label="In Progress" value={metrics.inProgress} sub="partially complete" color="text-brand" />
            <MetricCard label="Not Started" value={metrics.notStarted} sub="0% complete" color="text-danger" />
          </div>

          {/* Overall progress bar */}
          <div>
            <div className="flex justify-between text-xs text-ink-2 mb-1.5">
              <span>Overall readiness</span>
              <span className="font-semibold" style={{ color: healthTextColor(metrics.avgPct) }}>{metrics.avgPct}%</span>
            </div>
            <div className="w-full bg-fill rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full transition-all duration-700"
                style={healthBarFill(metrics.avgPct)} />
            </div>
          </div>

          {/* Most missing */}
          <div>
            <p className="text-xs font-semibold text-ink mb-2">Most commonly missing items</p>
            <div className="space-y-2">
              {metrics.topMissing.map(({ label, count, pct }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-ink-2 w-40 flex-shrink-0 truncate">{label}</span>
                  <div className="flex-1 bg-fill rounded-full h-2">
                    {/* Length = how many miss it; color = health (100−missing). Booth number is pinned full-width green. */}
                  <div className="h-2 rounded-full" style={missingBarFill(label, pct)} />
                  </div>
                  <span className="text-xs text-ink-2 w-16 text-right flex-shrink-0">{count} sponsor{count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tier breakdown */}
          <div>
            <p className="text-xs font-semibold text-ink mb-2">Avg completion by tier</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {metrics.tierBreakdown.map(({ tier, count, avg }) => (
                <div key={tier} className="bg-fill rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TIER_COLOR[tier]}`}>{tier}</span>
                    <span className="text-xs text-ink-2">{count}</span>
                  </div>
                  <Bar pct={avg} height="h-2" />
                  <span className="text-sm font-bold mt-1 block" style={{ color: healthTextColor(avg) }}>{avg}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* EXPANDED: full sponsor list */}
      {expanded && (
        <>
          {/* Sub-header with stats */}
          <div className="px-5 py-2.5 bg-fill border-b border-hairline flex flex-wrap gap-4 text-xs">
            <span className="text-brand-700 font-semibold">{metrics.fullyReady} complete</span>
            <span className="text-brand font-semibold">{metrics.inProgress} in progress</span>
            <span className="text-danger font-semibold">{metrics.notStarted} not started</span>
            <span className="text-ink-2 ml-auto">avg {metrics.avgPct}% across all sponsors</span>
          </div>

          {/* Most missing banner */}
          {metrics.topMissing.length > 0 && (
            <div className="px-5 py-2.5 bg-warning-soft border-b border-warning/30 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-warning-ink flex-shrink-0">Most missing:</span>
              {metrics.topMissing.slice(0, 3).map(({ label, count }) => (
                <span key={label} className="text-xs bg-white border border-warning/30 text-warning-ink rounded-full px-2.5 py-0.5 font-medium">
                  {label} <span className="opacity-60">({count})</span>
                </span>
              ))}
            </div>
          )}

          {/* Sponsor list */}
          <div className="divide-y divide-hairline max-h-[600px] overflow-y-auto">
            {sponsors.map(s => {
              const isReminded = reminded.has(s.id)
              const isReminding = drafting === s.id
              const missing = s.results.filter((r: any) => !r.done)
              return (
                <div key={s.id} className="px-5 py-4 hover:bg-fill/70 transition-colors">
                  <div className="flex items-start gap-3">
                    {/* Logo */}
                    {s.logoUrl ? (
                      <Image src={s.logoUrl} alt="" width={32} height={32} className="w-8 h-8 object-contain rounded border border-hairline bg-white flex-shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-fill flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-ink-2">{s.name[0]}</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Name row */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Link href={`/dashboard/sponsors/${s.id}`}
                          className="text-sm font-semibold text-ink hover:text-brand-700 transition-colors">
                          {s.name}
                        </Link>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${TIER_COLOR[s.tier] ?? 'bg-fill text-ink-2'}`}>
                          {s.tier}
                        </span>
                        <span className="text-xs font-bold ml-auto flex-shrink-0" style={{ color: healthTextColor(s.pct) }}>
                          {s.pct}% <span className="font-normal text-ink-2">({s.done}/{s.total})</span>
                        </span>
                      </div>

                      {/* Progress bar */}
                      <Bar pct={s.pct} height="h-1.5" />

                      {/* Checklist chips */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.results.map((r: any) => (
                          <span key={r.key}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium leading-tight ${
                              r.done ? 'bg-brand-50 text-brand-700' : 'bg-danger-soft text-danger-ink'
                            }`}>
                            {r.done ? '✓' : '✗'} {r.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Remind button */}
                    {s.pct < 100 && (
                      <button onClick={() => openReminder(s.id)}
                        disabled={drafting === s.id || isReminded}
                        title={s.contactEmail ? `Send reminder to ${s.contactEmail}` : 'No contact email'}
                        className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors mt-0.5 ${
                          isReminded
                            ? 'bg-success-soft text-success-ink border-success/30'
                            : 'bg-white text-ink-2 border-hairline hover:border-brand/30 hover:text-brand-700 hover:bg-brand-50'
                        } disabled:opacity-60`}>
                        {isReminded ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Sent
                          </>
                        ) : drafting === s.id ? (
                          '…'
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Remind
                          </>
                        )}
                      </button>
                    )}
                    {s.pct === 100 && (
                      <span className="flex-shrink-0 text-xs text-brand-700 font-semibold mt-0.5">✓ Ready</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-hairline bg-fill flex items-center justify-between">
            <div className="flex gap-4 text-xs text-ink-2">
              <span>Overall avg: <strong style={{ color: healthTextColor(metrics.avgPct) }}>{metrics.avgPct}%</strong></span>
              <span>{metrics.totalSponsors} total sponsors</span>
            </div>
            <Link href="/dashboard/sponsors" className="text-xs text-brand-700 hover:underline">Manage sponsors →</Link>
          </div>
        </>
      )}

      {/* Compose / edit modal */}
      {composeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !sending && setComposeModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-hairline flex-shrink-0">
              <div>
                <h3 className="font-semibold text-ink">Edit Reminder Email</h3>
                <p className="text-xs text-ink-2 mt-0.5">
                  To: <span className="font-medium text-ink">{composeModal.sponsor?.contactEmail ?? '(no email on file)'}</span>
                  {' · '}{composeModal.sponsor?.name}
                </p>
              </div>
              <button onClick={() => setComposeModal(null)} disabled={sending} aria-label="Close"
                className="text-ink-2 hover:text-ink disabled:opacity-40">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Subject line */}
            <div className="px-6 py-3 border-b border-hairline flex-shrink-0">
              <label className="text-xs text-ink-2 font-medium block mb-1">Subject</label>
              <input
                className="w-full text-sm text-ink bg-fill border border-hairline rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                value={composeModal.subject}
                onChange={e => setComposeModal(m => m ? { ...m, subject: e.target.value } : m)}
              />
            </div>

            {/* Body editor */}
            <div className="px-6 py-4 flex-1 min-h-0 flex flex-col">
              <label className="text-xs text-ink-2 font-medium block mb-1">Message</label>
              <textarea
                className="flex-1 w-full text-sm text-ink bg-fill border border-hairline rounded-xl px-4 py-3 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand min-h-[280px]"
                value={composeModal.body}
                onChange={e => setComposeModal(m => m ? { ...m, body: e.target.value } : m)}
              />
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-hairline flex items-center justify-between flex-shrink-0 gap-3">
              <p className="text-xs text-ink-2">Changes are only applied to this send — the default template is not modified.</p>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setComposeModal(null)} disabled={sending}
                  className="btn-secondary text-sm px-4 py-2 disabled:opacity-40">
                  Cancel
                </button>
                <button onClick={sendReminder} disabled={sending}
                  className="btn-primary">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {sending ? 'Sending…' : 'Send Reminder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sent confirmation modal */}
      {sentModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setSentModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-center"
            onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto bg-brand-gradient">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-ink">Reminder sent!</h3>
              <p className="text-sm text-ink-2 mt-1">
                Email dispatched to <span className="font-medium text-ink">{sentModal.sponsor?.contactEmail}</span>
              </p>
            </div>
            <button onClick={() => setSentModal(null)}
              className="btn-primary w-full">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
