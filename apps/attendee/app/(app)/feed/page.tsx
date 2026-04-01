import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { FeedClient } from '@/components/feed/FeedClient'

export default async function FeedPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  return (
    <FeedClient
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? ''}
    />
  )
}
