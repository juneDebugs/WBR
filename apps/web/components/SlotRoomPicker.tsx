'use client'

import { useEffect, useId } from 'react'
import type { AvailabilityDay, AvailabilitySlot } from '@conference/db'
import { useDialogFocus } from '@/lib/useDialogFocus'
import { fmtRangeUTC } from '@/lib/format'

function freeRoomCount(slot: AvailabilitySlot) {
  return slot.rooms.filter(r => r.available).length
}

// Shared right-side sheet shell (HIG in-context task: light scrim, 440px
// panel) used by the Assign and Reschedule sheets. Focus is trapped inside
// and returned to the trigger on close; Escape and a scrim click both close.
export function SchedulerSheet({
  title, subtitle, onClose, footer, children, dismissable = true,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  footer: React.ReactNode
  children: React.ReactNode
  // Pass false while a submit is in flight — dismissing mid-flight would skip
  // the onSuccess refresh and leave the grid showing stale state.
  dismissable?: boolean
}) {
  const titleId = useId()
  const ref = useDialogFocus<HTMLDivElement>(true)

  useEffect(() => {
    if (!dismissable) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, dismissable])

  return (
    <>
      <div className="sheet-scrim" onClick={() => { if (dismissable) onClose() }} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="sheet-panel">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-hairline">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-sm text-ink-2 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={!dismissable} className="icon-btn -mr-2 -mt-2 flex-shrink-0" aria-label="Close">
            {'✕'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-hairline p-4">{footer}</div>
      </div>
    </>
  )
}

// Skeleton body shown while a sheet loads availability.
export function SheetSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="skeleton h-4 w-24" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="skeleton h-11 w-full" />
      ))}
    </div>
  )
}

// Shared slot → room picker used by the Assign and Reschedule sheets.
// Slots are toggle buttons (aria-pressed); the room list appears under the
// selected slot. State is never color-only: every row pairs its badge or
// meter color with a text label.
export function SlotRoomPicker({
  days, selectedSlot, onSelectSlot, selectedRoom, onSelectRoom, currentTimeBlockId,
}: {
  days: AvailabilityDay[]
  selectedSlot: string | null
  onSelectSlot: (timeBlockId: string | null) => void
  selectedRoom: string | null
  onSelectRoom: (room: string | null) => void
  currentTimeBlockId?: string | null
}) {
  function pickSlot(slot: AvailabilitySlot) {
    if (selectedSlot === slot.timeBlockId) return
    onSelectSlot(slot.timeBlockId)
    onSelectRoom(null)
  }

  return (
    <div className="space-y-5">
      {days.map(day => (
        <section key={day.dayKey} aria-label={day.label}>
          <p className="section-title !mb-2">{day.label}</p>
          <div className="space-y-1" role="group" aria-label={`Time slots for ${day.label}`}>
            {day.slots.map(slot => {
              const isCurrent = currentTimeBlockId != null && slot.timeBlockId === currentTimeBlockId
              const freeRooms = freeRoomCount(slot)
              const disabled = !slot.available && !isCurrent
              const active = selectedSlot === slot.timeBlockId
              const state = !slot.candidateFree && !isCurrent
                ? 'Attendee busy'
                : !slot.sponsorHasCapacity || freeRooms === 0
                ? 'Full'
                : 'Free'
              return (
                <div key={slot.timeBlockId}>
                  <button
                    type="button"
                    onClick={() => pickSlot(slot)}
                    disabled={disabled}
                    aria-pressed={active}
                    className={`w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-sm transition-colors ${
                      active
                        ? 'border-brand bg-brand-50 text-ink'
                        : disabled
                        ? 'border-hairline bg-fill text-ink-3 cursor-not-allowed'
                        : 'border-hairline bg-white text-ink hover:bg-fill'
                    }`}
                  >
                    <span className="font-medium tabular-nums">{fmtRangeUTC(slot.startsAt, slot.endsAt)}</span>
                    <span className="flex items-center gap-1.5">
                      {isCurrent && <span className="badge badge-neutral">Current</span>}
                      <span className={`text-xs ${disabled ? 'text-ink-3' : active ? 'text-brand-700 font-medium' : state === 'Free' ? 'text-success-ink font-medium' : 'text-ink-2'}`}>
                        {state}
                      </span>
                    </span>
                  </button>

                  {/* Room picker for the chosen slot */}
                  {active && (
                    <div className="mt-1 mb-2 ml-3 pl-3 border-l-2 border-hairline space-y-1" role="group" aria-label="Meeting room">
                      {slot.rooms.map(room => {
                        const roomActive = selectedRoom === room.name
                        const roomDisabled = !room.available
                        return (
                          <button
                            key={room.name}
                            type="button"
                            onClick={() => onSelectRoom(room.name)}
                            disabled={roomDisabled}
                            aria-pressed={roomActive}
                            className={`w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-sm transition-colors ${
                              roomActive
                                ? 'border-brand bg-brand-50 text-ink'
                                : roomDisabled
                                ? 'border-hairline bg-fill text-ink-3 cursor-not-allowed'
                                : 'border-hairline bg-white text-ink hover:bg-fill'
                            }`}
                          >
                            <span className="font-medium">{room.name}</span>
                            {room.occupancy === 0 ? (
                              <span className="badge badge-success">Available</span>
                            ) : room.available ? (
                              <span className="badge badge-warning">{room.occupancy}/{room.capacity} in use</span>
                            ) : (
                              <span className="badge badge-danger">Full</span>
                            )}
                          </button>
                        )
                      })}
                      {slot.rooms.length === 0 && <p className="text-xs text-ink-3 py-2">No rooms configured.</p>}
                    </div>
                  )}
                </div>
              )
            })}
            {day.slots.length === 0 && <p className="text-xs text-ink-3">No time slots this day.</p>}
          </div>
        </section>
      ))}
    </div>
  )
}
