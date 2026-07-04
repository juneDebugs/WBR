import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import SpeakersClient from '@/components/SpeakersClient'
import { permissionDenied } from '@/lib/require-permission'

const getCachedSpeakers = unstable_cache(
  async () => {
    const speakers = await prisma.speaker.findMany({
      select: {
        id: true, name: true, photoUrl: true, photoPosition: true,
        jobTitle: true, company: true, bio: true,
        twitterHandle: true, linkedinUrl: true,
        _count: { select: { confSessions: true } },
      },
      orderBy: { name: 'asc' },
    })
    return speakers.map(s => ({
      ...s,
      photoUrl: s.photoUrl ? (s.photoUrl.startsWith('data:') ? `/api/speakers/${s.id}/photo` : s.photoUrl) : null,
    }))
  },
  ['web-speakers'],
  { revalidate: 60, tags: ['speakers'] },
)

export default async function SpeakersPage() {
  const denied = await permissionDenied('speakers', 'Speakers')
  if (denied) return denied

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
