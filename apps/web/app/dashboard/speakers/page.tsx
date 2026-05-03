export const revalidate = 60
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import SpeakersClient from '@/components/SpeakersClient'

export default async function SpeakersPage() {
  const speakers = await prisma.speaker.findMany({
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
  })

  return (
    <>
      <AdminHeader title="Speakers" />
      <main className="flex-1 p-6">
        <SpeakersClient initialSpeakers={speakers} />
      </main>
    </>
  )
}
