export const revalidate = 0
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { ProfileEditor } from '@/components/ProfileEditor'

export default async function ProfilePage() {
  const session = await getSession()
  const user = session!.user as any

  // Staff can view but has no sponsor — show a message
  if (!user.sponsorId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">No sponsor company linked to your account.</p>
      </div>
    )
  }

  const [sponsor, allUsers] = await Promise.all([
    prisma.sponsor.findUnique({
      where: { id: user.sponsorId },
      include: {
        users: {
          select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { sponsorId: null, role: { not: 'ORGANIZER' } },
      select: { id: true, name: true, email: true, image: true, jobTitle: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
  ])

  if (!sponsor) redirect('/dashboard')

  return (
    <ProfileEditor
      sponsor={JSON.parse(JSON.stringify(sponsor))}
      currentUserId={user.id}
      availableUsers={JSON.parse(JSON.stringify(allUsers))}
    />
  )
}
