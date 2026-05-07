import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { format } from 'date-fns'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const GRADIENTS = [
  ['#7c3aed', '#6366f1'],
  ['#6366f1', '#3b82f6'],
  ['#ec4899', '#f43f5e'],
  ['#f59e0b', '#f97316'],
  ['#14b8a6', '#06b6d4'],
  ['#10b981', '#14b8a6'],
]

function getGradient(name: string) {
  return GRADIENTS[name.charCodeAt(0) % GRADIENTS.length]
}

function getCachedSpeakerDetail(id: string) {
  return unstable_cache(
    async () =>
      prisma.speaker.findUnique({
        where: { id },
        include: {
          confSessions: { select: { id: true, title: true, startsAt: true, endsAt: true, room: true, track: true, type: true }, orderBy: { startsAt: 'asc' } },
        },
      }),
    ['attendee-speaker-detail', id],
    { revalidate: 60, tags: [`speaker-${id}`] },
  )()
}

export default async function SpeakerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const speaker = await getCachedSpeakerDetail(id)

  if (!speaker) notFound()

  const [from, to] = getGradient(speaker.name)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative px-4 pt-14 pb-8"
        style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
      >
        {/* Back */}
        <Link
          href="/speakers"
          className="absolute top-14 left-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        {/* Avatar */}
        <div className="flex flex-col items-center mt-6">
          {speaker.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={speaker.photoUrl}
              alt={speaker.name}
              className="w-24 h-24 rounded-3xl object-cover border-4 border-white/30 shadow-2xl"
            />
          ) : (
            <div className="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-sm border-4 border-white/30 flex items-center justify-center shadow-2xl">
              <span className="text-white font-bold text-4xl">{speaker.name[0]}</span>
            </div>
          )}

          <h1 className="text-white font-bold text-2xl mt-4 text-center leading-tight">{speaker.name}</h1>
          {speaker.jobTitle && (
            <p className="text-white/80 text-sm mt-1 text-center">{speaker.jobTitle}</p>
          )}
          {speaker.company && (
            <span className="mt-2 bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">
              {speaker.company}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 -mt-4 pb-28">
        {/* Social links */}
        {(speaker.twitterHandle || speaker.linkedinUrl) && (
          <div className="flex gap-3 mb-4 mt-4">
            {speaker.twitterHandle && (
              <a
                href={`https://twitter.com/${speaker.twitterHandle.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-white rounded-2xl py-3 shadow-sm border border-gray-100 text-gray-900 text-sm font-semibold active:scale-95 transition-transform"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Twitter
              </a>
            )}
            {speaker.linkedinUrl && (
              <a
                href={speaker.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-white rounded-2xl py-3 shadow-sm border border-gray-100 text-gray-900 text-sm font-semibold active:scale-95 transition-transform"
              >
                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                LinkedIn
              </a>
            )}
          </div>
        )}

        {/* Bio */}
        {speaker.bio && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">About</h2>
            <p className="text-gray-700 text-sm leading-relaxed">{speaker.bio}</p>
          </div>
        )}

        {/* Sessions */}
        {speaker.confSessions.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Sessions</h2>
            <div className="space-y-2">
              {speaker.confSessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/schedule/${session.id}`}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 active:scale-[0.99] transition-transform"
                >
                  <div className="flex-shrink-0 text-center w-14">
                    <div className="text-indigo-600 font-bold text-sm">{format(session.startsAt, 'h:mm')}</div>
                    <div className="text-gray-400 text-xs">{format(session.startsAt, 'a')}</div>
                  </div>
                  <div className="w-px self-stretch bg-indigo-100" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{session.title}</h3>
                    {session.room && (
                      <div className="flex items-center gap-1 mt-1">
                        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <p className="text-xs text-gray-400">{session.room}</p>
                      </div>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
