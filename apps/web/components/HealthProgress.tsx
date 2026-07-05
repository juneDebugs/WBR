'use client'
/**
 * Shared progress-row design (Daily-Progress style):
 *   label ............................... 32% ↑
 *   ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░   (rounded track, red→yellow→green health fill)
 *   caption line
 *   (hover the bar → dark pill tooltip with the raw numbers)
 *
 * CANONICAL SOURCE: packages/ui/health-progress/HealthProgress.tsx
 * Copied verbatim into each app at components/HealthProgress.tsx; the copies are
 * kept byte-identical and enforced by scripts/test-health-progress.mjs. (A true
 * shared runtime package is avoided here because it would need a workspace dep +
 * lockfile change, which the frozen-lockfile Vercel install can't take.)
 */
import { useState } from 'react'
import { healthBarFill, healthTextColor } from '@/lib/health-color'

function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      {up ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12l7 7 7-7" />
      )}
    </svg>
  )
}

export function HealthProgress({
  label,
  pct,
  caption,
  tooltip,
  fill,
  trend,
  height = 'h-2.5',
}: {
  /** Row label (left). */
  label: string
  /** 0–100. Drives the trend %, the arrow, and (by default) the bar fill. */
  pct: number
  /** Optional gray sub-line under the bar. */
  caption?: string
  /** Optional raw-number string shown in a dark pill on hover (e.g. "3 of 8 complete"). */
  tooltip?: string
  /** Optional custom fill style (e.g. missingBarFill / healthBarFillFor). Defaults to healthBarFill(pct). */
  fill?: Record<string, string>
  /** Force the arrow direction; defaults to up when pct ≥ 50. */
  trend?: 'up' | 'down'
  /** Track height utility. */
  height?: string
}) {
  const [hover, setHover] = useState(false)
  const up = trend ? trend === 'up' : pct >= 50
  const barFill = fill ?? healthBarFill(pct)
  const rounded = height === 'h-2.5' ? 'rounded-full' : 'rounded-full'

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5 gap-3">
        <span className="text-sm font-medium text-ink truncate">{label}</span>
        <span
          className="text-sm font-semibold inline-flex items-center gap-1 flex-shrink-0 tabular-nums"
          style={{ color: healthTextColor(pct) }}
        >
          {Math.round(pct)}%
          <TrendArrow up={up} />
        </span>
      </div>

      <div
        className={`w-full bg-fill ${rounded} ${height} overflow-hidden ${tooltip ? 'cursor-default' : ''}`}
        onMouseEnter={() => tooltip && setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className={`${height} ${rounded} transition-all duration-500`} style={barFill} />
      </div>

      {caption && <p className="text-xs text-ink-2 mt-1.5">{caption}</p>}

      {tooltip && hover && (
        <div
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 -top-1 -translate-y-full z-20 whitespace-nowrap bg-ink text-white text-xs font-medium px-3 py-1.5 rounded-xl shadow-pop animate-fade-in"
        >
          {tooltip}
        </div>
      )}
    </div>
  )
}
