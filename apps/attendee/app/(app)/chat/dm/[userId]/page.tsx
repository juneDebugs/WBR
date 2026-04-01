import { prisma } from '@conference/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function StartDmPage({ params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const myId = session.user.id
  const targetId = params.userId

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
