'use client'

import { useState } from 'react'

interface Props {
  sponsorId: string
  sponsorName: string
  contactEmail: string | null
  missingCount: number
}

export function SponsorRemindButton({ sponsorId, sponsorName, contactEmail, missingCount }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [to, setTo] = useState(contactEmail ?? '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  async function openModal() {
    setOpen(true)
    setLoading(true)
    setError(null)
    setSent(false)
    try {
      const res = await fetch('/api/sponsors/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorId, draftOnly: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate draft')
      setTo(data.to ?? contactEmail ?? '')
      setSubject(data.subject ?? '')
      setBody(data.preview ?? '')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function send() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/sponsors/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorId, draftOnly: false, subject, body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      setSent(true)
      setTimeout(() => setOpen(false), 1500)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  if (missingCount === 0) return null

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand/30 transition-colors whitespace-nowrap"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Remind
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-semibold text-ink">Send Reminder</h2>
                <p className="text-xs text-ink-2 mt-0.5">{sponsorName}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-ink-2 hover:text-ink transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="flex items-center gap-2 text-brand-700">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span className="text-sm font-medium">Generating AI draft…</span>
                  </div>
                  <p className="text-xs text-ink-2">Personalizing based on what's missing</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-ink-2 uppercase tracking-wide mb-1.5">To</label>
                    <input
                      type="email"
                      value={to}
                      onChange={e => setTo(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-hairline rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-2 uppercase tracking-wide mb-1.5">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-hairline rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-ink-2 uppercase tracking-wide">Message</label>
                      <span className="inline-flex items-center gap-1 text-caption font-semibold text-brand bg-brand-50 px-2 py-0.5 rounded-full border border-brand/30">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 14.5h-2v-6h2v6zm0-8h-2V6h2v2.5z"/>
                        </svg>
                        AI Generated
                      </span>
                    </div>
                    <textarea
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      rows={10}
                      className="w-full px-3 py-2 text-sm border border-hairline rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand font-mono leading-relaxed"
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-lg border border-danger/30">{error}</p>
                  )}
                  {sent && (
                    <p className="text-sm text-success-ink bg-success-soft px-3 py-2 rounded-lg border border-success/30 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Email sent successfully
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!loading && (
              <div className="px-6 py-4 border-t border-hairline flex items-center justify-between gap-3">
                <p className="text-xs text-ink-2">
                  {to ? `Sending to ${to}` : 'No contact email set'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-ink-2 hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={send}
                    disabled={sending || sent || !to || !body}
                    className="btn-primary"
                  >
                    {sending ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Sending…
                      </>
                    ) : sent ? '✓ Sent' : 'Send Email'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
