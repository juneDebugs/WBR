import { prisma } from '@conference/db'

/**
 * Which exhibiting company does this caller ACTUALLY belong to, right now?
 *
 * WHY THIS EXISTS. Every handler in this app reads `user.sponsorId` off the
 * session token. A token is issued at sign-in and never changes afterwards,
 * while this app can move a person between companies mid-session:
 * `POST /api/profile/teammates` writes another user's company, and `DELETE`
 * clears it. So a representative moved from company A to company B keeps acting
 * as company A until they sign in again.
 *
 * That is a defect this project has measured twice and recorded as the plan's
 * **Phase 14**, whose fix re-points all nineteen handlers at a database-backed
 * account context. This helper is deliberately NOT that fix. It is the same idea
 * applied to the four teammate addresses only, because Phase 13's own changes
 * made the stale value harmful on exactly those addresses.
 *
 * WHAT MADE IT URGENT HERE, measured rather than argued. Phase 13 gives a newly
 * created colleague the `SPONSOR` role so they can sign in. Combined with the
 * stale token that turned a harmless bug into a working one:
 *
 *   1. a representative signs in while attached to company A
 *   2. somebody moves them to company B
 *   3. they create a colleague — and get `201`, `role=SPONSOR`, `sponsorId=A`
 *   4. that colleague signs in to the portal as company A
 *
 * Before Phase 13 step 3 produced an `ATTENDEE` the portal refused, so the stale
 * write was inert. Afterwards it mints a working account, with the buyer
 * directory, at a company the caller has left. Reproduced end to end before this
 * helper was written; the transcript is in
 * docs/smoketests/phase-13-sponsor-portal-carried-issues.md § Findings.
 *
 * THE PRECEDENT FOR FIXING IT HERE rather than deferring it to Phase 14 is this
 * project's own, applied twice already: Phase 5 fixed `PATCH /api/profile`,
 * nominally Phase 6's territory, because Phase 5 was what turned a stale company
 * link into a trap; Phase 6 changed a cache header both planning documents had
 * put out of scope, because Phase 6 was what turned it into a way past a
 * refusal. A phase does not get to ship a change that makes an existing defect
 * dangerous and then point at a later phase.
 *
 * Returns `null` when the account has no company or no longer exists. Callers
 * MUST fail closed on `null` — see FP finding F-6, which measured the opposite
 * choice as wrong.
 */
export async function getCallerCompanyId(userId: string): Promise<string | null> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { sponsorId: true },
  })
  return account?.sponsorId ?? null
}
