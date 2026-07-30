import { prisma } from './client'

// Bumps User.loginCount on every successful sign-in. Called from each app's
// NextAuth authorize() (credentials) and signIn() (Google) after the identity
// is confirmed. The per-company "Num of logins" column in the admin Meetings →
// Companies table sums this across a sponsor's reps (see getCompanyDirectory).
//
// Best-effort: a failure here must never block a valid login, so callers wrap
// this in a try/catch (or ignore the rejected promise) — the count is a
// reporting metric, not an auth gate.
export async function recordLogin(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { loginCount: { increment: 1 } },
    })
  } catch (e: any) {
    console.error('[login-tracking] recordLogin failed:', e?.message)
  }
}
