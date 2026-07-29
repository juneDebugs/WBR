// Shared lookup maps for the Meetings dashboard. The Requests, Master
// Schedule, and Companies tabs render these side by side on one page, so the
// maps live here once — per-file copies drift (and had already started to).
export const TIER_COLORS: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700',
  GOLD:     'bg-warning-soft text-warning-ink',
  SILVER:   'bg-fill text-ink-2',
  BRONZE:   'bg-orange-100 text-orange-700',
}
export const TIER_FALLBACK = 'bg-fill text-ink-2'

export const PRIORITY_LABEL = { BEST_FIT: 'Best Fit', MED: 'Med', LOW: 'Low' } as const
export const PRIORITY_BADGE = { BEST_FIT: 'badge badge-brand', MED: 'badge badge-warning', LOW: 'badge badge-neutral' } as const

// Mirrors the engine's FILL_TARGET (packages/db/src/meeting-engine.ts). Kept
// as a literal because importing a value from @conference/db would pull the
// barrel — and the Prisma client — into client bundles.
export const FILL_TARGET = 10

// Mirrors the engine's REQUIRED_MEETINGS_PER_PERSON — the denominator of the
// per-person "current / required" widget in the Companies grid. Literal for the
// same bundle reason as FILL_TARGET above.
export const REQUIRED_MEETINGS_PER_PERSON = 5

// Fill-meter color thresholds from the HIG spec (docs/prd/meeting-engine-hig-spec.md):
// <50% danger / 50-79% warning / ≥80% success. `rate` is 0..1.
export function meterClass(rate: number) {
  return rate >= 0.8 ? 'success' : rate >= 0.5 ? 'warning' : 'danger'
}
