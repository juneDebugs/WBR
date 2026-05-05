import { headers } from 'next/headers'

export type RequestUser = {
  id: string
  role: string
  sponsorId: string | null
}

/**
 * Read user info from headers injected by middleware — no JWT decode needed.
 * Falls back to null if headers are missing (e.g. called outside middleware scope).
 */
export async function getUserFromHeaders(): Promise<RequestUser | null> {
  const h = await headers()
  const id = h.get('x-user-id')
  if (!id) return null
  return {
    id,
    role: h.get('x-user-role') ?? 'ATTENDEE',
    sponsorId: h.get('x-user-sponsor-id') || null,
  }
}
