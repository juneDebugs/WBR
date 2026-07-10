// Scheduled chat messages — shared logic for the admin "schedule a broadcast"
// feature. Consumed three ways (same contract as browse-taxonomy.ts):
//   1. Next.js API routes via `@conference/db` (transpilePackages)
//   2. Node test scripts importing this file's pure helpers directly
//   3. The dispatch endpoint / read-path hooks, which pass in a PrismaClient
//
// Delivery model: there is no job queue in this stack (see docs/architecture.md),
// so due messages are materialized into `Message` rows by
// `dispatchDueScheduledMessages`, which is invoked opportunistically from chat
// read paths (admin page poll, attendee global-chat poll) and from the
// dedicated dispatch endpoint that a cron can hit. Every caller may race;
// correctness comes from the atomic per-row claim (updateMany guarded on
// status), not from the callers coordinating.

export const GENERAL_ROOM_ID = 'room-general'

export const SCHEDULED_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  CANCELED: 'CANCELED',
  FAILED: 'FAILED',
} as const

export type ScheduledStatus = (typeof SCHEDULED_STATUS)[keyof typeof SCHEDULED_STATUS]

export const MAX_SCHEDULED_CONTENT_LENGTH = 2000
// Small grace so "schedule for the next minute" from a slightly-skewed client
// clock is accepted rather than bounced.
export const MIN_LEAD_MS = 5_000
export const MAX_LEAD_MS = 365 * 24 * 60 * 60 * 1000 // 1 year
// Per dispatch tick — bounds work done inside a request-path hook.
export const DISPATCH_BATCH_SIZE = 25

export type ScheduleValidation =
  | { ok: true; content: string; scheduledFor: Date }
  | { ok: false; error: string }

/**
 * Validates a create/edit payload. Pure — safe to import from node test
 * scripts without pulling in the Prisma runtime.
 */
export function validateSchedulePayload(
  content: unknown,
  scheduledFor: unknown,
  now: Date = new Date()
): ScheduleValidation {
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, error: 'Message text is required' }
  }
  const trimmed = content.trim()
  if (trimmed.length > MAX_SCHEDULED_CONTENT_LENGTH) {
    return { ok: false, error: `Message must be ${MAX_SCHEDULED_CONTENT_LENGTH} characters or fewer` }
  }
  if (typeof scheduledFor !== 'string' && !(scheduledFor instanceof Date)) {
    return { ok: false, error: 'Send time is required' }
  }
  const when = scheduledFor instanceof Date ? scheduledFor : new Date(scheduledFor)
  if (isNaN(when.getTime())) {
    return { ok: false, error: 'Send time is not a valid date' }
  }
  const lead = when.getTime() - now.getTime()
  if (lead < MIN_LEAD_MS) {
    return { ok: false, error: 'Send time must be in the future' }
  }
  if (lead > MAX_LEAD_MS) {
    return { ok: false, error: 'Send time must be within one year' }
  }
  return { ok: true, content: trimmed, scheduledFor: when }
}

export interface DispatchResult {
  due: number
  sent: number
  failed: number
}

type AnyPrismaClient = import('@prisma/client').PrismaClient

// A row claimed (SENT, sentMessageId null) longer than this ago whose Message
// never appeared means the claiming process died mid-send. Long enough that no
// healthy in-flight tick is still between claim and create.
export const STUCK_CLAIM_GRACE_MS = 2 * 60_000

/**
 * Materializes every due PENDING scheduled message into a real Message row.
 *
 * Concurrency-safe across overlapping callers: each row is claimed with an
 * `updateMany` guarded on `status: PENDING` AND `scheduledFor <= now`, which
 * is a single atomic conditional UPDATE — exactly one caller wins the claim,
 * so a message is delivered at most once, and a concurrent edit that
 * postponed the row after our snapshot makes the claim miss. After a
 * successful claim the row is re-read and the Message is created from the
 * fresh content (no further edits are possible once status leaves PENDING),
 * so an edit that landed between snapshot and claim is what gets delivered.
 *
 * If message creation fails after a successful claim, the row is marked
 * FAILED. If the process dies between claim and create, the row is left
 * SENT-with-null-sentMessageId; the next tick's reconciliation sweep flips
 * such rows to FAILED after a grace period, so a lost broadcast surfaces in
 * the history UI instead of masquerading as delivered.
 */
export async function dispatchDueScheduledMessages(
  prismaClient: AnyPrismaClient,
  now: Date = new Date()
): Promise<DispatchResult> {
  const result: DispatchResult = { due: 0, sent: 0, failed: 0 }
  try {
    // Reconciliation sweep: surface claims orphaned by a mid-send crash.
    await prismaClient.scheduledMessage.updateMany({
      where: {
        status: SCHEDULED_STATUS.SENT,
        sentMessageId: null,
        sentAt: { lt: new Date(now.getTime() - STUCK_CLAIM_GRACE_MS) },
      },
      data: { status: SCHEDULED_STATUS.FAILED },
    })

    const due = await prismaClient.scheduledMessage.findMany({
      where: { status: SCHEDULED_STATUS.PENDING, scheduledFor: { lte: now } },
      orderBy: { scheduledFor: 'asc' },
      take: DISPATCH_BATCH_SIZE,
    })
    result.due = due.length

    for (const item of due) {
      const claimed = await prismaClient.scheduledMessage.updateMany({
        where: { id: item.id, status: SCHEDULED_STATUS.PENDING, scheduledFor: { lte: now } },
        data: { status: SCHEDULED_STATUS.SENT, sentAt: now },
      })
      if (claimed.count !== 1) continue // another caller won it, or an edit postponed it

      try {
        // Re-read after the claim: an edit that landed after our snapshot but
        // before the claim must be the version that goes out.
        const fresh = await prismaClient.scheduledMessage.findUnique({ where: { id: item.id } })
        if (!fresh) continue

        // Mirror the manual-broadcast route: make sure the room exists and the
        // sender is a member before writing the message.
        await prismaClient.chatRoom.upsert({
          where: { id: fresh.roomId },
          create: {
            id: fresh.roomId,
            name: fresh.roomId === GENERAL_ROOM_ID ? 'General' : null,
            type: 'CHANNEL',
          },
          update: {},
        })
        await prismaClient.chatMember.upsert({
          where: { roomId_userId: { roomId: fresh.roomId, userId: fresh.senderId } },
          create: { roomId: fresh.roomId, userId: fresh.senderId },
          update: {},
        })
        const msg = await prismaClient.message.create({
          data: { roomId: fresh.roomId, senderId: fresh.senderId, content: fresh.content },
        })
        await prismaClient.scheduledMessage.update({
          where: { id: item.id },
          data: { sentMessageId: msg.id },
        })
        result.sent++
      } catch (e) {
        console.error('[dispatchDueScheduledMessages] send failed for', item.id, e)
        await prismaClient.scheduledMessage
          .update({ where: { id: item.id }, data: { status: SCHEDULED_STATUS.FAILED } })
          .catch(() => {})
        result.failed++
      }
    }
  } catch (e) {
    console.error('[dispatchDueScheduledMessages] error:', e)
  }
  return result
}

// Best-effort per-instance throttle for hot read paths (the attendee chat
// polls): skips the tick when this process checked recently, so warm
// serverless instances don't pay a dispatch query on every 15s poll. The
// cron and the admin panel's 30s poll remain unthrottled delivery clocks.
let lastThrottledTickAt = 0

export async function dispatchDueScheduledMessagesThrottled(
  prismaClient: AnyPrismaClient,
  minIntervalMs = 10_000
): Promise<DispatchResult | null> {
  const nowMs = Date.now()
  if (nowMs - lastThrottledTickAt < minIntervalMs) return null
  lastThrottledTickAt = nowMs
  return dispatchDueScheduledMessages(prismaClient)
}
