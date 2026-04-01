import Link from 'next/link'
import { format } from 'date-fns'
import type { SessionWithSpeaker } from '@conference/db'

const typeColors: Record<string, string> = {
  KEYNOTE: 'bg-purple-100 text-purple-700',
  TALK: 'bg-blue-100 text-blue-700',
  WORKSHOP: 'bg-green-100 text-green-700',
  PANEL: 'bg-orange-100 text-orange-700',
  BREAK: 'bg-gray-100 text-gray-500',
}

interface Props {
  session: SessionWithSpeaker
}

export function SessionCard({ session }: Props) {
  const isBreak = session.type === 'BREAK'
  const typeLabel = session.type.charAt(0) + session.type.slice(1).toLowerCase()

  if (isBreak) {
    return (
      <div className="flex items-center gap-3 py-2 px-4 bg-gray-50 rounded-xl">
        <span className="text-xs text-gray-400 w-16 flex-shrink-0">
          {format(session.startsAt, 'h:mm a')}
        </span>
        <span className="text-sm text-gray-400 font-medium">{session.title}</span>
      </div>
    )
  }

  return (
    <Link href={`/schedule/${session.id}`} className="card block active:scale-[0.99] transition-transform">
      <div className="flex items-start gap-3">
        <div className="text-xs text-gray-500 w-16 flex-shrink-0 pt-0.5">
          <div>{format(session.startsAt, 'h:mm a')}</div>
          <div className="text-gray-400">{format(session.endsAt, 'h:mm a')}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{session.title}</h3>
            <span className={`badge flex-shrink-0 ${typeColors[session.type] ?? 'bg-gray-100 text-gray-600'}`}>
              {typeLabel}
            </span>
          </div>
          {session.speaker && (
            <p className="text-xs text-gray-500">
              {[session.speaker.name, session.speaker.company].filter(Boolean).join(' · ')}
            </p>
          )}
          {session.room && (
            <p className="text-xs text-gray-400 mt-1">{session.room}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
