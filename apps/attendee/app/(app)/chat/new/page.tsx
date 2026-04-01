import { prisma } from '@conference/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NewDmClient } from '@/components/chat/NewDmClient'

export default async function NewMessagePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const users = await prisma.user.findMany({
    where: { id: { not: userId } },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 pt-12 pb-3 flex items-center gap-4 border-b border-gray-100">
        <Link href="/chat">
          <svg className="w-6 h-6 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold">New message</h1>
      </div>
      <NewDmClient users={users.map(u => ({ id: u.id, name: u.name, image: u.image, company: u.company }))} />
    </div>
  )
}
