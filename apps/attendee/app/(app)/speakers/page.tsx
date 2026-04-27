import { prisma } from '@conference/db'
import { SpeakersClient } from '@/components/speakers/SpeakersClient'

export default async function SpeakersPage() {
  const conference = await prisma.conference.findFirst({ where: { active: true } })

  const speakers = conference
    ? await prisma.speaker.findMany({
        where: { conferenceId: conference.id },
        include: {
          confSessions: {
            select: { track: true },
            orderBy: { startsAt: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      })
    : []

  const data = speakers.map(s => ({
    id: s.id,
    name: s.name,
    jobTitle: s.jobTitle,
    company: s.company,
    photoUrl: s.photoUrl,
    bio: s.bio,
    role: s.role,
    lookingFor: s.lookingFor,
    twitterHandle: s.twitterHandle,
    linkedinUrl: s.linkedinUrl,
    // Primary track = first session's track, or null
    track: s.confSessions.find(cs => cs.track)?.track ?? null,
  }))

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #eef2ff 0%, #f8f8fc 40%)' }}>
      <div className="px-4 sm:px-5 md:px-8 lg:px-12 pt-4 pb-3 sticky top-0 z-10 backdrop-blur-md border-b border-gray-100/60" style={{ background: 'rgba(238, 242, 255, 0.85)' }}>
        <h1 className="text-2xl sm:text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Speakers</h1>
        <p className="text-sm text-gray-400 mt-0.5">{speakers.length} speakers</p>
      </div>

      <SpeakersClient speakers={data} />
    </div>
  )
}
