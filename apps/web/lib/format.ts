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
