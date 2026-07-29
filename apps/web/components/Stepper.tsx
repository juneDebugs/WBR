'use client'

import { useEffect, useState } from 'react'

// HIG-style numeric stepper: minus button · typed value · plus button. The
// input holds a local string while the user types and commits a clamped
// integer on blur or Enter; ArrowUp/ArrowDown nudge by one. Buttons disable
// at the bounds.
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  disabled = false,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  label: string
  disabled?: boolean
}) {
  const [text, setText] = useState(String(value))
  // Re-sync the typed string whenever the committed value changes (discard,
  // server refresh, sibling stepper button press).
  useEffect(() => {
    setText(String(value))
  }, [value])

  function clamp(n: number) {
    return Math.min(max, Math.max(min, Math.trunc(n)))
  }
  function commit() {
    const n = Number(text)
    const next = text.trim() !== '' && Number.isFinite(n) ? clamp(n) : value
    setText(String(next))
    if (next !== value) onChange(next)
  }
  function step(delta: number) {
    const next = clamp(value + delta)
    setText(String(next))
    if (next !== value) onChange(next)
  }

  const btnClass =
    'min-h-[44px] min-w-[44px] rounded-xl border border-hairline bg-white text-ink font-semibold ' +
    'hover:bg-fill motion-safe:active:scale-[0.97] transition disabled:opacity-40'

  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label}`}
        className={btnClass}
      >
        {'−'}
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={text}
        disabled={disabled}
        aria-label={label}
        onChange={e => setText(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            step(1)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            step(-1)
          }
        }}
        className="input w-14 text-center tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => step(1)}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label}`}
        className={btnClass}
      >
        {'+'}
      </button>
    </div>
  )
}
