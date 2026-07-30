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

// Slot-time variants for the meeting-engine surfaces (Companies tab, check-in,
// auto match). Slots are stored as real UTC instants and the engine groups and
// labels schedule days in the event timezone (see packages/db/src/
// meeting-engine.ts EVENT_TZ/dayKeyOf/dayLabel), so these render in TZ too —
// the same wall-clock times as the Master Schedule tab.
export function fmtSlotTime(iso: string | Date) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}
export function fmtSlotRange(startIso: string | Date, endIso: string | Date) {
  return `${fmtSlotTime(startIso)}–${fmtSlotTime(endIso)}`
}
