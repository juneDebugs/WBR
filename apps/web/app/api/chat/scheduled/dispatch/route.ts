import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { timingSafeEqual } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, dispatchDueScheduledMessages } from '@conference/db'

const ALLOWED_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

// Dedicated dispatch tick for due scheduled broadcasts. Callable two ways:
//   - a signed-in staff session (the admin UI can force a tick)
//   - a cron with `Authorization: Bearer ${CRON_SECRET}` (Vercel cron sends
//     this header automatically when CRON_SECRET is set on the project —
//     without CRON_SECRET the cron gets 401s and delivery falls back to the
//     chat-poll ticks only, so set it in production)
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (secret && header && safeEqual(header, `Bearer ${secret}`)) return true
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  return !!session && ALLOWED_ROLES.includes(role)
}

async function tick(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await dispatchDueScheduledMessages(prisma)
  if (result.sent > 0) revalidateTag('chat')
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(req: Request) {
  return tick(req)
}

export async function POST(req: Request) {
  return tick(req)
}
