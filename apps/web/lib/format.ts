export const TZ = 'America/Los_Angeles'

export function fmtTime(d: Date | string, showAmPm = false) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  }).replace(/\s?(AM|PM)/g, (_, p1: string) => showAmPm ? `\u202f${p1.toLowerCase()}` : '')
}

export function fmtDate(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })
}

// UTC variants for the meeting-engine surfaces (Companies tab). The engine
// stores, groups, and labels schedule days in UTC (see packages/db/src/
// meeting-engine.ts dayKeyOf/dayLabel and the staff console in apps/meetings),
// so those grids must format times in UTC too — rendering them in TZ would
// put slots under day tabs they don't belong to. Note this intentionally
// differs from fmtTime above; the Master Schedule tab's TZ rendering predates
// the engine and is tracked as a known display divergence.
export function fmtTimeUTC(iso: string | Date) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}
export function fmtRangeUTC(startIso: string | Date, endIso: string | Date) {
  return `${fmtTimeUTC(startIso)}–${fmtTimeUTC(endIso)}`
}
