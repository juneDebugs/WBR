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
  const p = Math.max(0, Math.min(100, pct))
  return {
    width: `${p}%`,
    backgroundImage: HEALTH_GRADIENT,
    // 10000/p makes the gradient span the whole track regardless of fill width.
    backgroundSize: `${p > 0 ? 10000 / p : 100}% 100%`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'left center',
  }
}
