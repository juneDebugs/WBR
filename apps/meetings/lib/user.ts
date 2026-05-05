import { headers } from 'next/headers'

export interface RequestUser {
  id: string
  role: string
  sponsorId: string | null
}

/**
 * Read user info from request headers set by middleware.
 * ~0ms — no JWT decoding, no DB call, just header reads.
 * Replaces getSession() for server components that only need id/role/sponsorId.
 */
export async function getUserFromHeaders(): Promise<RequestUser> {
  const h = await headers()
  return {
    id: h.get('x-user-id')!,
    role: h.get('x-user-role') ?? 'ATTENDEE',
    sponsorId: h.get('x-user-sponsor-id') || null,
  }
}
