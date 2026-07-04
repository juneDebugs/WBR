'use client'

import { useState, useEffect, useRef } from 'react'
import { format, isToday, isYesterday, isThisYear } from 'date-fns'

import { useRouter } from 'next/navigation'

export interface ThreadEmail {
  id: string
  to: string
  subject: string
  body: string
  status: string
  direction: string
  sentAt: string
}

interface ThreadUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: string
  jobTitle: string | null
  company: string | null
  isSponsor: boolean
}

interface Props {
  user: ThreadUser
  emails: ThreadEmail[]
  roleGradient: string
  onClose: () => void
}

function msgTime(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return 'Yesterday'
  if (isThisYear(d)) return format(d, 'MMM d')
  return format(d, 'MMM d, yyyy')
}

export function EmailThreadPanel({ user, emails: initialEmails, onClose }: Props) {
  const [emails, setEmails] = useState(initialEmails)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(
    initialEmails.length > 0 ? initialEmails[0].id : null
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [emails])

  async function send() {
    if (!user.email || !subject.trim() || !body.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, subject: subject.trim(), body: body.trim(), userId: user.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setEmails(prev => [{
          id: crypto.randomUUID(),
          to: user.email!,
          subject: subject.trim(),
          body: body.trim(),
          status: 'SENT',
          direction: 'OUTBOUND',
          sentAt: new Date().toISOString(),
        }, ...prev])
        setSent(true)
        setSubject('')
        setBody('')
        setTimeout(() => setSent(false), 2000)
        router.refresh()
      } else {
        setSendError(data.error ?? 'Failed to send')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      {/* Panel */}
      <div
        className="ml-auto h-full flex flex-col bg-white"
        style={{ width: 680, boxShadow: '-8px 0 40px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-hairline">
          <button onClick={onClose} aria-label="Close" className="text-ink-2 hover:text-ink-2 p-1.5 rounded-lg hover:bg-fill transition-colors mr-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Avatar */}
          {user.image ? (
            <img src={user.image} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 shadow-sm" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-brand/10 text-brand font-bold">
              {(user.name ?? user.email ?? '?')[0].toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{user.name ?? user.email}</p>
            <p className="text-xs text-ink-2 truncate">{user.email}{user.jobTitle ? ` · ${user.jobTitle}` : ''}{user.company ? ` · ${user.company}` : ''}</p>
          </div>

          <span className="text-xs text-ink-2">{emails.length} message{emails.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 bg-brand-50">
                <svg className="w-7 h-7 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink-2">No messages yet</p>
              <p className="text-xs text-ink-2 mt-1">Send the first message below</p>
            </div>
          ) : (
            [...emails].reverse().map(email => {
              const isOut = email.direction !== 'INBOUND'
              const isExpanded = expandedId === email.id
              return (
                <div
                  key={email.id}
                  className="rounded-2xl border overflow-hidden cursor-pointer"
                  style={{
                    borderColor: isOut ? '#dbeafe' : '#dcfce7',
                    background: isExpanded
                      ? (isOut ? '#eff6ff' : '#f0fdf4')
                      : '#fff',
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : email.id)}
                >
                  {/* Email row header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Direction avatar */}
                    {isOut ? (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-brand/10 text-brand text-xs font-bold">
                        A
                      </div>
                    ) : (
                      user.image ? (
                        <img src={user.image} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-brand/10 text-brand text-xs font-bold">
                          {(user.name ?? '?')[0].toUpperCase()}
                        </div>
                      )
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-ink truncate">
                          {isOut ? 'You' : (user.name ?? user.email)}
                        </span>
                        {!isExpanded && (
                          <span className="text-xs text-ink-2 truncate flex-1">{email.subject} — {email.body.slice(0, 60)}</span>
                        )}
                      </div>
                      {isExpanded && (
                        <p className="text-xs text-ink-2 mt-0.5">
                          {isOut ? `to ${user.email}` : `to me`}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-ink-2">{msgTime(email.sentAt)}</span>
                      <svg className={`w-4 h-4 text-ink-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0">
                      <p className="text-sm font-semibold text-ink mb-3">{email.subject}</p>
                      <pre className="text-sm text-ink whitespace-pre-wrap font-sans leading-relaxed">
                        {email.body}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose area — Gmail style */}
        <div className="border-t border-hairline px-6 py-4">
          <div className="rounded-2xl border border-hairline overflow-hidden"
            style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            {/* Compose header */}
            <div className="px-4 py-2.5 bg-fill border-b border-hairline flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-2">Reply to {user.name ?? user.email}</span>
            </div>

            {/* Subject */}
            <div className="flex items-center px-4 py-2.5 border-b border-hairline">
              <span className="text-xs text-ink-2 w-14 flex-shrink-0">Subject</span>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject"
                className="flex-1 text-sm text-ink placeholder-ink-3 focus:outline-none"
              />
            </div>

            {/* Body */}
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`Write to ${user.name ?? user.email}…`}
              rows={4}
              className="w-full px-4 py-3 text-sm text-ink placeholder-ink-3 focus:outline-none resize-none leading-relaxed"
            />

            {/* Error */}
            {sendError && (
              <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-danger-soft border border-danger/30 text-xs text-danger-ink flex items-start gap-2">
                <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                {sendError.includes('No email integration') ? (
                  <span>No email account connected. <a href="/dashboard/integrations" className="underline font-semibold">Set up Gmail or Outlook →</a></span>
                ) : sendError}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 bg-fill border-t border-hairline">
              <button
                onClick={send}
                disabled={!subject.trim() || !body.trim() || sending || sent}
                className="btn-primary btn-sm"
              >
                {sending ? (
                  <><svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                  </svg> Sending…</>
                ) : sent ? '✓ Sent!' : (
                  <>Send <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg></>
                )}
              </button>
              <button onClick={() => { setSubject(''); setBody('') }}
                className="text-xs text-ink-2 hover:text-danger transition-colors">
                Discard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
