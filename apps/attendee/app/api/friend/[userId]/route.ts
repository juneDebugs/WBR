import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, getFriendStatus, applyFriendAction, type FriendAction } from '@conference/db'
import { actorFromSession, guardFriendRequest } from '@/lib/messaging-guard'

// GET — friend status between the current user and [userId]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = await getFriendStatus(prisma, session.user.id, userId)
  return NextResponse.json({ status })
}

// POST — apply a friend action toward [userId]. Optional JSON body
// { action?: 'request' | 'cancel' | 'accept' | 'decline' | 'remove' };
// when omitted the action is inferred from the current status.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUserId = session.user.id

  // Body may be absent or empty — parse defensively.
  const body = await req.json().catch(() => ({}))
  const action: FriendAction | undefined =
    body && typeof body.action === 'string' ? (body.action as FriendAction) : undefined

  // Ensure the logged-in user exists in the DB (JWT may outlive a DB reset)
  await prisma.user.upsert({
    where: { id: currentUserId },
    update: {},
    create: {
      id: currentUserId,
      email: session.user.email ?? `${currentUserId}@unknown.com`,
      name: session.user.name ?? 'Unknown',
      role: 'ATTENDEE',
    },
  })

  // Admin gate: vendors/staff may be restricted from initiating friend requests
  // to certain audiences. Only the 'request' initiation is gated — accepting,
  // declining, cancelling or removing are responses/teardown and always allowed.
  // A friendship starts only from status 'none', which is what an omitted action
  // infers as 'request'.
  const isRequest =
    action === 'request' ||
    (!action && (await getFriendStatus(prisma, currentUserId, userId)) === 'none')
  if (isRequest) {
    const actor = actorFromSession(session)
    if (actor) {
      const decision = await guardFriendRequest(actor, userId)
      if (!decision.allowed) {
        return NextResponse.json(
          { error: decision.message ?? 'Messaging is not permitted.', code: decision.code },
          { status: 403 },
        )
      }
    }
  }

  const result = await applyFriendAction(prisma, currentUserId, userId, action)
  if (!result.ok) {
    const status = result.error === 'User not found' ? 404 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  revalidateTag(`user-social-${currentUserId}`)
  revalidateTag(`user-social-${userId}`)
  return NextResponse.json({ status: result.status })
}
