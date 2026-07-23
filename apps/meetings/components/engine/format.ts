// Times are stored as UTC ISO; the whole console groups + labels days in UTC,
// so render times in UTC too for internal consistency across the matrix.
const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
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
