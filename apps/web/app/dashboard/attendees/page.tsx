import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { AttendeesTable } from '@/components/AttendeesTable'

export default async function AttendeesPage() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      company: true,
      jobTitle: true,
    },
  })

  return (
    <>
      <AdminHeader title="Attendees" />
      <main className="flex-1 p-6">
        <AttendeesTable users={users} />
      </main>
    </>
  )
}
