import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'

const getCachedConference = unstable_cache(
  async () => prisma.conference.findFirst({ where: { active: true }, select: { id: true } }),
  ['attendee-conference'],
  { revalidate: 300, tags: ['conference'] },
)

const getCachedAllSpeakers = unstable_cache(
  async () =>
    prisma.speaker.findMany({
      select: {
        id: true, name: true, jobTitle: true, company: true, photoUrl: true, photoPosition: true,
        bio: true, role: true, lookingFor: true, twitterHandle: true, linkedinUrl: true,
        conferenceId: true,
        confSessions: { select: { track: true }, orderBy: { startsAt: 'asc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    }),
  ['attendee-all-speakers'],
  { revalidate: 60, tags: ['speakers'] },
)

export async function fetchSpeakersData() {
  const [conference, allSpeakers] = await Promise.all([
    getCachedConference(),
    getCachedAllSpeakers(),
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
    photoPosition: s.photoPosition,
    bio: s.bio,
    role: s.role,
    lookingFor: s.lookingFor,
    twitterHandle: s.twitterHandle,
    linkedinUrl: s.linkedinUrl,
    track: s.role ?? s.confSessions[0]?.track ?? null,
  }))

  return { speakers: data, count: data.length }
}
