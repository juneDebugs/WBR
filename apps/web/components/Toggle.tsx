'use client'

/**
 * Toggle — the single, shared switch control for the admin app.
 *
 * Reproduces the "squishy" toggle from the reference design
 * (https://cdn.dribbble.com/userupload/30815466/…): a rounded-SQUARE thumb (not a
 * circle) that squash-stretches across a rounded-rectangle track as it travels,
 * with the thumb icon morphing ✓ (on) → – (mid-travel) → ✕ (off). Styled on the
 * WBR indigo `brand` scale so it stays cohesive with the rest of the dashboard —
 * brand-600 track when on, pale brand-300 when off — rather than an off-brand blue.
 *
 * HIG affordances preserved from the switches it replaces: a ≥44px touch target,
 * a `role="switch"` button, `aria-checked`, keyboard focus ring, a `disabled`
 * state, and a `locked` variant (stays focusable so screen-reader users hear the
 * reason, renders a padlock, and is exposed via `aria-disabled` + `title`).
 *
 * Motion is expressed purely with CSS transitions on the thumb's inset box, so the
 * global `prefers-reduced-motion` rule in packages/ui/preset.cjs neutralizes it
 * automatically — the thumb simply snaps between states, still fully functional.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Locked = permanently on and not editable; stays focusable, shows a padlock. */
  locked?: boolean
  labelledBy?: string
  describedBy?: string
  /** Tooltip, primarily used to explain a locked control. */
  title?: string
  className?: string
}

// ── Geometry (px). Track is a rounded rectangle; thumb a rounded square. ───────
const TRACK_W = 52
const TRACK_H = 32
const PAD = 4
const THUMB = TRACK_H - PAD * 2 // 24 — resting square side
const FAR = TRACK_W - PAD - THUMB // 24 — resting inset on the trailing side

// How long the thumb is held in its stretched (both-insets-tucked) state before
// it settles onto the destination side. Shorter than the CSS travel below, so the
// elongate and contract phases overlap into one fluid squash-stretch.
const STRETCH_MS = 150
// Springy travel — a mild overshoot gives the elastic settle from the reference.
const EASE = 'cubic-bezier(0.34, 1.42, 0.5, 1)'
const TRAVEL = '0.28s'

export function Toggle({
  checked,
  onChange,
  disabled = false,
  locked = false,
  labelledBy,
  describedBy,
  title,
  className,
}: ToggleProps) {
  const [stretching, setStretching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const handleClick = useCallback(() => {
    if (locked || disabled) return
    // Fire the squash-stretch, then let it settle onto the new side.
    setStretching(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStretching(false), STRETCH_MS)
    onChange(!checked)
  }, [locked, disabled, checked, onChange])

  // While stretching, both insets tuck in → the thumb fills the track (elongated).
  // At rest it sits square on the on/off side.
  const left = stretching ? PAD : checked ? FAR : PAD
  const right = stretching ? PAD : checked ? PAD : FAR

  const interactive = !locked && !disabled

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      // Locked stays focusable (so SR users hear the reason) but is not a real
      // disabled control; read-only/saving uses the actual disabled attribute.
      disabled={disabled && !locked}
      aria-disabled={locked || undefined}
      title={title}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
        className ?? ''
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative block transition-colors motion-reduce:transition-none ${
          checked ? 'bg-brand-600' : 'bg-brand-300'
        } ${locked ? 'cursor-not-allowed' : disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ width: TRACK_W, height: TRACK_H, borderRadius: 11 }}
      >
        <span
          className="absolute bg-white"
          style={{
            top: PAD,
            bottom: PAD,
            left,
            right,
            borderRadius: 8,
            boxShadow: '0 1px 2px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12)',
            transition: `left ${TRAVEL} ${EASE}, right ${TRAVEL} ${EASE}`,
          }}
        >
          {/* Icon morph: ✓ (on) → – (mid-travel) → ✕ (off). Cross-faded so the
              dash shows only during the stretch, exactly like the reference. */}
          <span className="absolute inset-0 grid place-items-center">
            {locked ? (
              <LockIcon />
            ) : (
              <>
                <CheckIcon show={checked && !stretching} />
                <DashIcon show={stretching} />
                <CrossIcon show={!checked && !stretching} />
              </>
            )}
          </span>
        </span>
      </span>
    </button>
  )
}

// ── Thumb glyphs ──────────────────────────────────────────────────────────────
// Absolutely stacked and cross-faded by opacity; `brand` hues echo the track.
const glyphBase =
  'absolute h-[14px] w-[14px] transition-opacity duration-150 motion-reduce:transition-none'

function CheckIcon({ show }: { show: boolean }) {
  return (
    <svg
      className={`${glyphBase} text-brand-600`}
      style={{ opacity: show ? 1 : 0 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function CrossIcon({ show }: { show: boolean }) {
  return (
    <svg
      className={`${glyphBase} text-brand-400`}
      style={{ opacity: show ? 1 : 0 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function DashIcon({ show }: { show: boolean }) {
  return (
    <svg
      className={`${glyphBase} text-brand-300`}
      style={{ opacity: show ? 1 : 0 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M6 12h12" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      className="h-3 w-3 text-brand-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  )
}
