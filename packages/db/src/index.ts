export { prisma, dbConnectionMode } from './client'
export * from '@prisma/client'
export * from './scheduled-messages'
import { scrypt, timingSafeEqual, randomBytes, type ScryptOptions } from 'crypto'
import type { ConfSession, Speaker } from '@prisma/client'

// ─── Password utilities ──────────────────────────────────────────────────────

// Cost factor for new hashes. N=2048 is secure for a conference app and ~8x
// faster than Node's default N=16384.
const SCRYPT_N = 2048
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64

function scryptAsync(password: string, salt: string, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, opts, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = hash.split('.')
  if (parts.length < 2) return false
  const [hashed, salt, costStr] = parts
  if (!hashed || !salt) return false
  // Old hashes lack a cost field — fall back to Node default (N=16384)
  const N = costStr ? parseInt(costStr, 10) : 16384
  const buf = await scryptAsync(password, salt, SCRYPT_KEYLEN, { N, r: SCRYPT_R, p: SCRYPT_P })
  const hashedBuf = Buffer.from(hashed, 'hex')
  return timingSafeEqual(buf, hashedBuf)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const buf = await scryptAsync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `${buf.toString('hex')}.${salt}.${SCRYPT_N}`
}

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

export function groupSessionsByDay(sessions: SessionWithSpeaker[], timezone?: string | null): DaySchedule[] {
  const map = new Map<string, SessionWithSpeaker[]>()
  for (const s of sessions) {
    let day: string
    if (timezone) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(s.startsAt)
      day = parts // en-CA gives YYYY-MM-DD
    } else {
      day = s.startsAt.toISOString().slice(0, 10)
    }
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

// ─── Speaker conflict detection ───────────────────────────────────────────────

export interface SpeakerConflict {
  speakerId: string
  speakerName: string
  sessionA: { id: string; title: string; startsAt: Date; endsAt: Date; room: string | null }
  sessionB: { id: string; title: string; startsAt: Date; endsAt: Date; room: string | null }
}

/**
 * Scans all sessions for speakers scheduled in two overlapping slots,
 * persists new conflicts to ConflictLog, marks resolved ones, and
 * returns the full list of active (unresolved) conflicts.
 */
export async function detectSpeakerConflicts(
  prismaClient: import('@prisma/client').PrismaClient
): Promise<SpeakerConflict[]> {
  try {
  // Load all sessions that have a speaker assigned
  const sessions = await prismaClient.confSession.findMany({
    where: { speakerId: { not: null } },
    include: { speaker: true },
    orderBy: { startsAt: 'asc' },
  })

  // Group by speakerId
  const bySpeaker = new Map<string, typeof sessions>()
  for (const s of sessions) {
    if (!s.speakerId) continue
    const list = bySpeaker.get(s.speakerId) ?? []
    list.push(s)
    bySpeaker.set(s.speakerId, list)
  }

  const activeConflictKeys = new Set<string>()

  // Find overlapping pairs for each speaker
  for (const [, speakerSessions] of Array.from(bySpeaker)) {
    for (let i = 0; i < speakerSessions.length; i++) {
      for (let j = i + 1; j < speakerSessions.length; j++) {
        const a = speakerSessions[i]
        const b = speakerSessions[j]
        const overlaps = a.startsAt < b.endsAt && a.endsAt > b.startsAt
        if (!overlaps) continue

        // Normalize pair ordering by id for the unique constraint
        const [idA, idB] = [a.id, b.id].sort()
        activeConflictKeys.add(`${idA}__${idB}`)

        await prismaClient.conflictLog.upsert({
          where: { sessionAId_sessionBId: { sessionAId: idA, sessionBId: idB } },
          create: { speakerId: a.speakerId!, sessionAId: idA, sessionBId: idB, resolved: false },
          update: { resolved: false, detectedAt: new Date() },
        })
      }
    }
  }

  // Mark conflicts that no longer exist as resolved
  const existingConflicts = await prismaClient.conflictLog.findMany({ where: { resolved: false } })
  for (const c of existingConflicts) {
    const key = `${c.sessionAId}__${c.sessionBId}`
    if (!activeConflictKeys.has(key)) {
      await prismaClient.conflictLog.update({ where: { id: c.id }, data: { resolved: true } })
    }
  }

  // Return active conflicts with full detail
  const active = await prismaClient.conflictLog.findMany({
    where: { resolved: false },
    include: {
      speaker: true,
      sessionA: true,
      sessionB: true,
    },
  })

  return active.map(c => ({
    speakerId: c.speakerId,
    speakerName: c.speaker.name,
    sessionA: { id: c.sessionA.id, title: c.sessionA.title, startsAt: c.sessionA.startsAt, endsAt: c.sessionA.endsAt, room: c.sessionA.room },
    sessionB: { id: c.sessionB.id, title: c.sessionB.title, startsAt: c.sessionB.startsAt, endsAt: c.sessionB.endsAt, room: c.sessionB.room },
  }))
  } catch (e) {
    console.error('[detectSpeakerConflicts] error:', e)
    return []
  }
}

/**
 * Returns active conflicts from the log without re-scanning — fast read for UI rendering.
 */
export async function getActiveConflicts(
  prismaClient: import('@prisma/client').PrismaClient
): Promise<SpeakerConflict[]> {
  try {
  const active = await prismaClient.conflictLog.findMany({
    where: { resolved: false },
    include: { speaker: true, sessionA: true, sessionB: true },
  })
  return active.map(c => ({
    speakerId: c.speakerId,
    speakerName: c.speaker.name,
    sessionA: { id: c.sessionA.id, title: c.sessionA.title, startsAt: c.sessionA.startsAt, endsAt: c.sessionA.endsAt, room: c.sessionA.room },
    sessionB: { id: c.sessionB.id, title: c.sessionB.title, startsAt: c.sessionB.startsAt, endsAt: c.sessionB.endsAt, room: c.sessionB.room },
  }))
  } catch (e) {
    console.error('[getActiveConflicts] error:', e)
    return []
  }
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
