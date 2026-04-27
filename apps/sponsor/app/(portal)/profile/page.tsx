export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { ProfileEditor } from '@/components/ProfileEditor'

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const user = session.user as any

  // Staff can view but has no sponsor — show a message
  if (!user.sponsorId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">No sponsor company linked to your account.</p>
      </div>
    )
  }

  const sponsor = await prisma.sponsor.findUnique({
    where: { id: user.sponsorId },
    include: {
      users: {
        select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
      },
    },
  })

  if (!sponsor) redirect('/dashboard')

  // All users who could be added as teammates (not already linked)
  const allUsers = await prisma.user.findMany({
    where: { sponsorId: null, role: { not: 'ORGANIZER' } },
    select: { id: true, name: true, email: true, image: true, jobTitle: true },
    orderBy: { name: 'asc' },
    take: 200,
  })

  return (
    <ProfileEditor
      sponsor={JSON.parse(JSON.stringify(sponsor))}
      currentUserId={user.id}
      availableUsers={JSON.parse(JSON.stringify(allUsers))}
    />
  )
}
