import { prisma } from '@conference/db'
import { format } from 'date-fns'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const session = await prisma.confSession.findUnique({
    where: { id: params.id },
    include: { speaker: true },
  })

  if (!session) notFound()

  const typeLabel = session.type.charAt(0) + session.type.slice(1).toLowerCase()

  return (
    <div className="page-container">
      <Link href="/schedule" className="flex items-center gap-1 text-primary text-sm mb-4">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Schedule
      </Link>

      <div className="card">
        <div className="mb-3">
          <span className="badge bg-primary/10 text-primary">{typeLabel}</span>
          {session.track && <span className="badge bg-gray-100 text-gray-600 ml-2">{session.track}</span>}
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-3">{session.title}</h1>

        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {format(session.startsAt, 'h:mm a')} – {format(session.endsAt, 'h:mm a')}
          </div>
          {session.room && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {session.room}
            </div>
          )}
        </div>

        {session.description && (
          <p className="text-gray-600 text-sm leading-relaxed">{session.description}</p>
        )}
      </div>

      {session.speaker && (
        <div className="card mt-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Speaker</h2>
          <Link href={`/speakers/${session.speaker.id}`} className="flex items-center gap-3">
            {session.speaker.photoUrl ? (
              <Image
                src={session.speaker.photoUrl}
                alt={session.speaker.name}
                width={48}
                height={48}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold text-lg">{session.speaker.name[0]}</span>
              </div>
            )}
            <div>
              <div className="font-semibold text-gray-900">{session.speaker.name}</div>
              <div className="text-sm text-gray-500">
                {[session.speaker.jobTitle, session.speaker.company].filter(Boolean).join(' · ')}
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  )
}
