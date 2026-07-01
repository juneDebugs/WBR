import { prisma, Prisma } from '@conference/db'
import type { CapErrorCode } from './ai-intro'

export type { CapErrorCode } from './ai-intro'

// ── Surface identifier ────────────────────────────────────────────────
// Namespace for AI call log rows + cap-count queries. Future AI
// surfaces get their own identifier so caps stay per-surface.

export const SURFACE_SPONSOR_DRAFT_INTRO = 'sponsor_draft_intro'

// ── Cap constants ─────────────────────────────────────────────────────
// Locked at Phase 12b implementation time per PRD §6 Phase 12b + the
// docs/decisions.md Phase 12b entry. Tune via these constants; promote
// to env vars if tuning becomes frequent post-deploy.

export const BURST_LIMIT_PER_MIN = 5
export const USER_DAILY_LIMIT = 20
export const GLOBAL_DAILY_LIMIT = 1000

export const BURST_WINDOW_MS = 60_000
export const DAILY_WINDOW_MS = 24 * 60 * 60_000
export const IDEMPOTENCY_TTL_MS = 5_000

// ── Cap error codes → HTTP status (locked response matrix) ───────────
// burst_limit  → HTTP 429
// daily_limit  → HTTP 429
// global_limit → HTTP 503
// (The CapErrorCode type + user-facing CAP_HIT_COPY strings live in
// `ai-intro.ts` so client components can import them safely.)

export const CAP_HTTP_STATUS: Record<CapErrorCode, number> = {
  burst_limit: 429,
  daily_limit: 429,
  global_limit: 503,
}

// ── Cost estimator ────────────────────────────────────────────────────
// gpt-4o-mini list price per 1M tokens (input $0.15, output $0.60);
// captured at Phase 12b implementation. If model changes, update here.

const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000

export function estimateCostUsd(usage: {
  inputTokens?: number | undefined
  outputTokens?: number | undefined
}): number {
  const input = (usage.inputTokens ?? 0) * INPUT_USD_PER_TOKEN
  const output = (usage.outputTokens ?? 0) * OUTPUT_USD_PER_TOKEN
  return input + output
}

// ── Cap-check queries ─────────────────────────────────────────────────
// Sequential burst → user-daily → global-daily. Each returns the cap
// error code if the count is at-or-above the limit, else null. The
// route MUST call them in the documented order — the response-matrix
// mapping (burst_limit vs daily_limit vs global_limit) is order-
// sensitive when a user is over both caps simultaneously.

export async function checkBurst(
  userId: string,
  surface: string
): Promise<CapErrorCode | null> {
  const windowStart = new Date(Date.now() - BURST_WINDOW_MS)
  const count = await prisma.aiCallLog.count({
    where: { userId, surface, createdAt: { gt: windowStart } },
  })
  return count >= BURST_LIMIT_PER_MIN ? 'burst_limit' : null
}

export async function checkUserDaily(
  userId: string,
  surface: string
): Promise<CapErrorCode | null> {
  const windowStart = new Date(Date.now() - DAILY_WINDOW_MS)
  const count = await prisma.aiCallLog.count({
    where: { userId, surface, createdAt: { gt: windowStart } },
  })
  return count >= USER_DAILY_LIMIT ? 'daily_limit' : null
}

export async function checkGlobalDaily(
  surface: string
): Promise<CapErrorCode | null> {
  const windowStart = new Date(Date.now() - DAILY_WINDOW_MS)
  const count = await prisma.aiCallLog.count({
    where: { surface, createdAt: { gt: windowStart } },
  })
  return count >= GLOBAL_DAILY_LIMIT ? 'global_limit' : null
}

// Composite pre-flight — runs the three checks in order and returns
// the first cap hit (or null if all pass).
export async function preflightCaps(
  userId: string,
  surface: string
): Promise<CapErrorCode | null> {
  return (
    (await checkBurst(userId, surface)) ??
    (await checkUserDaily(userId, surface)) ??
    (await checkGlobalDaily(surface))
  )
}

// ── Remaining-count query (for modal display) ─────────────────────────
// Modal renders "N AI drafts remaining today" for the caller. Uses the
// user-daily window (24h rolling); global-daily headroom is not
// displayed because the "temporarily unavailable" copy carries that.

export async function remainingDailyForUser(
  userId: string,
  surface: string
): Promise<number> {
  const windowStart = new Date(Date.now() - DAILY_WINDOW_MS)
  const used = await prisma.aiCallLog.count({
    where: { userId, surface, createdAt: { gt: windowStart } },
  })
  return Math.max(0, USER_DAILY_LIMIT - used)
}

// ── Idempotency dedup (sequential path) ───────────────────────────────
// Looks up a live (unexpired) prior entry for the same
// (userId, attendeeId, idempotencyKey). If found, the route returns
// the stored payload without a new AI call. The unique constraint on
// (userId, attendeeId, idempotencyKey) means at most one row matches.

export async function findFreshIdempotencyHit(input: {
  userId: string
  attendeeId: string
  idempotencyKey: string
}): Promise<string | null> {
  const now = new Date()
  const hit = await prisma.aiCallLog.findFirst({
    where: {
      userId: input.userId,
      attendeeId: input.attendeeId,
      idempotencyKey: input.idempotencyKey,
      expiresAt: { gt: now },
    },
    select: { responsePayload: true },
  })
  return hit?.responsePayload ?? null
}

// ── Insert-with-race-fallback ─────────────────────────────────────────
// Writes a new AiCallLog row for a successful AI call. If a concurrent
// request beat us to the INSERT (same userId/attendeeId/idempotencyKey
// arriving within the ~5s window), the unique constraint fires — we
// catch P2002 and fall back to reading the winner's row, returning its
// payload to the client. This yields the atomic first-write-wins
// contract in PRD §6 Phase 12b: only one row exists per key, and
// racing clients converge on the same response body.
//
// Note: both racing requests will have already fired the AI call
// (small accepted token waste). The single audit row means the cap
// counter under-counts race collisions by one — acknowledged in the
// PRD as an accepted trade-off.

export async function insertOrDedup(input: {
  userId: string
  attendeeId: string
  idempotencyKey: string
  surface: string
  costEstimateUsd: number
  responsePayload: string
}): Promise<{ responsePayload: string; wonRace: boolean }> {
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS)
  try {
    await prisma.aiCallLog.create({
      data: {
        userId: input.userId,
        attendeeId: input.attendeeId,
        idempotencyKey: input.idempotencyKey,
        surface: input.surface,
        costEstimateUsd: input.costEstimateUsd,
        responsePayload: input.responsePayload,
        expiresAt,
      },
    })
    return { responsePayload: input.responsePayload, wonRace: true }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // Only return a winner if its dedup window is still live. An
      // expired collision means the caller reused an old key past its
      // 5s window (client bug or retry-loop scenario); returning the
      // stale payload would double-serve minutes/hours-old content.
      // Let the error propagate — the route's outer catch normalizes
      // to pattern γ 502.
      const winner = await prisma.aiCallLog.findFirst({
        where: {
          userId: input.userId,
          attendeeId: input.attendeeId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: { gt: new Date() },
        },
        select: { responsePayload: true },
      })
      if (winner) {
        return { responsePayload: winner.responsePayload, wonRace: false }
      }
    }
    throw err
  }
}
