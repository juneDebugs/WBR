export { prisma } from './client'
export * from '@prisma/client'

import type { ConfSession, Speaker } from '@prisma/client'

// ─── Composite types ──────────────────────────────────────────────────────────

export type SessionWithSpeaker = ConfSession & {
  speaker: Speaker | null
}

export type MeetingWithDetails = import('@prisma/client').Meeting & {
  timeBlock: import('@prisma/client').TimeBlock
  attendeeA: import('@prisma/client').User
  attendeeB: import('@prisma/client').User
  organizer: import('@prisma/client').User
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────

export interface DaySchedule {
  date: string // 'YYYY-MM-DD'
  sessions: SessionWithSpeaker[]
}

export function groupSessionsByDay(sessions: SessionWithSpeaker[]): DaySchedule[] {
  const map = new Map<string, SessionWithSpeaker[]>()
  for (const s of sessions) {
    const day = s.startsAt.toISOString().slice(0, 10)
    const list = map.get(day) ?? []
    list.push(s)
    map.set(day, list)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => ({
      date,
      sessions: sessions.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    }))
}

// ─── Blackout conflict check ──────────────────────────────────────────────────

export async function checkBlackoutConflicts(
  prismaClient: import('@prisma/client').PrismaClient,
  userIds: string[],
  startsAt: Date,
  endsAt: Date
): Promise<{ userId: string; reason: string | null }[]> {
  const conflicts = await prismaClient.blackoutTime.findMany({
    where: {
      userId: { in: userIds },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { userId: true, reason: true },
  })
  return conflicts
}
