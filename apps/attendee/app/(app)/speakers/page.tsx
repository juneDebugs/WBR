export const revalidate = 300
import { prisma } from '@conference/db'
import { SpeakersClient } from '@/components/speakers/SpeakersClient'

export default async function SpeakersPage() {
  const [conference, allSpeakers] = await Promise.all([
    prisma.conference.findFirst({ where: { active: true }, select: { id: true } }),
    prisma.speaker.findMany({
      select: {
        id: true, name: true, jobTitle: true, company: true, photoUrl: true,
        bio: true, role: true, lookingFor: true, twitterHandle: true, linkedinUrl: true,
        conferenceId: true,
        confSessions: { select: { track: true }, orderBy: { startsAt: 'asc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    }),
  ])

  const speakers = conference
    ? allSpeakers.filter(s => s.conferenceId === conference.id)
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
    track: s.role ?? s.confSessions[0]?.track ?? null,
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
