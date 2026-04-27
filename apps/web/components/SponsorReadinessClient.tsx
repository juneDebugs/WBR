'use client'
import { useState } from 'react'
import Link from 'next/link'

const TIER_COLOR: Record<string, string> = {
  PLATINUM: 'bg-violet-100 text-violet-700',
  GOLD:     'bg-amber-100 text-amber-700',
  SILVER:   'bg-gray-100 text-gray-600',
  BRONZE:   'bg-orange-100 text-orange-700',
}

// Pink → violet → indigo → blue gradient across completion %
function scoreColor(pct: number) {
  if (pct === 100) return '#3b82f6'  // blue — complete
  if (pct >= 75)  return '#6366f1'   // indigo — nearly there
  if (pct >= 50)  return '#8b5cf6'   // violet — halfway
  if (pct >= 25)  return '#d946ef'   // fuchsia — early progress
  return '#ec4899'                    // pink — not started / low
}

// Gradient fill for larger bars
function barGradient(pct: number) {
  if (pct === 0) return '#f9a8d4'
  if (pct === 100) return 'linear-gradient(90deg, #a855f7 0%, #6366f1 50%, #3b82f6 100%)'
  if (pct >= 75) return 'linear-gradient(90deg, #d946ef 0%, #6366f1 60%, #3b82f6 100%)'
  if (pct >= 50) return 'linear-gradient(90deg, #ec4899 0%, #a855f7 60%, #6366f1 100%)'
  if (pct >= 25) return 'linear-gradient(90deg, #ec4899 0%, #d946ef 100%)'
  return 'linear-gradient(90deg, #f472b6 0%, #ec4899 100%)'
}

function Bar({ pct, height = 'h-1.5', gradient = false }: { pct: number; height?: string; gradient?: boolean }) {
  return (
    <div className={`w-full bg-gray-100 rounded-full ${height} overflow-hidden`}>
      <div className={`${height} rounded-full transition-all duration-500`}
        style={{
          width: `${pct}%`,
          background: gradient ? barGradient(pct) : scoreColor(pct),
        }} />
    </div>
  )
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-1">
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs font-medium text-gray-700">{label}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
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
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-2 group">
            <div className="text-left">
              <h2 className="font-semibold text-gray-900 leading-tight">Sponsor Asset Readiness</h2>
              <p className="text-xs text-gray-400">{metrics.totalSponsors} sponsors · avg {metrics.avgPct}% complete</p>
            </div>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 bg-pink-50 group-hover:bg-pink-100 border border-pink-200`}>
              <svg className={`w-5 h-5 text-pink-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!expanded && (
            <div className="flex items-center gap-2">
              <Bar pct={metrics.avgPct} height="h-2" gradient />
              <span className="text-sm font-bold" style={{ color: scoreColor(metrics.avgPct) }}>{metrics.avgPct}%</span>
            </div>
          )}
          {incomplete.length > 0 && (
            <button onClick={sendAllReminders} disabled={sendingAll || allSent}
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center gap-1.5">
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
            <MetricCard label="Avg Completion" value={`${metrics.avgPct}%`} color={metrics.avgPct >= 70 ? 'text-emerald-600' : 'text-amber-600'} />
            <MetricCard label="Fully Ready" value={metrics.fullyReady} sub={`of ${metrics.totalSponsors} sponsors`} color="text-blue-600" />
            <MetricCard label="In Progress" value={metrics.inProgress} sub="partially complete" color="text-violet-600" />
            <MetricCard label="Not Started" value={metrics.notStarted} sub="0% complete" color="text-pink-500" />
          </div>

          {/* Overall progress bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Overall readiness</span>
              <span className="font-semibold" style={{ color: scoreColor(metrics.avgPct) }}>{metrics.avgPct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full transition-all duration-700"
                style={{ width: `${metrics.avgPct}%`, background: barGradient(metrics.avgPct) }} />
            </div>
          </div>

          {/* Most missing */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Most commonly missing items</p>
            <div className="space-y-2">
              {metrics.topMissing.map(({ label, count, pct }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-40 flex-shrink-0 truncate">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #ec4899 0%, #a855f7 100%)' }} />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0">{count} sponsor{count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tier breakdown */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Avg completion by tier</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {metrics.tierBreakdown.map(({ tier, count, avg }) => (
                <div key={tier} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TIER_COLOR[tier]}`}>{tier}</span>
                    <span className="text-xs text-gray-400">{count}</span>
                  </div>
                  <Bar pct={avg} height="h-2" gradient />
                  <span className="text-sm font-bold mt-1 block" style={{ color: scoreColor(avg) }}>{avg}%</span>
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
          <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 text-xs">
            <span className="text-blue-600 font-semibold">{metrics.fullyReady} complete</span>
            <span className="text-violet-600 font-semibold">{metrics.inProgress} in progress</span>
            <span className="text-pink-500 font-semibold">{metrics.notStarted} not started</span>
            <span className="text-gray-400 ml-auto">avg {metrics.avgPct}% across all sponsors</span>
          </div>

          {/* Most missing banner */}
          {metrics.topMissing.length > 0 && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-amber-700 flex-shrink-0">Most missing:</span>
              {metrics.topMissing.slice(0, 3).map(({ label, count }) => (
                <span key={label} className="text-xs bg-white border border-amber-200 text-amber-700 rounded-full px-2.5 py-0.5 font-medium">
                  {label} <span className="opacity-60">({count})</span>
                </span>
              ))}
            </div>
          )}

          {/* Sponsor list */}
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {sponsors.map(s => {
              const isReminded = reminded.has(s.id)
              const isReminding = drafting === s.id
              const missing = s.results.filter((r: any) => !r.done)
              return (
                <div key={s.id} className="px-5 py-4 hover:bg-gray-50/70 transition-colors">
                  <div className="flex items-start gap-3">
                    {/* Logo */}
                    {s.logoUrl ? (
                      <img src={s.logoUrl} alt="" loading="lazy" className="w-8 h-8 object-contain rounded border border-gray-100 bg-white flex-shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-gray-400">{s.name[0]}</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Name row */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Link href={`/dashboard/sponsors/${s.id}`}
                          className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
                          {s.name}
                        </Link>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${TIER_COLOR[s.tier] ?? 'bg-gray-100 text-gray-600'}`}>
                          {s.tier}
                        </span>
                        <span className="text-xs font-bold ml-auto flex-shrink-0" style={{ color: scoreColor(s.pct) }}>
                          {s.pct}% <span className="font-normal text-gray-400">({s.done}/{s.total})</span>
                        </span>
                      </div>

                      {/* Progress bar */}
                      <Bar pct={s.pct} height="h-1.5" gradient />

                      {/* Checklist chips */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.results.map((r: any) => (
                          <span key={r.key}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium leading-tight ${
                              r.done ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-600'
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
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
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
                      <span className="flex-shrink-0 text-xs text-blue-600 font-semibold mt-0.5">✓ Ready</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="flex gap-4 text-xs text-gray-500">
              <span>Overall avg: <strong style={{ color: scoreColor(metrics.avgPct) }}>{metrics.avgPct}%</strong></span>
              <span>{metrics.totalSponsors} total sponsors</span>
            </div>
            <Link href="/dashboard/sponsors" className="text-xs text-indigo-600 hover:underline">Manage sponsors →</Link>
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900">Edit Reminder Email</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  To: <span className="font-medium text-gray-700">{composeModal.sponsor?.contactEmail ?? '(no email on file)'}</span>
                  {' · '}{composeModal.sponsor?.name}
                </p>
              </div>
              <button onClick={() => setComposeModal(null)} disabled={sending}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Subject line */}
            <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
              <label className="text-xs text-gray-500 font-medium block mb-1">Subject</label>
              <input
                className="w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-400"
                value={composeModal.subject}
                onChange={e => setComposeModal(m => m ? { ...m, subject: e.target.value } : m)}
              />
            </div>

            {/* Body editor */}
            <div className="px-6 py-4 flex-1 min-h-0 flex flex-col">
              <label className="text-xs text-gray-500 font-medium block mb-1">Message</label>
              <textarea
                className="flex-1 w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-400 min-h-[280px]"
                value={composeModal.body}
                onChange={e => setComposeModal(m => m ? { ...m, body: e.target.value } : m)}
              />
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 gap-3">
              <p className="text-xs text-gray-400">Changes are only applied to this send — the default template is not modified.</p>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setComposeModal(null)} disabled={sending}
                  className="btn-secondary text-sm px-4 py-2 disabled:opacity-40">
                  Cancel
                </button>
                <button onClick={sendReminder} disabled={sending}
                  className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #ec4899 0%, #6366f1 100%)' }}>
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
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
              style={{ background: 'linear-gradient(135deg, #ec4899 0%, #6366f1 100%)' }}>
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Reminder sent!</h3>
              <p className="text-sm text-gray-500 mt-1">
                Email dispatched to <span className="font-medium text-gray-700">{sentModal.sponsor?.contactEmail}</span>
              </p>
            </div>
            <button onClick={() => setSentModal(null)}
              className="w-full text-sm px-4 py-2 rounded-lg font-medium text-white"
              style={{ background: 'linear-gradient(135deg, #ec4899 0%, #6366f1 100%)' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
