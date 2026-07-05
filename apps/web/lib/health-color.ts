/**
 * Red → yellow → green "health" scale for readiness / completion bars.
 *
 *   red = bad · yellow = ok · green = excellent
 *
 * Used by the Admin Overview page's Sponsor Readiness bars. This is a semantic
 * data-viz scale (like a traffic light), intentionally distinct from the single
 * brand accent — a completion metric reads clearest as green-good / red-bad.
 *
 * Thresholds: excellent >= 80, ok 50-79, bad < 50.
 */

// Vivid fill spectrum (red → orange → yellow → green) for progress-bar fills.
export const HEALTH_GRADIENT =
  'linear-gradient(90deg, #ff3b30 0%, #ff9500 35%, #ffcc00 58%, #34c759 100%)'

export const HEALTH_EXCELLENT = 80
export const HEALTH_OK = 50

/** Accessible text color for a score % (WCAG-AA contrast on white). */
export function healthTextColor(pct: number): string {
  if (pct >= HEALTH_EXCELLENT) return '#1c7a3f' // excellent — green ink
  if (pct >= HEALTH_OK) return '#8a5300' // ok — amber ink
  return '#c81e14' // bad — red ink
}

/** Vivid solid fill color for a score % (small bars, dots, inverted gaps). */
export function healthSolid(pct: number): string {
  if (pct >= HEALTH_EXCELLENT) return '#34c759' // green
  if (pct >= HEALTH_OK) return '#ffcc00' // yellow
  return '#ff3b30' // red
}

/** Semantic label for a score %. */
export function healthLabel(pct: number): 'excellent' | 'ok' | 'bad' {
  if (pct >= HEALTH_EXCELLENT) return 'excellent'
  if (pct >= HEALTH_OK) return 'ok'
  return 'bad'
}

/**
 * Inline style for a progress-bar fill showing the red→yellow→green health
 * gradient clipped to `pct`. The gradient is scaled to the FULL track (via
 * background-size) so the color at the fill's right edge reflects the score:
 * a low % shows red (bad), mid shows yellow (ok), high reaches green (excellent).
 */
export function healthBarFill(pct: number): Record<string, string> {
  return healthBarFillFor(pct, pct)
}

/**
 * Like `healthBarFill`, but decouples the bar's LENGTH from the COLOR it lands on.
 *
 *   width   = `widthPct`  (how much of the track the bar fills)
 *   color   = the red→yellow→green gradient sampled at `scorePct`
 *
 * The gradient is scaled by `scorePct` (not width) so the fill's right edge shows
 * the color at `scorePct` regardless of length. Used for the "most commonly
 * missing" bars, where the length encodes how many sponsors miss the item but the
 * color should encode its health (100 − missing): most-missing = red, least = green.
 */
export function healthBarFillFor(widthPct: number, scorePct: number): Record<string, string> {
  const w = Math.max(0, Math.min(100, widthPct))
  const s = Math.max(0, Math.min(100, scorePct))
  return {
    width: `${w}%`,
    backgroundImage: HEALTH_GRADIENT,
    // 10000/s places the gradient's `s%` color at the fill's right edge; s=0 → all red.
    backgroundSize: `${s > 0 ? Math.min(10000 / s, 100000) : 100000}% 100%`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'left center',
  }
}

// Full-width green gradient — a bar pinned to "excellent".
const GREEN_FULL = 'linear-gradient(90deg, #5ed17f 0%, #34c759 100%)'

/**
 * Fill style for a "most commonly missing" bar. By default: length = how many
 * sponsors miss the item, gradient color = its health (100 − missing). The
 * Booth number bar is pinned full-width green per product request.
 */
export function missingBarFill(label: string, pct: number): Record<string, string> {
  if (label === 'Booth number') {
    return { width: '100%', backgroundImage: GREEN_FULL }
  }
  return healthBarFillFor(pct, 100 - pct)
}
