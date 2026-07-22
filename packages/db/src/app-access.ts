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
const WBR_ROLES = ['WBR', 'ORGANIZER', 'ADMIN', 'STAFF'] as const
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
