import { AdminHeader } from '@/components/AdminHeader'
import SpeakersClient from '@/components/SpeakersClient'
import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'

const getCachedSpeakers = unstable_cache(
  async () => prisma.speaker.findMany({
    select: {
      id: true,
      name: true,
      photoUrl: true,
      photoPosition: true,
      jobTitle: true,
      company: true,
      bio: true,
      twitterHandle: true,
      linkedinUrl: true,
      _count: { select: { confSessions: true } },
    },
    orderBy: { name: 'asc' },
  }),
  ['web-speakers'],
  { revalidate: 60, tags: ['speakers'] },
)

export default async function SpeakersPage() {
  const speakers = await getCachedSpeakers()

  return (
    <>
      <AdminHeader title="Speakers" />
      <main className="flex-1 p-6">
        <SpeakersClient initialSpeakers={speakers} />
      </main>
    </>
  )
}
