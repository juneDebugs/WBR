export const revalidate = 60

import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { AttendeesTable } from '@/components/AttendeesTable'

const getCachedAttendees = unstable_cache(
  async () => prisma.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, image: true, role: true, company: true, jobTitle: true },
  }),
  ['web-attendees'],
  { revalidate: 300, tags: ['attendees'] },
)

export default async function AttendeesPage() {
  const users = await getCachedAttendees()
  return (
    <>
      <AdminHeader title="Attendees" />
      <main className="flex-1 p-6">
        <AttendeesTable users={users} />
      </main>
    </>
  )
}
