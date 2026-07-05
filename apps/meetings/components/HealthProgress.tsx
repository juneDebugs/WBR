'use client'
/**
 * Shared progress-row design (Daily-Progress style):
 *   label ...................... 78%  ↑ 3.2%   ← value (health-colored) + week-over-week delta
 *   ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░   (rounded track, red→yellow→green health fill)
 *   caption line
 *   (hover the bar → dark pill tooltip with the raw numbers)
 *
 * The trend arrow + delta signify the WEEK-OVER-WEEK change (green ↑ up / red ↓
 * down), shown as "±X% vs last week" on hover. The % itself stays health-colored
 * (red = bad, green = excellent).
 *
 * CANONICAL SOURCE: packages/ui/health-progress/HealthProgress.tsx
 * Copied verbatim into each app at components/HealthProgress.tsx; the copies are
 * kept byte-identical and enforced by scripts/test-health-progress.mjs.
 */
import { useState } from 'react'
import { healthBarFill, healthTextColor } from '@/lib/health-color'

function TrendArrow({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      {dir === 'up' ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
      ) : dir === 'down' ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12l7 7 7-7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
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
  delta,
  deltaPeriod = 'vs last week',
  trend,
  height = 'h-2.5',
}: {
  /** Row label (left). */
  label: string
  /** 0–100. Drives the value %, and (by default) the bar fill + health color. */
  pct: number
  /** Optional gray sub-line under the bar. */
  caption?: string
  /** Optional raw-number string shown in a dark pill on hover (e.g. "3 of 8 complete"). */
  tooltip?: string
  /** Optional custom fill style (e.g. missingBarFill / healthBarFillFor). Defaults to healthBarFill(pct). */
  fill?: Record<string, string>
  /** Week-over-week change in percentage points (+up / −down). Shows an arrow + "±X% vs last week". */
  delta?: number
  /** Period label for the delta tooltip. Default "vs last week". */
  deltaPeriod?: string
  /** Force the arrow direction when there's no `delta`; defaults to up when pct ≥ 50. */
  trend?: 'up' | 'down'
  /** Track height utility. */
  height?: string
}) {
  const [hover, setHover] = useState(false)
  const barFill = fill ?? healthBarFill(pct)
  const hasDelta = typeof delta === 'number'
  const dir: 'up' | 'down' | 'flat' = hasDelta
    ? (delta! > 0 ? 'up' : delta! < 0 ? 'down' : 'flat')
    : trend
      ? trend
      : pct >= 50
        ? 'up'
        : 'down'
  const deltaText = hasDelta ? `${delta! > 0 ? '+' : delta! < 0 ? '−' : '±'}${Math.abs(delta!)}% ${deltaPeriod}` : ''
  const deltaColor = dir === 'up' ? '#1c7a3f' : dir === 'down' ? '#c81e14' : '#8e8e93'

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5 gap-3">
        <span className="text-sm font-medium text-ink truncate">{label}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-semibold tabular-nums" style={{ color: healthTextColor(pct) }}>
            {Math.round(pct)}%
          </span>
          {hasDelta ? (
            <span
              className="text-xs font-semibold inline-flex items-center gap-0.5 tabular-nums"
              style={{ color: deltaColor }}
              title={deltaText}
              aria-label={deltaText}
            >
              <TrendArrow dir={dir} />
              {Math.abs(delta!)}%
            </span>
          ) : (
            <span style={{ color: healthTextColor(pct) }} aria-hidden="true">
              <TrendArrow dir={dir} />
            </span>
          )}
        </div>
      </div>

      <div
        className={`w-full bg-fill rounded-full ${height} overflow-hidden ${tooltip ? 'cursor-default' : ''}`}
        onMouseEnter={() => tooltip && setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className={`${height} rounded-full transition-all duration-500`} style={barFill} />
      </div>

      {caption && <p className="text-xs text-ink-2 mt-1.5">{caption}</p>}

      {tooltip && hover && (
        <div
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 -top-1 -translate-y-full z-20 whitespace-nowrap bg-ink text-white text-xs font-medium px-3 py-1.5 rounded-xl shadow-pop animate-fade-in"
        >
          {tooltip}
          {hasDelta && <span className="text-white/70"> · {deltaText}</span>}
        </div>
      )}
    </div>
  )
}
