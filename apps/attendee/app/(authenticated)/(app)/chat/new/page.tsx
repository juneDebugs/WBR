export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import Link from 'next/link'
import { NewDmClient } from '@/components/chat/NewDmClient'

export default async function NewMessagePage() {
  const session = (await getSession())!

  const userId = session.user!.id

  const users = await prisma.user.findMany({
    where: { id: { not: userId } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, image: true, company: true },
    take: 500,
  })

  return (
    <div className="min-h-screen" style={{ background: '#f0ece4' }}>
      <div className="px-4 pt-12 pb-3 flex items-center gap-4 border-b border-[#e5e1d9]">
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
