'use client'

import { useState, useMemo } from 'react'
import {
  format, parseISO, isBefore, isToday, isSameDay,
  startOfWeek, startOfDay, addDays, addWeeks, subWeeks
} from 'date-fns'

type Kind = 'session' | 'timeblock' | 'meeting'

interface CalEvent {
  id: string
  kind: Kind
  title: string
  startsAt: string
  endsAt: string
  meta: string | null
  sub: string | null
}

const KIND_STYLE: Record<Kind, { dot: string; chip: string; bar: string; label: string }> = {
  session:   { dot: 'bg-primary', bar: 'bg-primary', chip: 'bg-brand-50 text-brand-700 border border-brand-200',        label: 'Session' },
  timeblock: { dot: 'bg-warning', bar: 'bg-warning', chip: 'bg-warning-soft text-warning-ink border border-warning/30', label: 'Time Block' },
  meeting:   { dot: 'bg-success', bar: 'bg-success', chip: 'bg-success-soft text-success-ink border border-success/30', label: 'Meeting' },
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-success-soft text-success-ink border border-success/30',
  PENDING:   'bg-warning-soft text-warning-ink border border-warning/30',
  CANCELLED: 'bg-danger-soft text-danger-ink border border-danger/30',
}

function EventModal({ ev, onClose }: { ev: CalEvent; onClose: () => void }) {
  const s = KIND_STYLE[ev.kind]
  const chipClass = ev.kind === 'meeting' && ev.meta ? STATUS_COLORS[ev.meta] ?? s.chip : s.chip
  const chipLabel = ev.kind === 'meeting' ? (ev.meta ?? s.label) : s.label

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Colour header bar */}
        <div className={`h-1.5 w-full ${s.dot}`} />

        <div className="px-5 pt-4 pb-5">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <span className={`inline-flex text-caption font-bold px-2 py-0.5 rounded-full mb-2 ${chipClass}`}>
                {chipLabel}
              </span>
              <h2 className="text-base font-bold text-ink leading-snug">{ev.title}</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close event details"
              className="w-7 h-7 rounded-full bg-fill flex items-center justify-center flex-shrink-0 hover:bg-fill-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Details */}
          <div className="space-y-3">
            {/* Time */}
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-fill flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-ink">
                  {format(parseISO(ev.startsAt), 'h:mm a')} – {format(parseISO(ev.endsAt), 'h:mm a')}
                </p>
                <p className="text-xs text-ink-2">{format(parseISO(ev.startsAt), 'EEEE, MMMM d, yyyy')}</p>
              </div>
            </div>

            {/* Speaker / participant */}
            {ev.sub && (
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-fill flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-ink">{ev.sub}</p>
              </div>
            )}

            {/* Meta (track · type · room / location / status) */}
            {ev.meta && (
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-fill flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-ink">{ev.meta}</p>
              </div>
            )}

            {/* Duration */}
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-fill flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-ink">
                {Math.round((parseISO(ev.endsAt).getTime() - parseISO(ev.startsAt).getTime()) / 60000)} min
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CalendarClient({ events, confStartDate, confEndDate }: { events: CalEvent[]; confStartDate: string | null; confEndDate: string | null }) {
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [activeEvent, setActiveEvent] = useState<CalEvent | null>(null)
  const confStart = confStartDate ? parseISO(confStartDate) : null
  const confEnd = confEndDate ? parseISO(confEndDate) : null

  const [weekStart, setWeekStart] = useState(() => {
    // Start on the week containing the conference start date, first event, or today
    const anchor = confStart
      ?? (events.length > 0 ? parseISO(events.reduce((a, b) => a.startsAt < b.startsAt ? a : b).startsAt) : null)
    return startOfWeek(anchor ?? new Date(), { weekStartsOn: 0 })
  })
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  function toggleDay(day: Date) {
    setSelectedDay(prev => prev && isSameDay(prev, day) ? null : day)
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const filtered = useMemo(
    () => events.filter(e => filter === 'all' || e.kind === filter),
    [events, filter]
  )

  const eventsForDay = (d: Date) =>
    filtered
      .filter(e => isSameDay(parseISO(e.startsAt), d))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  // Master list grouped by day — filtered by selectedDay if set
  const masterList = useMemo(() => {
    const base = selectedDay
      ? filtered.filter(e => isSameDay(parseISO(e.startsAt), selectedDay))
      : filtered
    const sorted = [...base].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    const groups: { day: string; items: CalEvent[] }[] = []
    for (const ev of sorted) {
      const day = ev.startsAt.slice(0, 10)
      const last = groups[groups.length - 1]
      if (last?.day === day) last.items.push(ev)
      else groups.push({ day, items: [ev] })
    }
    return groups
  }, [filtered, selectedDay])

  const filterBar = (
    <div className="flex items-center gap-2 flex-wrap">
      {(['all', 'session', 'timeblock', 'meeting'] as const).map(k => (
        <button
          key={k}
          onClick={() => setFilter(k)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            filter === k
              ? k === 'all'
                ? 'bg-ink text-white border-ink'
                : KIND_STYLE[k].chip
              : 'bg-white text-ink-2 border-hairline hover:border-hairline hover:text-ink-2'
          }`}
        >
          {k !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${KIND_STYLE[k].dot}`} />}
          {k === 'all' ? 'All Events' : KIND_STYLE[k].label + 's'}
        </button>
      ))}
      <span className="ml-auto text-xs text-ink-2 font-medium">
        {filtered.length} events
      </span>
    </div>
  )

  return (
    <div className="space-y-5">
      {filterBar}

      {/* ── Desktop: multi-day week grid ── */}
      <div className="hidden md:block">
        {/* Week nav */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink">
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart(w => subWeeks(w, 1))}
              aria-label="Previous week"
              className="w-7 h-7 rounded-full hover:bg-fill flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => {
                const anchor = confStart
                  ?? (events.length > 0 ? parseISO(events.reduce((a, b) => a.startsAt < b.startsAt ? a : b).startsAt) : null)
                setWeekStart(startOfWeek(anchor ?? new Date(), { weekStartsOn: 0 }))
                setSelectedDay(null)
              }}
              className="px-3 h-7 rounded-full text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              Conference week
            </button>
            <button
              onClick={() => setWeekStart(w => addWeeks(w, 1))}
              aria-label="Next week"
              className="w-7 h-7 rounded-full hover:bg-fill flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Day columns */}
        <div className="flex gap-2">
          {weekDays.map(day => {
            const dayEvents = eventsForDay(day)
            const today = isToday(day)
            const past = isBefore(day, new Date()) && !today
            const dayStart = startOfDay(day)
            const isConfDay = confStart && confEnd
              ? dayStart >= startOfDay(confStart) && dayStart <= startOfDay(confEnd)
              : false
            return (
              <div key={day.toISOString()} className={`flex flex-col gap-1.5 ${isConfDay ? 'flex-[3]' : 'flex-[1]'}`}>
                {/* Day header — clickable */}
                {(() => {
                  const isSelected = selectedDay ? isSameDay(selectedDay, day) : false
                  const showPrimary = isSelected || (!selectedDay && today)
                  return (
                    <button
                      onClick={() => toggleDay(day)}
                      className={`flex flex-col items-center py-2 rounded-xl w-full transition-all ${
                        isSelected
                          ? 'bg-primary ring-2 ring-primary ring-offset-2'
                          : !selectedDay && today
                          ? 'bg-primary'
                          : isConfDay
                          ? 'bg-white border-2 border-primary/30 hover:border-primary/60 hover:bg-primary/5'
                          : 'bg-white border border-hairline hover:border-primary/40 hover:bg-primary/5'
                      }`}
                    >
                      {isConfDay && !showPrimary && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-primary/60 leading-none mb-0.5">Conf</span>
                      )}
                      <span className={`text-caption font-bold uppercase ${showPrimary ? 'text-white/70' : 'text-ink-2'}`}>
                        {format(day, 'EEE')}
                      </span>
                      <span className={`text-lg font-bold leading-tight ${showPrimary ? 'text-white' : past ? 'text-ink-3' : 'text-ink'}`}>
                        {format(day, 'd')}
                      </span>
                    </button>
                  )
                })()}

                {/* Events */}
                <div className={`flex flex-col gap-1 min-h-[120px] transition-opacity ${
                  selectedDay && !isSameDay(selectedDay, day) ? 'opacity-20' : past ? 'opacity-50' : ''
                }`}>
                  {dayEvents.length === 0 ? (
                    <div className="flex-1 rounded-xl border border-dashed border-hairline" />
                  ) : (
                    dayEvents.map(ev => {
                      const s = KIND_STYLE[ev.kind]
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setActiveEvent(ev)}
                          className="rounded-lg px-2 py-1.5 border w-full text-left hover:brightness-95 active:scale-[0.98] transition-all"
                          style={{
                            borderColor: ev.kind === 'session' ? '#c7d2fe' : ev.kind === 'timeblock' ? '#ffe2b6' : '#bbe6c8',
                            background: ev.kind === 'session' ? '#eef2ff' : ev.kind === 'timeblock' ? '#fff3e0' : '#e7f8ec',
                          }}
                        >
                          <div className="flex items-start gap-1">
                            <div className={`w-1 h-1 rounded-full mt-1 flex-shrink-0 ${s.dot}`} />
                            <p className="text-caption font-semibold text-ink leading-snug line-clamp-2">{ev.title}</p>
                          </div>
                          <p className="text-caption text-ink-2 mt-0.5 pl-2">
                            {format(parseISO(ev.startsAt), 'h:mm a')}
                          </p>
                          <div className="pl-2 mt-0.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              ev.kind === 'meeting' && ev.meta ? STATUS_COLORS[ev.meta] ?? s.chip : s.chip
                            }`}>
                              {ev.kind === 'meeting' ? (ev.meta ?? s.label) : s.label}
                            </span>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Mobile: master list ── */}
      <div className="md:hidden">
        {masterList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-hairline">
            <p className="text-sm font-medium text-ink-2">No events found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {masterList.map(({ day, items }) => {
              const d = parseISO(day)
              const isPast = isBefore(d, new Date()) && !isToday(d)
              return (
                <div key={day}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center ${
                      isToday(d) ? 'bg-primary text-white' : isPast ? 'bg-fill' : 'bg-white border border-hairline'
                    }`}>
                      <span className={`text-caption font-bold uppercase leading-none ${isToday(d) ? 'text-white/70' : 'text-ink-2'}`}>
                        {format(d, 'EEE')}
                      </span>
                      <span className={`text-base font-bold leading-tight ${isToday(d) ? 'text-white' : isPast ? 'text-ink-2' : 'text-ink'}`}>
                        {format(d, 'd')}
                      </span>
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isPast ? 'text-ink-2' : 'text-ink'}`}>
                        {isToday(d) ? 'Today' : format(d, 'EEEE, MMMM d, yyyy')}
                      </p>
                      <p className="text-xs text-ink-2">{items.length} event{items.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 pl-[52px]">
                    {items.map(ev => {
                      const s = KIND_STYLE[ev.kind]
                      return (
                        <button key={ev.id} onClick={() => setActiveEvent(ev)} className={`flex items-start gap-3 bg-white rounded-xl border px-4 py-3 w-full text-left hover:brightness-95 transition-all ${isPast ? 'opacity-60' : ''}`}
                          style={{ borderColor: ev.kind === 'session' ? '#c7d2fe' : ev.kind === 'timeblock' ? '#ffe2b6' : '#bbe6c8' }}>
                          <div className={`w-1 rounded-full self-stretch flex-shrink-0 ${s.dot}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-ink leading-snug">{ev.title}</p>
                              <span className={`text-caption font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                ev.kind === 'meeting' && ev.meta ? STATUS_COLORS[ev.meta] ?? s.chip : s.chip
                              }`}>
                                {ev.kind === 'meeting' ? (ev.meta ?? s.label) : s.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-ink-2">
                                {format(parseISO(ev.startsAt), 'h:mm a')} – {format(parseISO(ev.endsAt), 'h:mm a')}
                              </span>
                              {ev.meta && ev.kind !== 'meeting' && <span className="text-xs text-ink-2">· {ev.meta}</span>}
                              {ev.sub && <span className="text-xs text-ink-2">· {ev.sub}</span>}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Desktop: full master list below week grid ── */}
      <div className="hidden md:block">
        <div className="flex items-center gap-3 mb-3">
          <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest">
            {selectedDay ? format(selectedDay, 'EEEE, MMMM d') : 'All Events'}
          </p>
          {selectedDay && (
            <button
              onClick={() => setSelectedDay(null)}
              className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}
        </div>
        {masterList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-hairline">
            <p className="text-sm font-medium text-ink-2">No events found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {masterList.map(({ day, items }) => {
              const d = parseISO(day)
              const isPast = isBefore(d, new Date()) && !isToday(d)
              return (
                <div key={day}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center ${
                      isToday(d) ? 'bg-primary' : isPast ? 'bg-fill' : 'bg-white border border-hairline'
                    }`}>
                      <span className={`text-caption font-bold uppercase leading-none ${isToday(d) ? 'text-white/70' : 'text-ink-2'}`}>
                        {format(d, 'EEE')}
                      </span>
                      <span className={`text-base font-bold leading-tight ${isToday(d) ? 'text-white' : isPast ? 'text-ink-2' : 'text-ink'}`}>
                        {format(d, 'd')}
                      </span>
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isPast ? 'text-ink-2' : 'text-ink'}`}>
                        {isToday(d) ? 'Today' : format(d, 'EEEE, MMMM d, yyyy')}
                      </p>
                      <p className="text-xs text-ink-2">{items.length} event{items.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 pl-[52px]">
                    {items.map(ev => {
                      const s = KIND_STYLE[ev.kind]
                      return (
                        <div key={ev.id} className={`flex items-start gap-3 bg-white rounded-xl border px-4 py-3 ${isPast ? 'opacity-60' : ''}`}
                          style={{ borderColor: ev.kind === 'session' ? '#c7d2fe' : ev.kind === 'timeblock' ? '#ffe2b6' : '#bbe6c8' }}>
                          <div className={`w-1 rounded-full self-stretch flex-shrink-0 ${s.dot}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-ink leading-snug">{ev.title}</p>
                              <span className={`text-caption font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                ev.kind === 'meeting' && ev.meta ? STATUS_COLORS[ev.meta] ?? s.chip : s.chip
                              }`}>
                                {ev.kind === 'meeting' ? (ev.meta ?? s.label) : s.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-ink-2">
                                {format(parseISO(ev.startsAt), 'h:mm a')} – {format(parseISO(ev.endsAt), 'h:mm a')}
                              </span>
                              {ev.meta && ev.kind !== 'meeting' && <span className="text-xs text-ink-2">· {ev.meta}</span>}
                              {ev.sub && <span className="text-xs text-ink-2">· {ev.sub}</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Event detail modal */}
      {activeEvent && <EventModal ev={activeEvent} onClose={() => setActiveEvent(null)} />}
    </div>
  )
}
