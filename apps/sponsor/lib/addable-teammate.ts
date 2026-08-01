import { WBR_ROLES, isWbrStaff } from '@conference/db'

/**
 * Who may an exhibiting company add to its team?
 *
 * ONE RULE, TWO CONSUMERS, WHICH IS THE WHOLE POINT OF THIS FILE. Before Phase
 * 6.5 the question had two different answers depending on which way you asked
 * it. The picker query in app/api/profile/sponsor-data/route.ts offered every
 * unattached account except an organizer, and the attach handler in
 * app/api/profile/teammates/route.ts refused any target already belonging to
 * another company. Neither knew what the other did.
 *
 * The consequence measured on 2026-08-01: WBR's own staff and administrator
 * accounts were inside the list an outside company browses. Nobody could be
 * improperly attached through it — Phase 13 closed that — so this was a
 * boundary and accountability fault rather than an access one. An exhibitor
 * could quietly attach a member of WBR's staff to their company records with
 * nobody at WBR being told.
 *
 * WHAT THE RULE IS, and what it deliberately is not:
 *
 *   - EXCLUDED: the four WBR-side roles. These accounts operate the event
 *     rather than exhibit at it. The list comes from packages/db/src/app-access.ts
 *     rather than being written out here, so a fifth WBR-side role added there
 *     is excluded here without anyone remembering to do it. Per ADR 0008 there
 *     is exactly one list of who is WBR-side.
 *
 *   - KEPT: speakers, and brand-side accounts. Decided 2026-08-01 with the
 *     project owner, on the stated ground that a speaker may be at the event
 *     representing an attending company, and so may legitimately be part of an
 *     exhibitor's team. Recorded because the narrower reading — delegates only —
 *     was considered and rejected rather than never raised. Against the seeded
 *     data the two readings differ by eight of the two hundred accounts the
 *     screen displays.
 *
 *   - NOT DECIDED HERE: whether the target already belongs to another company.
 *     That is the attach handler's `OR` condition, evaluated inside the write so
 *     two simultaneous attaches cannot both win. It is a different question —
 *     "is this person available" rather than "is this person the right kind of
 *     person" — and folding it in here would break that atomicity.
 *
 * WHY A FILTER AND A PREDICATE RATHER THAN ONE THING. The picker asks the
 * database for a list, so it needs a `where` fragment. The attach handler holds
 * one account in memory, so it needs a test. Both read the same array, so they
 * cannot disagree; expressing it twice in two forms is not the same as having
 * two rules.
 */

/**
 * Prisma `where` fragment: the roles an exhibitor may be offered. Spread into a
 * user query alongside whatever availability condition the caller needs.
 */
// Not `as const`: Prisma's generated `where` types reject a readonly array, and
// a readonly marker here would only be describing a constant that nothing
// mutates anyway.
export const ADDABLE_TEAMMATE_ROLE_FILTER: { role: { notIn: string[] } } = {
  role: { notIn: [...WBR_ROLES] },
}

/** True when an account's role is one an exhibiting company may add. */
export function isAddableTeammateRole(role: string | null | undefined): boolean {
  return !isWbrStaff(role)
}
