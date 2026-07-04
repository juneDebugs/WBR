'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  IntroSchema,
  hasSparseInputs,
  groundedFieldsIncomplete,
  type IntroDraft,
  MESSAGE_MAX_CHARS,
  CAP_HIT_COPY,
  type CapErrorCode,
} from '@/lib/ai-intro'
import type { Attendee, SponsorContext } from './RecommendedAttendees'

interface Props {
  attendee: Attendee
  sponsor: SponsorContext
  idempotencyKey: string
  onClose: () => void
  onSent: (withIntro: boolean) => void
}

type Phase =
  | { kind: 'loading' } // AI call in flight
  | { kind: 'ready'; draft: IntroDraft; remaining: number | null } // AI succeeded — editable
  | { kind: 'failed' } // AI unavailable — pattern γ, empty textarea
  | { kind: 'capHit'; code: CapErrorCode; remaining: number | null } // rate-limit / cost-cap hit
  | { kind: 'sending' }
  | { kind: 'sendError'; message: string } // final send returned non-2xx

function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').split(' ')[0] || 'them'
}

function toMessageString(draft: IntroDraft): string {
  return [draft.greeting, draft.body, draft.signoff].filter(Boolean).join('\n\n')
}

function isCapCode(v: unknown): v is CapErrorCode {
  return v === 'burst_limit' || v === 'daily_limit' || v === 'global_limit'
}

export function IntroDraftModal({ attendee, sponsor, idempotencyKey, onClose, onSent }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [message, setMessage] = useState<string>('')
  const [groundedFields, setGroundedFields] = useState<readonly string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  // `useQueryClient` returns a stable singleton across renders, so the
  // `useCallback` here yields a truly stable reference — safe to put in
  // the useEffect deps without refiring the AI call every render.
  const qc = useQueryClient()
  const invalidateAiQuota = useCallback(
    () => qc.invalidateQueries({ queryKey: ['ai-quota'] }),
    [qc],
  )

  // On AI-failed (pattern γ) manual-send path, we bypass the low-
  // confidence confirm modal per PRD — user authorship implies
  // confidence. We track this with a flag rather than re-reading phase
  // at Send time, so a phase change (e.g. sendError → resend) doesn't
  // spuriously re-arm the confirm.
  const [wasAiFailed, setWasAiFailed] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Reset local state when the effect re-runs (e.g. the parent
    // remounts with a different attendee.id or a fresh
    // idempotencyKey). Without this, a re-mount briefly shows the
    // prior draft's textarea contents and could allow sending stale
    // text against the new attendee before the new fetch settles.
    setPhase({ kind: 'loading' })
    setMessage('')
    setGroundedFields([])
    setWasAiFailed(false)
    setConfirmOpen(false)

    fetch(`/api/recommendations/${attendee.id}/draft-intro`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey }),
    })
      .then(async res => {
        // Read the body once for both success and cap-hit branches.
        let json: any = null
        try {
          json = await res.json()
        } catch {}

        if (res.ok) {
          const parsed = IntroSchema.safeParse(json)
          if (!parsed.success) throw new Error('ai_schema')
          const remaining =
            typeof json?.remaining === 'number' ? (json.remaining as number) : null
          return { kind: 'ready' as const, draft: parsed.data, remaining }
        }

        // 429 / 503 with a locked cap-hit error code → capHit branch.
        if ((res.status === 429 || res.status === 503) && isCapCode(json?.error)) {
          const remaining =
            typeof json?.remaining === 'number' ? (json.remaining as number) : null
          return { kind: 'capHit' as const, code: json.error as CapErrorCode, remaining }
        }

        throw new Error(`ai_${res.status}`)
      })
      .then(next => {
        if (next.kind === 'ready') {
          setPhase(next)
          setMessage(toMessageString(next.draft))
          setGroundedFields(next.draft.groundedFields)
        } else {
          setPhase(next)
        }
        invalidateAiQuota()
      })
      .catch(err => {
        if (err?.name === 'AbortError') return
        setPhase({ kind: 'failed' })
        setWasAiFailed(true)
        setMessage('')
        setGroundedFields([])
        invalidateAiQuota()
      })

    return () => ctrl.abort()
    // idempotencyKey is a per-open constant from the parent (fresh UUID
    // per Draft intro click); attendee.id is the primary dep. If the
    // parent ever re-uses the key across re-mounts, keeping the key in
    // deps ensures the effect refires correctly.
  }, [attendee.id, idempotencyKey, invalidateAiQuota])

  const bannerSparse = hasSparseInputs({
    attendee: { bio: attendee.bio, jobTitle: attendee.jobTitle },
    sponsor: { tagline: sponsor.tagline },
  })
  const bannerGroundingIncomplete =
    phase.kind === 'ready' && groundedFieldsIncomplete(groundedFields)
  const showLimitedDataBanner = bannerSparse || bannerGroundingIncomplete
  const showAiUnavailableBanner = phase.kind === 'failed'
  const showCapHitBanner = phase.kind === 'capHit'

  const isSending = phase.kind === 'sending'

  // Close the modal (or the nested confirm) on Escape (a11y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirmOpen) setConfirmOpen(false)
      else if (!isSending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmOpen, isSending, onClose])

  const canSend =
    !isSending &&
    message.trim().length > 0 &&
    message.length <= MESSAGE_MAX_CHARS &&
    phase.kind !== 'loading' &&
    phase.kind !== 'capHit'

  const provenance =
    phase.kind === 'ready' && groundedFields.length > 0
      ? `Drafted from: ${groundedFields
          .map(f => f.replace(/^(attendee|sponsor)\./, ''))
          .join(', ')}`
      : null

  // Remaining-count line: shown in ready and capHit-with-remaining
  // phases. Suppressed on global_limit (no per-user remaining meaning)
  // and on failed (pattern γ has no cap accounting).
  const remainingValue =
    phase.kind === 'ready' || phase.kind === 'capHit' ? phase.remaining : null
  const showRemainingLine =
    remainingValue !== null &&
    !(phase.kind === 'capHit' && phase.code === 'global_limit')

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in">
      <div role="dialog" aria-modal="true" aria-label={`Draft intro to ${attendee.name}`}
        className="w-full max-w-lg bg-surface rounded-2xl shadow-elevated flex flex-col max-h-[90vh] animate-slide-up">
        <div className="px-5 pt-5 pb-3 border-b border-hairline">
          <h2 className="text-base font-bold text-ink">Draft intro to {attendee.name}</h2>
          {(attendee.jobTitle || attendee.company) && (
            <p className="text-xs text-ink-2 mt-0.5">
              {[attendee.jobTitle, attendee.company].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {phase.kind === 'loading' && (
            <div className="text-sm text-ink-2 py-8 text-center">Drafting an intro…</div>
          )}

          {showCapHitBanner && phase.kind === 'capHit' && (
            <div className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-ink">
              {CAP_HIT_COPY[phase.code]}
            </div>
          )}

          {showAiUnavailableBanner && (
            <div className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-ink">
              ⚠ AI draft unavailable — write your own message and send.
            </div>
          )}

          {phase.kind !== 'loading' &&
            phase.kind !== 'capHit' &&
            showLimitedDataBanner &&
            !showAiUnavailableBanner && (
              <div className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-ink">
                ⚠ Limited data — Review carefully.
              </div>
            )}

          {showRemainingLine && (
            <p className="text-[11px] text-ink-2">
              {remainingValue} AI draft{remainingValue === 1 ? '' : 's'} remaining today
            </p>
          )}

          {phase.kind !== 'loading' && phase.kind !== 'capHit' && (
            <>
              {provenance && (
                <p className="text-[11px] text-ink-2 italic">{provenance}</p>
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
                className="textarea resize-y"
              />
              <p className="text-[11px] text-ink-3 text-right">
                {message.length} / {MESSAGE_MAX_CHARS}
              </p>
            </>
          )}

          {phase.kind === 'sendError' && (
            <div className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
              {phase.message}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-hairline flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary btn-sm"
            disabled={isSending}
          >
            Cancel
          </button>
          {phase.kind !== 'capHit' && (
            <button
              type="button"
              onClick={onSendClick}
              disabled={!canSend}
              className="btn-primary btn-sm"
            >
              {isSending ? 'Sending…' : `Send intro to ${firstNameOf(attendee.name)}`}
            </button>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div role="dialog" aria-modal="true" aria-label="Limited data — send anyway?"
            className="w-full max-w-sm bg-surface rounded-2xl shadow-elevated p-5 space-y-3 animate-slide-up">
            <h3 className="text-sm font-bold text-ink">Limited data — Send anyway?</h3>
            <p className="text-xs text-ink-2">
              The AI had limited signals for this intro. Review the message before sending.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false)
                  actuallySend()
                }}
                className="btn-primary btn-sm"
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
