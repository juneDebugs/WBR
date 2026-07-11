export const dynamic = 'force-dynamic'
import { prisma, getOrCreateDirectRoom } from '@conference/db'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function StartDmPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const session = (await getSession())!

  const myId = session.user!.id
  const targetId = userId

  if (myId === targetId) redirect('/chat')

  // Single gated find-or-create path — the friendship gate (NOT_FRIENDS for
  // new rooms, existing rooms grandfathered) lives in the data layer.
  let result: Awaited<ReturnType<typeof getOrCreateDirectRoom>>
  try {
    result = await getOrCreateDirectRoom(prisma, myId, targetId)
  } catch {
    // e.g. the caller's user row is missing (JWT outlived a DB reset)
    redirect('/chat')
  }

  if (!result.ok) {
    // Non-friends land on the profile, where the friend-request tile lives.
    if ('code' in result && result.code === 'NOT_FRIENDS') redirect(`/people/${targetId}`)
    redirect('/chat')
  }

  redirect(`/chat/${result.room.id}`)
}
