'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

import { EmailThreadPanel } from './EmailThreadPanel'

export interface EmailUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: string
  company: string | null
  jobTitle: string | null
  emailCount: number
  isSponsor: boolean
  missingProfile: string[]
  missingAssets: string[]
}

export interface EmailLogEntry {
  id: string
  to: string
  subject: string
  body: string
  status: string       // SENT | FAILED
  direction: string    // OUTBOUND | INBOUND
  sentAt: string
  sponsorName: string | null
  sponsorTier: string | null
}

interface Props {
  users: EmailUser[]
  emails: EmailLogEntry[]
}

// Role avatars — brand for internal roles, neutral for attendees (single accent).
const ROLE_GRADIENT: Record<string, string> = {
  STAFF:    '#4f46e5', // brand-600
  SPEAKER:  '#6366f1', // brand-500
  ATTENDEE: '#8e8e93', // ink-3 (neutral)
}

const ROLE_CHIP: Record<string, { bg: string; text: string }> = {
  STAFF:    { bg: '#eef2ff', text: '#4338ca' }, // brand
  SPEAKER:  { bg: '#eef2ff', text: '#6366f1' }, // brand (lighter text)
  ATTENDEE: { bg: '#f2f2f7', text: '#6e6e73' }, // neutral
}

function barGradient(pct: number) {
  // Brand indigo ramp — deeper = more complete (single accent family, HIG).
  if (pct === 0) return '#c7d2fe'   // brand-200
  if (pct === 100) return '#4f46e5' // brand-600
  if (pct >= 75) return '#6366f1'   // brand-500
  if (pct >= 50) return '#818cf8'   // brand-400
  if (pct >= 25) return '#a5b4fc'   // brand-300
  return '#c7d2fe'                   // brand-200
}

function assetGradient(pct: number) {
  // Brand indigo ramp — deeper = more complete (single accent family, HIG).
  if (pct === 0) return '#c7d2fe'   // brand-200
  if (pct === 100) return '#4f46e5' // brand-600
  if (pct >= 75) return '#6366f1'   // brand-500
  if (pct >= 50) return '#818cf8'   // brand-400
  if (pct >= 25) return '#a5b4fc'   // brand-300
  return '#c7d2fe'                   // brand-200
}

const TIER_CHIP: Record<string, { bg: string; text: string }> = {
  PLATINUM: { bg: '#f1f5f9', text: '#475569' },
  GOLD:     { bg: '#fef9c3', text: '#92400e' },
  SILVER:   { bg: '#f8fafc', text: '#64748b' },
  BRONZE:   { bg: '#fff7ed', text: '#9a3412' },
}

export function EmailClient({ users, emails }: Props) {
  const [search, setSearch] = useState('')
  const [compose, setCompose] = useState<EmailUser | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [localEmails, setLocalEmails] = useState<EmailLogEntry[]>(emails)
  const [threadUser, setThreadUser] = useState<EmailUser | null>(null)
  const router = useRouter()

  const filtered = useMemo(() =>
    users.filter(u =>
      !search ||
      (u.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (u.company ?? '').toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
    ),
    [users, search]
  )

  function openCompose(user: EmailUser) {
    setCompose(user)
    setMinimized(false)
    setSubject('')
    setBody('')
    setSent(false)
  }

  function closeCompose() {
    setCompose(null)
    setMinimized(false)
    setSubject('')
    setBody('')
    setSent(false)
  }

  async function sendEmail() {
    if (!compose?.email || !subject.trim() || !body.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: compose.email, subject: subject.trim(), body: body.trim(), userId: compose.id }),
      })
      if (res.ok) {
        setLocalEmails(prev => [{
          id: crypto.randomUUID(),
          to: compose.email!,
          subject: subject.trim(),
          body: body.trim(),
          status: 'SENT',
          direction: 'OUTBOUND',
          sentAt: new Date().toISOString(),
          sponsorName: null,
          sponsorTier: null,
        }, ...prev])
        setSent(true)
        setTimeout(() => { closeCompose(); router.refresh() }, 1200)
      }
    } finally {
      setSending(false)
    }
  }

  const stats = [
    { label: 'Total Sent',  value: localEmails.filter(e => e.direction !== 'INBOUND').length, path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', color: '#2563eb', bg: '#eff6ff' },
    { label: 'Received',    value: localEmails.filter(e => e.direction === 'INBOUND').length,  path: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4', color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Recipients',  value: new Set(localEmails.map(e => e.to)).size,                   path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: '#6366f1', bg: '#eef2ff' },
  ]

  return (
    <div className="flex flex-col gap-5">

      {/* ── METRICS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 border border-hairline"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: s.bg }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: s.color }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.path} />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-ink-2 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── TWO-COLUMN BODY ──────────────────────────────────────── */}
      <div className="flex gap-5 items-start">

        {/* LEFT: Message log */}
        <div className="w-80 flex-shrink-0 rounded-2xl overflow-hidden flex flex-col bg-white border border-hairline"
          style={{ maxHeight: 'calc(100vh - 200px)', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>

          <div className="px-4 py-3.5 border-b border-hairline flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Messages</p>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#3b82f6' }} />
                Sent
              </span>
              <span className="flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#22c55e' }} />
                Received
              </span>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {localEmails.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 bg-brand-50">
                  <svg className="w-5 h-5 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-xs font-medium text-ink-2">No messages yet</p>
              </div>
            ) : (
              localEmails.map(email => {
                const isInbound = email.direction === 'INBOUND'
                const tier = email.sponsorTier ? TIER_CHIP[email.sponsorTier] : null
                return (
                  <details key={email.id} className="group">
                    <summary
                      className="flex items-start gap-0 cursor-pointer list-none transition-colors hover:brightness-95"
                      style={{ background: isInbound ? 'rgba(220,252,231,0.5)' : 'rgba(219,234,254,0.45)' }}
                    >
                      {/* Direction bar */}
                      <div className="w-1 self-stretch flex-shrink-0 rounded-tl-sm"
                        style={{ background: isInbound ? '#22c55e' : '#3b82f6' }} />

                      <div className="flex-1 min-w-0 px-3 py-3">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            style={{ color: isInbound ? '#16a34a' : '#2563eb' }}>
                            {isInbound
                              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            }
                          </svg>
                          <p className="text-xs font-semibold text-ink truncate leading-snug flex-1">{email.subject}</p>
                          <svg className="w-3.5 h-3.5 text-ink-3 flex-shrink-0 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <p className="text-caption text-ink-2 truncate">
                          {isInbound ? 'From' : 'To'}: {email.to}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[9px] text-ink-2">{format(new Date(email.sentAt), 'MMM d, h:mm a')}</span>
                          {email.sponsorName && tier && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ background: tier.bg, color: tier.text }}>{email.sponsorName}</span>
                          )}
                        </div>
                      </div>
                    </summary>

                    <div
                      className="px-4 pb-3 pt-1 border-b border-hairline"
                      style={{ background: isInbound ? 'rgba(220,252,231,0.25)' : 'rgba(219,234,254,0.2)' }}
                    >
                      <pre className="text-xs text-ink-2 bg-white rounded-xl p-3 whitespace-pre-wrap font-sans border border-hairline leading-relaxed">
                        {email.body}
                      </pre>
                    </div>
                  </details>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT: Gmail-style user list */}
        <div className="flex-1 min-w-0 rounded-2xl overflow-hidden flex flex-col bg-white border border-hairline"
          style={{ maxHeight: 'calc(100vh - 200px)', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>

          {/* Header + search */}
          <div className="px-5 pt-4 pb-3 border-b border-hairline">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-sm font-semibold text-ink">
                Users <span className="text-ink-2 font-normal text-xs">{filtered.length}{search ? ` of ${users.length}` : ''}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-fill">
              <svg className="w-4 h-4 text-ink-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, company, role…"
                className="flex-1 text-sm text-ink placeholder-ink-3 bg-transparent focus:outline-none" />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Clear search" className="text-ink-3 hover:text-ink-2">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Gmail rows */}
          <div className="overflow-y-auto flex-1 divide-y divide-hairline">
            {filtered.length === 0 ? (
              <p className="text-sm text-ink-2 text-center py-12">No users found</p>
            ) : filtered.map(user => {
              const isActive = threadUser?.id === user.id
              const hasEmailed = user.emailCount > 0
              // Last email for this user
              const lastEmail = localEmails.find(e => e.to === user.email)
              const sentAt = lastEmail ? new Date(lastEmail.sentAt) : null
              const now = new Date()
              const timeLabel = sentAt
                ? (now.getTime() - sentAt.getTime() < 24 * 60 * 60 * 1000
                  ? format(sentAt, 'h:mm a')
                  : format(sentAt, 'MMM d'))
                : null
              const preview = lastEmail
                ? lastEmail.subject
                : (user.jobTitle ?? user.email ?? '')

              const totalMissing = user.missingProfile.length + user.missingAssets.length
              const profilePct = Math.round(((6 - user.missingProfile.length) / 6) * 100)
              const assetPct = user.isSponsor ? Math.round(((10 - user.missingAssets.length) / 10) * 100) : null

              return (
                <button key={user.id} onClick={() => setThreadUser(user)}
                  className={`w-full text-left flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-fill active:bg-fill ${isActive ? 'bg-brand-50' : ''}`}>

                  {/* Avatar */}
                  {user.image ? (
                    <img src={user.image} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 shadow-sm ring-1 ring-hairline" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-brand/10 text-brand text-xs font-bold shadow-sm">
                      {(user.name ?? user.email ?? '?')[0].toUpperCase()}
                    </div>
                  )}

                  {/* Name — fixed width */}
                  <div className="w-36 flex-shrink-0 min-w-0">
                    <p className={`text-sm truncate ${hasEmailed ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
                      {user.name ?? user.email}
                    </p>
                    {user.jobTitle && (
                      <p className="text-caption text-ink-2 truncate">{user.jobTitle}</p>
                    )}
                  </div>

                  {/* Preview — grows */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-2 truncate">
                      <span className={hasEmailed ? 'text-ink font-medium' : ''}>{preview}</span>
                      {lastEmail && (
                        <span className="text-ink-2"> — {lastEmail.body.slice(0, 60)}</span>
                      )}
                    </p>
                  </div>

                  {/* Completeness column */}
                  <div className="w-96 flex-shrink-0 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {totalMissing === 0 ? (
                      <span className="flex items-center gap-1 text-caption font-semibold px-2 py-1 rounded-full bg-success-soft text-success-ink">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Complete
                      </span>
                    ) : (
                      <div className="flex-1 min-w-0">
                        {/* User bar */}
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[9px] text-ink-2 w-10 flex-shrink-0">User</span>
                          <div className="flex-1 h-1.5 rounded-full bg-fill overflow-hidden">
                            <div className="h-1.5 rounded-full transition-all"
                              style={{ width: `${profilePct}%`, background: barGradient(profilePct) }} />
                          </div>
                          <span className="text-[9px] font-semibold w-6 text-right flex-shrink-0"
                            style={{ color: profilePct === 100 ? '#6366f1' : profilePct >= 60 ? '#818cf8' : '#818cf8' }}>
                            {profilePct}%
                          </span>
                        </div>
                        {/* Assets bar — sponsor only */}
                        {assetPct !== null && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-warning w-10 flex-shrink-0">Assets</span>
                            <div className="flex-1 h-1.5 rounded-full bg-fill overflow-hidden">
                              <div className="h-1.5 rounded-full transition-all"
                                style={{ width: `${assetPct}%`, background: assetGradient(assetPct) }} />
                            </div>
                            <span className="text-[9px] font-semibold w-6 text-right flex-shrink-0"
                              style={{ color: assetPct === 100 ? '#4f46e5' : assetPct >= 60 ? '#6366f1' : '#818cf8' }}>
                              {assetPct}%
                            </span>
                          </div>
                        )}
                        {/* Missing count tooltip-style */}
                        {totalMissing > 0 && (
                          <p className="text-[9px] text-ink-2 mt-0.5 truncate">
                            {totalMissing} field{totalMissing !== 1 ? 's' : ''} missing
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Time + badge */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1 w-14">
                    {timeLabel && (
                      <span className={`text-xs ${hasEmailed ? 'text-ink-2 font-medium' : 'text-ink-2'}`}>
                        {timeLabel}
                      </span>
                    )}
                    {user.emailCount > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-600">
                        {user.emailCount}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── EMAIL THREAD PANEL ───────────────────────────────────── */}
      {threadUser && (
        <EmailThreadPanel
          user={{
            id: threadUser.id,
            name: threadUser.name,
            email: threadUser.email,
            image: threadUser.image,
            role: threadUser.role,
            jobTitle: threadUser.jobTitle,
            company: threadUser.company,
            isSponsor: threadUser.isSponsor,
          }}
          emails={localEmails
            .filter(e => e.to === threadUser.email)
            .map(e => ({
              id: e.id,
              to: e.to,
              subject: e.subject,
              body: e.body,
              status: e.status,
              direction: e.direction,
              sentAt: e.sentAt,
            }))}
          roleGradient={threadUser.isSponsor
            ? 'linear-gradient(135deg, #a5b4fc, #818cf8)'
            : (ROLE_GRADIENT[threadUser.role] ?? 'linear-gradient(135deg, #94a3b8, #64748b)')}
          onClose={() => setThreadUser(null)}
        />
      )}

      {/* ── GMAIL COMPOSE POPUP ──────────────────────────────────── */}
      {compose && (
        <div className="fixed bottom-0 right-6 z-50 flex flex-col rounded-t-2xl overflow-hidden"
          style={{ width: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12)' }}>

          {/* Dark header */}
          <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
            style={{ background: '#404040' }}
            onClick={() => setMinimized(m => !m)}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-white truncate">
                {sent ? '✓ Sent' : 'New Message'}
              </span>
              {!minimized && (
                <span className="text-xs text-ink-2 truncate hidden sm:block">— {compose.name ?? compose.email}</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => setMinimized(m => !m)}
                aria-label={minimized ? 'Expand' : 'Minimise'}
                className="text-ink-3 hover:text-white p-1.5 rounded transition-colors" title={minimized ? 'Expand' : 'Minimise'}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={minimized ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                </svg>
              </button>
              <button onClick={closeCompose}
                aria-label="Discard"
                className="text-ink-3 hover:text-white p-1.5 rounded transition-colors" title="Discard">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {!minimized && (
            <div className="flex flex-col bg-white" style={{ height: 360 }}>
              {/* To */}
              <div className="flex items-center px-4 py-2.5 border-b border-hairline">
                <span className="text-xs text-ink-2 w-14 flex-shrink-0">To</span>
                <div className="flex items-center gap-1.5 bg-fill rounded-full px-2.5 py-1">
                  {compose.image ? (
                    <img src={compose.image} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full flex items-center justify-center bg-brand/10 text-brand text-[8px] font-bold flex-shrink-0">
                      {(compose.name ?? compose.email ?? '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-medium text-ink whitespace-nowrap">
                    {compose.name ? `${compose.name} <${compose.email}>` : compose.email}
                  </span>
                  <button onClick={closeCompose} aria-label="Remove recipient" className="text-ink-2 hover:text-ink-2 ml-0.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Subject */}
              <div className="flex items-center px-4 py-2.5 border-b border-hairline">
                <span className="text-xs text-ink-2 w-14 flex-shrink-0">Subject</span>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
                  className="flex-1 text-sm text-ink placeholder-ink-3 focus:outline-none" autoFocus />
              </div>

              {/* Body */}
              <textarea value={body} onChange={e => setBody(e.target.value)}
                placeholder="Write your message here…"
                className="flex-1 px-4 py-3 text-sm text-ink placeholder-ink-3 focus:outline-none resize-none leading-relaxed" />

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-hairline">
                <button onClick={sendEmail}
                  disabled={!subject.trim() || !body.trim() || sending || sent}
                  className="btn-primary btn-sm">
                  {sending ? (
                    <><svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                    </svg>Sending…</>
                  ) : sent ? '✓ Sent!' : <>Send <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg></>}
                </button>
                <button onClick={closeCompose} title="Discard" aria-label="Discard"
                  className="text-ink-2 hover:text-danger p-2 rounded-full hover:bg-fill transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
