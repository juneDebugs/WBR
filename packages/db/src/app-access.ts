// ─── Per-app sign-in access policy ────────────────────────────────────────────
//
// The SINGLE source of truth for which account roles may sign in to which app.
// Every app's login path imports this (both `app/api/login/route.ts` — the path
// the login forms actually hit — and `lib/auth.ts` authorize()/Google signIn),
// and the acceptance tests assert the matrix against this same module, so the
// runtime and the tests can never drift.
//
// This module is intentionally pure — NO imports — so it can be consumed by
// client components, server routes, AND type-stripped Node test scripts that
// `import '@conference/db/src/app-access'` directly (see the staff-roster
// precedent). Do not add relative imports here.
//
// ── The three test-account tiers ────────────────────────────────────────────
//   WBR     → the organizer / WBR-staff account. Modeled as role ORGANIZER so
//             it keeps full admin RBAC in the web dashboard. ('WBR' is also
//             accepted as an explicit alias for forward-compatibility.)
//   BRAND   → a brand-side participant (attendee tier).
//   SPONSOR → a sponsor-company representative.
//
// ── Access matrix (test accounts) ───────────────────────────────────────────
//   App            | WBR | Brand | Sponsor
//   ---------------|-----|-------|--------
//   web (Admin)    |  ✓  |   ✗   |   ✗
//   meetings       |  ✓  |   ✓   |   ✗
//   sponsor        |  ✓  |   ✗   |   ✓
//   attendee (PWA) |  ✓  |   ✓   |   ✓
//
// The general seeded population (role ATTENDEE / SPEAKER) is treated as
// brand-side and stays able to sign in to the participant apps (meetings +
// mobile) so those apps remain demoable; the sponsor portal and admin
// dashboard stay locked to their respective tiers.

export type AppName = 'web' | 'meetings' | 'sponsor' | 'attendee'

// The admin/WBR tier — full access to every app.
//
// THIS LIST NOW ANSWERS TWO UNRELATED QUESTIONS. Read a change to it with both
// in mind:
//
//   1. Which app may this role sign in to?  (APP_ALLOWED_ROLES, below.)
//   2. Is this person exempt from the onboarding gate?  (isWbrStaff, below.)
//
// The second was added on purpose, so that "who is never gated" is one list
// rather than two that would drift — see
// docs/adr/0008-onboarding-gate-is-about-the-person-not-the-app.md. The cost of
// that choice is here: ADDING A ROLE TO THIS ARRAY EXEMPTS IT FROM ONBOARDING IN
// EVERY APP, IMMEDIATELY, with no separate decision. If that is not what you
// want for a new role, it does not belong in this array.
// Exported since Phase 6.5, for one caller with a genuine need: the sponsor
// portal's teammate rule has to express "not a WBR-side role" as a DATABASE
// FILTER, and a predicate cannot be sent to the database. Everything that can
// use isWbrStaff() below still must — this array is not an invitation to
// re-implement that test by hand.
export const WBR_ROLES = ['WBR', 'ORGANIZER', 'ADMIN', 'STAFF'] as const

/**
 * True when `role` is a WBR staff/organizer role (the meeting-engine operators).
 *
 * Also the onboarding gate's exemption test, in both the participant app and the
 * sponsor portal. These accounts operate the event rather than participate in it,
 * so they are released before any completeness question is asked. Per ADR 0008,
 * no gate or guard declares its own role list; they all call this.
 */
export function isWbrStaff(role: string | null | undefined): boolean {
  return !!role && (WBR_ROLES as readonly string[]).includes(role)
}
// General participant roles that behave as brand-side attendees.
const ATTENDEE_ROLES = ['ATTENDEE', 'SPEAKER'] as const

export const APP_ALLOWED_ROLES: Record<AppName, readonly string[]> = {
  // Admin dashboard — WBR only. No Brand, no Sponsor.
  web: [...WBR_ROLES],
  // Meetings portal — Brand + WBR (+ general attendees). Explicitly NOT Sponsor.
  meetings: ['BRAND', ...ATTENDEE_ROLES, ...WBR_ROLES],
  // Sponsor portal — Sponsor + WBR only. No Brand, no general attendees.
  sponsor: ['SPONSOR', ...WBR_ROLES],
  // Mobile PWA — Brand + Sponsor + WBR (+ general attendees).
  attendee: ['BRAND', 'SPONSOR', ...ATTENDEE_ROLES, ...WBR_ROLES],
}

/** True when a user with `role` is permitted to sign in to `app`. */
export function canAccessApp(app: AppName, role: string | null | undefined): boolean {
  if (!role) return false
  return APP_ALLOWED_ROLES[app].includes(role)
}
