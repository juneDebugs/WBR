// Times are stored as UTC instants; the engine groups + labels days in the
// event timezone (packages/db/src/meeting-engine.ts EVENT_TZ), so render
// times in the event timezone too for internal consistency across the matrix.
const EVENT_TZ = 'America/Los_Angeles'
const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', minute: '2-digit', timeZone: EVENT_TZ,
})
export function fmtTime(iso: string): string {
  return TIME_FMT.format(new Date(iso))
}
export function fmtRange(startIso: string, endIso: string): string {
  return `${fmtTime(startIso)} – ${fmtTime(endIso)}`
}
export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '').toUpperCase() : '')
}
export function interestBadgeClass(level: string): string {
  return level === 'High' ? 'badge-success' : level === 'Medium' ? 'badge-warning' : 'badge-neutral'
}
export function fillMeterClass(rate: number): string {
  return rate >= 0.8 ? 'success' : rate >= 0.5 ? 'warning' : 'danger'
}

// eTail-style datestamps, in the event timezone to match day grouping.
const DATE_FMT = new Intl.DateTimeFormat('en-US', { year: '2-digit', month: '2-digit', day: '2-digit', timeZone: EVENT_TZ })
const DATETIME_FMT = new Intl.DateTimeFormat('en-US', {
  year: '2-digit', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', timeZone: EVENT_TZ,
})
export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return DATE_FMT.format(new Date(iso)) // 05/07/25
}
export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return DATETIME_FMT.format(new Date(iso)).replace(',', '') // 05/07/25 10:49 AM
}
