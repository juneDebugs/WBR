'use client'

import { useEffect, useRef, useState } from 'react'
import {
  IntroSchema,
  hasSparseInputs,
  groundedFieldsIncomplete,
  type IntroDraft,
  MESSAGE_MAX_CHARS,
} from '@/lib/ai-intro'
import type { Attendee, SponsorContext } from './RecommendedAttendees'

interface Props {
  attendee: Attendee
  sponsor: SponsorContext
  onClose: () => void
  onSent: (withIntro: boolean) => void
}

type Phase =
  | { kind: 'loading' } // AI call in flight
  | { kind: 'ready'; draft: IntroDraft } // AI succeeded — editable
  | { kind: 'failed' } // AI unavailable — pattern γ, empty textarea
  | { kind: 'sending' }
  | { kind: 'sendError'; message: string } // final send returned non-2xx

function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').split(' ')[0] || 'them'
}

function toMessageString(draft: IntroDraft): string {
  return [draft.greeting, draft.body, draft.signoff].filter(Boolean).join('\n\n')
}

export function IntroDraftModal({ attendee, sponsor, onClose, onSent }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [message, setMessage] = useState<string>('')
  const [groundedFields, setGroundedFields] = useState<readonly string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // On AI-failed (pattern γ) manual-send path, we bypass the low-
  // confidence confirm modal per PRD — user authorship implies
  // confidence. We track this with a flag rather than re-reading phase
  // at Send time, so a phase change (e.g. sendError → resend) doesn't
  // spuriously re-arm the confirm.
  const [wasAiFailed, setWasAiFailed] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    abortRef.current = ctrl

    fetch(`/api/recommendations/${attendee.id}/draft-intro`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async res => {
        if (!res.ok) throw new Error(`ai_${res.status}`)
        const json = await res.json()
        const parsed = IntroSchema.safeParse(json)
        if (!parsed.success) throw new Error('ai_schema')
        return parsed.data
      })
      .then(draft => {
        setPhase({ kind: 'ready', draft })
        setMessage(toMessageString(draft))
        setGroundedFields(draft.groundedFields)
      })
      .catch(err => {
        if (err?.name === 'AbortError') return
        setPhase({ kind: 'failed' })
        setWasAiFailed(true)
        setMessage('')
        setGroundedFields([])
      })

    return () => ctrl.abort()
  }, [attendee.id])

  const bannerSparse = hasSparseInputs({
    attendee: { bio: attendee.bio, jobTitle: attendee.jobTitle },
    sponsor: { tagline: sponsor.tagline },
  })
  const bannerGroundingIncomplete =
    phase.kind === 'ready' && groundedFieldsIncomplete(groundedFields)
  const showLimitedDataBanner = bannerSparse || bannerGroundingIncomplete
  const showAiUnavailableBanner = phase.kind === 'failed'

  const isSending = phase.kind === 'sending'
  const canSend =
    !isSending &&
    message.trim().length > 0 &&
    message.length <= MESSAGE_MAX_CHARS &&
    phase.kind !== 'loading'

  const provenance =
    phase.kind === 'ready' && groundedFields.length > 0
      ? `Drafted from: ${groundedFields
          .map(f => f.replace(/^(attendee|sponsor)\./, ''))
          .join(', ')}`
      : null

  async function actuallySend() {
    setPhase({ kind: 'sending' })
    try {
      const res = await fetch('/api/request-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: attendee.id, message: message.trim() }),
      })
      if (!res.ok) {
        let errMsg = `Send failed (${res.status})`
        try {
          const errJson = await res.json()
          if (errJson?.error) errMsg = errJson.error
        } catch {}
        setPhase({ kind: 'sendError', message: errMsg })
        return
      }
      onSent(true)
    } catch (err: any) {
      setPhase({ kind: 'sendError', message: err?.message ?? 'Send failed' })
    }
  }

  function onSendClick() {
    if (!canSend) return
    // Tiered friction: interpose the confirm modal only on the low-
    // confidence AI-drafted path. Manual-send (pattern γ) bypasses.
    const shouldConfirm = !wasAiFailed && (bannerSparse || bannerGroundingIncomplete)
    if (shouldConfirm) {
      setConfirmOpen(true)
      return
    }
    actuallySend()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Draft intro to {attendee.name}</h2>
          {(attendee.jobTitle || attendee.company) && (
            <p className="text-xs text-gray-500 mt-0.5">
              {[attendee.jobTitle, attendee.company].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {phase.kind === 'loading' && (
            <div className="text-sm text-gray-500 py-8 text-center">Drafting an intro…</div>
          )}

          {showAiUnavailableBanner && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ AI draft unavailable — write your own message and send.
            </div>
          )}

          {phase.kind !== 'loading' && showLimitedDataBanner && !showAiUnavailableBanner && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ Limited data — Review carefully.
            </div>
          )}

          {phase.kind !== 'loading' && (
            <>
              {provenance && (
                <p className="text-[11px] text-gray-500 italic">{provenance}</p>
              )}
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={
                  phase.kind === 'failed'
                    ? `Write your intro to ${firstNameOf(attendee.name)} here…`
                    : ''
                }
                maxLength={MESSAGE_MAX_CHARS}
                rows={8}
                className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
              <p className="text-[11px] text-gray-400 text-right">
                {message.length} / {MESSAGE_MAX_CHARS}
              </p>
            </>
          )}

          {phase.kind === 'sendError' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {phase.message}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            disabled={isSending}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSendClick}
            disabled={!canSend}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {isSending ? 'Sending…' : `Send intro to ${firstNameOf(attendee.name)}`}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Limited data — Send anyway?</h3>
            <p className="text-xs text-gray-600">
              The AI had limited signals for this intro. Review the message before sending.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false)
                  actuallySend()
                }}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90"
              >
                Send anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
