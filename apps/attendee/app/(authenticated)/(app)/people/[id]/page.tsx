import { prisma, getFriendStatus } from '@conference/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { FriendActionButton } from '@/components/people/FriendActionButton'

export default async function PersonProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = (await getSession())!
  const currentUserId = session.user!.id

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      image: true,
      bio: true,
      company: true,
      jobTitle: true,
      website: true,
      linkedinUrl: true,
      speakerProfile: { select: { id: true, twitterHandle: true } },
    },
  })

  if (!user) notFound()

  const name = user.name ?? 'Unknown'
  const linkedinUrl = user.linkedinUrl ?? null
  const twitterHandle = user.speakerProfile?.twitterHandle ?? null
  const isOther = user.id !== currentUserId

  const friendStatus = isOther ? await getFriendStatus(prisma, currentUserId, user.id) : 'none'

  // Only consumed by the Message tile, which renders only for friends —
  // skip the room lookup entirely on non-friend profiles.
  const existingRoom = friendStatus === 'friends'
    ? await prisma.chatRoom.findFirst({
        where: {
          type: 'DIRECT',
          AND: [
            { members: { some: { userId: currentUserId } } },
            { members: { some: { userId: user.id } } },
          ],
        },
        select: { id: true },
      })
    : null

  // Another user's profile always has at least one action: the Message tile
  // (friends) or the friend-request tile (everything else).
  const hasActions = isOther || linkedinUrl || twitterHandle || user.website
  const hasDetails = user.bio || user.company || user.jobTitle || user.website
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-canvas">
      {/* iOS-style navigation bar — body already applies safe-area-inset-top */}
      <div
        className="sticky top-0 z-10 flex items-center px-4 material-bar"
        style={{
          paddingTop: '0.75rem',
          paddingBottom: '0.5rem',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        }}
      >
        <Link
          href="/people"
          className="flex items-center gap-1 text-primary text-[15px] font-normal active:opacity-50 transition-opacity -ml-1"
        >
          <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          People
        </Link>
      </div>

      {/* Contact card header */}
      <div className="flex flex-col items-center pt-4 pb-5 px-4">
        {/* Avatar */}
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={name}
            className="w-[100px] h-[100px] rounded-full object-cover"
            style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
          />
        ) : (
          <div
            className="w-[100px] h-[100px] rounded-full flex items-center justify-center bg-ink-3"
            style={{
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            }}
          >
            <span className="text-white font-medium text-4xl leading-none" style={{ letterSpacing: '-0.02em' }}>
              {initials}
            </span>
          </div>
        )}

        {/* Name */}
        <h1 className="text-[22px] font-bold text-ink mt-3 text-center leading-tight tracking-tight">
          {name}
        </h1>

        {/* Title & Company */}
        {(user.jobTitle || user.company) && (
          <p className="text-[13px] text-ink-2 mt-0.5 text-center leading-snug">
            {user.jobTitle}{user.jobTitle && user.company ? ' at ' : ''}{user.company}
          </p>
        )}
      </div>

      {/* Action buttons row — iOS Contact style */}
      {hasActions && (
        <div className="flex justify-center gap-2 px-6 pb-5">
          {isOther && friendStatus === 'friends' && (
            <Link
              href={existingRoom ? `/chat/${existingRoom.id}` : `/chat/dm/${user.id}`}
              className="flex flex-col items-center gap-1 flex-1 max-w-[80px] active:opacity-50 transition-opacity"
            >
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="w-[20px] h-[20px] text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <span className="text-[10px] font-medium text-primary">Message</span>
            </Link>
          )}

          {/* Friend tile: the primary action until you're friends, then an
              inert "Friends" state marker next to the Message tile. */}
          {isOther && (
            <FriendActionButton userId={user.id} name={user.name} initialStatus={friendStatus} />
          )}

          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 flex-1 max-w-[80px] active:opacity-50 transition-opacity"
            >
              <div className="w-11 h-11 rounded-full bg-[#0A66C2]/10 flex items-center justify-center">
                <svg className="w-[18px] h-[18px] text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </div>
              <span className="text-[10px] font-medium text-[#0A66C2]">LinkedIn</span>
            </a>
          )}

          {twitterHandle && (
            <a
              href={`https://twitter.com/${twitterHandle.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 flex-1 max-w-[80px] active:opacity-50 transition-opacity"
            >
              <div className="w-11 h-11 rounded-full bg-ink/5 flex items-center justify-center">
                <svg className="w-[16px] h-[16px] text-ink" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
              <span className="text-[10px] font-medium text-ink">Twitter</span>
            </a>
          )}

          {user.website && (
            <a
              href={user.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 flex-1 max-w-[80px] active:opacity-50 transition-opacity"
            >
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="w-[18px] h-[18px] text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-4.247m0 0A8.966 8.966 0 003 12c0-1.264.26-2.467.732-3.56" />
                </svg>
              </div>
              <span className="text-[10px] font-medium text-primary">Website</span>
            </a>
          )}
        </div>
      )}

      {/* Info sections — iOS grouped list style */}
      <div className="px-4 pb-28 space-y-5">
        {/* About */}
        {user.bio && (
          <div>
            <p className="text-[12px] font-medium text-ink-3 uppercase tracking-wide px-3 mb-1.5">About</p>
            <div className="bg-white rounded-[14px] px-4 py-3.5" style={{ boxShadow: '0 0.5px 1px rgba(0,0,0,0.04)' }}>
              <p className="text-[15px] text-ink leading-relaxed">{user.bio}</p>
            </div>
          </div>
        )}

        {/* Details */}
        {hasDetails && (
          <div>
            <p className="text-[12px] font-medium text-ink-3 uppercase tracking-wide px-3 mb-1.5">Info</p>
            <div className="bg-white rounded-[14px] overflow-hidden" style={{ boxShadow: '0 0.5px 1px rgba(0,0,0,0.04)' }}>
              {user.jobTitle && (
                <div className="px-4 py-3 flex items-start gap-3">
                  <svg className="w-[18px] h-[18px] text-ink-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-ink-3 font-medium">Title</p>
                    <p className="text-[15px] text-ink">{user.jobTitle}</p>
                  </div>
                </div>
              )}

              {user.company && user.jobTitle && (
                <div className="mx-4 border-t border-hairline" />
              )}

              {user.company && (
                <div className="px-4 py-3 flex items-start gap-3">
                  <svg className="w-[18px] h-[18px] text-ink-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-ink-3 font-medium">Company</p>
                    <p className="text-[15px] text-ink">{user.company}</p>
                  </div>
                </div>
              )}

              {user.website && (user.jobTitle || user.company) && (
                <div className="mx-4 border-t border-hairline" />
              )}

              {user.website && (
                <a
                  href={user.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 flex items-start gap-3 active:bg-fill transition-colors"
                >
                  <svg className="w-[18px] h-[18px] text-ink-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-ink-3 font-medium">Website</p>
                    <p className="text-[15px] text-primary truncate">{user.website.replace(/^https?:\/\//, '')}</p>
                  </div>
                  <svg className="w-[14px] h-[14px] text-ink-3 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Speaker sessions link */}
        {user.speakerProfile && (
          <div>
            <p className="text-[12px] font-medium text-ink-3 uppercase tracking-wide px-3 mb-1.5">Conference</p>
            <Link
              href={`/speakers/${user.speakerProfile.id}`}
              className="bg-white rounded-[14px] px-4 py-3.5 flex items-center gap-3 active:bg-fill transition-colors"
              style={{ boxShadow: '0 0.5px 1px rgba(0,0,0,0.04)' }}
            >
              <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-[16px] h-[16px] text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-ink font-medium">Speaker Profile</p>
                <p className="text-[12px] text-ink-3 mt-0.5">View sessions and talks</p>
              </div>
              <svg className="w-[14px] h-[14px] text-ink-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
