'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { AutoMatch, AutoMatchLogEntry } from '@conference/db'
import { useAutoMatchBoard } from '@/lib/scheduler-hooks'
import { fmtRangeUTC, fmtTimeUTC } from '@/lib/format'
import { TIER_COLORS, TIER_FALLBACK } from '@/lib/meetings-ui'

const fmtPickDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const fmtLogTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function initial(name: string | null | undefined) {
  return (name?.trim()[0] ?? '?').toUpperCase()
}

// Group the flat, engine-ordered match list by sponsor company, companies
// alphabetical, matches keeping engine order (awaiting first, then by slot).
function groupByCompany(matches: AutoMatch[]) {
  const groups = new Map<string, { sponsor: AutoMatch['sponsor']; matches: AutoMatch[] }>()
  for (const m of matches) {
    let g = groups.get(m.sponsor.id)
    if (!g) {
      g = { sponsor: m.sponsor, matches: [] }
      groups.set(m.sponsor.id, g)
    }
    g.matches.push(m)
  }
  return Array.from(groups.values()).sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name))
}

// Mutual Best Fit matches: when a sponsor and an attendee each pick the other
// as Best Fit through their portals, the pair matches and the meeting is
// scheduled automatically (at pick time, with a self-healing sweep on every
// board read). This board is the record of that automation: matches sectioned
// by company, plus the audit log of match/schedule events.
export function AutoMatchBoard() {
  const { data: board, isLoading, isError, refetch } = useAutoMatchBoard()

  if (isError) {
    return (
      <div className="rounded-xl bg-danger-soft text-danger-ink text-sm px-4 py-3" role="alert">
        Couldn&rsquo;t load auto matches.{' '}
        <button type="button" onClick={() => refetch()} className="underline font-medium">
          Retry
        </button>
      </div>
    )
  }

  if (isLoading || !board) return <BoardSkeleton />

  const companies = groupByCompany(board.matches)

  return (
    <div>
      {/* ── Summary tiles ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-2">
        <div className="grid grid-cols-3 gap-3 flex-1 max-w-xl">
          {([
            { label: 'Mutual Matches', val: board.totals.matches, num: 'text-ink' },
            { label: 'Auto-Scheduled', val: board.totals.scheduled, num: 'text-success-ink' },
            { label: 'Awaiting Slot', val: board.totals.ready, num: board.totals.ready > 0 ? 'text-warning-ink' : 'text-ink' },
          ] as const).map(({ label, val, num }) => (
            <div key={label} className="bg-white border border-hairline rounded-xl px-4 py-3">
              <p className="text-caption text-ink-2 font-medium mb-1.5">{label}</p>
              <p className={`text-2xl font-bold tabular-nums ${num}`}>{val}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-caption text-ink-3 mb-5">
        When a sponsor and an attendee each pick the other as Best Fit, the meeting is scheduled automatically.
      </p>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr),320px] lg:gap-6 space-y-6 lg:space-y-0">
        {/* ── Matches, sectioned by company ── */}
        <div>
          {companies.length === 0 ? (
            <div className="empty-state bg-white border border-hairline rounded-xl">
              <p className="font-medium text-ink">No mutual matches yet</p>
              <p className="text-sm text-ink-2 max-w-md">
                A match forms — and its meeting is scheduled automatically — the moment a sponsor and an
                attendee each pick the other as <span className="font-medium">Best Fit</span> through their portals.
              </p>
              <Link href="?tab=requests" className="mt-2 text-primary text-sm hover:underline">
                View all meeting requests {'→'}
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {companies.map(({ sponsor, matches }) => (
                <CompanySection key={sponsor.id} sponsor={sponsor} matches={matches} />
              ))}
            </div>
          )}
        </div>

        {/* ── Activity log ── */}
        <aside aria-label="Auto-match activity log">
          <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2">Activity</p>
          <div className="bg-white border border-hairline rounded-xl overflow-hidden">
            {board.log.length === 0 ? (
              <p className="text-sm text-ink-3 px-4 py-6 text-center">No activity yet</p>
            ) : (
              <ol className="divide-y divide-hairline max-h-[36rem] overflow-y-auto">
                {board.log.map(entry => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function CompanySection({ sponsor, matches }: { sponsor: AutoMatch['sponsor']; matches: AutoMatch[] }) {
  const scheduled = matches.filter(m => m.meeting).length
  return (
    <section aria-label={`${sponsor.name} auto matches`}>
      <div className="flex items-center gap-2.5 mb-2">
        {sponsor.logoUrl ? (
          <div className="w-7 h-7 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
            <Image src={sponsor.logoUrl} alt="" width={28} height={28} className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-lg bg-fill flex items-center justify-center text-ink-2 font-bold text-xs flex-shrink-0">
            {initial(sponsor.name)}
          </div>
        )}
        <h3 className="font-semibold text-ink">{sponsor.name}</h3>
        <span className={`badge text-caption ${TIER_COLORS[sponsor.tier] ?? TIER_FALLBACK}`}>{sponsor.tier}</span>
        <span className={`badge text-caption tabular-nums ml-auto ${scheduled === matches.length ? 'badge-success' : 'badge-neutral'}`}>
          {scheduled} of {matches.length} scheduled
        </span>
      </div>
      <div className="space-y-2">
        {matches.map(m => (
          <MatchCard key={m.key} match={m} />
        ))}
      </div>
    </section>
  )
}

// One matched pair within its company section: the attendee, the mutual-pick
// signal, both picks' provenance, and the auto-scheduled slot/room (or the
// waiting state when every slot is currently taken).
function MatchCard({ match }: { match: AutoMatch }) {
  return (
    <div className="bg-white border border-hairline rounded-xl px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Attendee */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-48">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
            {initial(match.attendee.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink leading-tight truncate">{match.attendee.name}</p>
            {match.attendee.company && <p className="text-xs text-ink-2 truncate">{match.attendee.company}</p>}
          </div>
        </div>

        {/* Mutual badge */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="badge badge-brand whitespace-nowrap">{'↔'} Mutual Best Fit</span>
          {match.score > 0 && <span className="text-caption text-ink-3 tabular-nums">{match.score}% fit</span>}
        </div>

        {/* Outcome */}
        <div className="flex-shrink-0 text-right ml-auto">
          {match.meeting ? (
            <>
              <span className="badge badge-success">{'✓'} Scheduled</span>
              <p className="text-xs text-ink-2 tabular-nums mt-1">
                {fmtRangeUTC(match.meeting.startsAt, match.meeting.endsAt)}
                {match.meeting.room && <span className="text-ink-3"> {'·'} {match.meeting.room}</span>}
              </p>
            </>
          ) : (
            <>
              <span className="badge badge-warning">Awaiting slot</span>
              <p className="text-caption text-ink-3 mt-1">Schedules when a slot frees up</p>
            </>
          )}
        </div>
      </div>

      {/* Pick provenance */}
      <p className="text-caption text-ink-3 mt-2">
        {match.sponsorPick.byName} picked Best Fit {fmtPickDate(match.sponsorPick.pickedAt)}
        <span className="mx-1">{'·'}</span>
        {match.attendeePick.byName} picked Best Fit {fmtPickDate(match.attendeePick.pickedAt)}
        <span className="mx-1">{'·'}</span>
        Matched {fmtPickDate(match.matchedAt)}
        {match.matchedSolutions.length > 0 && (
          <>
            <span className="mx-1">{'·'}</span>
            {match.matchedSolutions.slice(0, 3).join(', ')}
            {match.matchedSolutions.length > 3 && ` +${match.matchedSolutions.length - 3}`}
          </>
        )}
      </p>
    </div>
  )
}

function LogRow({ entry }: { entry: AutoMatchLogEntry }) {
  const scheduled = entry.event === 'SCHEDULED'
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${scheduled ? 'bg-success' : 'bg-brand'}`}
        />
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink leading-snug">
            {entry.sponsorName} {'↔'} {entry.attendeeName}
          </p>
          <p className="text-caption text-ink-2 leading-snug">
            {scheduled ? (
              <>
                Meeting auto-scheduled
                {entry.room && <> {'·'} {entry.room}</>}
                {entry.startsAt && <> {'·'} {fmtTimeUTC(entry.startsAt)}</>}
              </>
            ) : (
              <>Matched {'·'} both picked Best Fit</>
            )}
          </p>
          <p className="text-caption text-ink-3 tabular-nums">{fmtLogTime(entry.createdAt)}</p>
        </div>
      </div>
    </li>
  )
}

function BoardSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 max-w-xl mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border border-hairline rounded-xl px-4 py-3">
            <div className="skeleton h-3 w-20 mb-2" />
            <div className="skeleton h-8 w-10" />
          </div>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr),320px] lg:gap-6 space-y-6 lg:space-y-0">
        <div className="space-y-2">
          <div className="skeleton h-6 w-56 mb-2" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-hairline rounded-xl px-4 py-4 flex items-center gap-4">
              <div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-4 w-28 mx-auto" />
              <div className="skeleton h-4 w-24 ml-auto" />
            </div>
          ))}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    </div>
  )
}
