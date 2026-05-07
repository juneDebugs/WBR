export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function StartDmPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const session = (await getSession())!

  const myId = session.user!.id
  const targetId = userId

  if (myId === targetId) redirect('/chat')

  // Find or create the DM room
  const existing = await prisma.chatRoom.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { members: { some: { userId: myId } } },
        { members: { some: { userId: targetId } } },
      ],
    },
  })

  if (existing) redirect(`/chat/${existing.id}`)

  // Verify both users exist before creating the room
  const [myUser, targetUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: myId } }),
    prisma.user.findUnique({ where: { id: targetId } }),
  ])
  if (!myUser || !targetUser) redirect('/chat')

  const room = await prisma.chatRoom.create({
    data: {
      type: 'DIRECT',
      members: {
        create: [{ userId: myId }, { userId: targetId }],
      },
    },
  })

  redirect(`/chat/${room.id}`)
}
