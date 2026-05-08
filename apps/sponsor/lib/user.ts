import { headers } from 'next/headers'

export interface RequestUser {
  id: string
  role: string
  name: string
  sponsorId: string | null
  sponsorName: string | null
  sponsorLogoUrl: string | null
}

/**
 * Read user info from request headers set by middleware.
 * ~0ms — no JWT decoding, no DB call, just header reads.
 */
export async function getUserFromHeaders(): Promise<RequestUser> {
  const h = await headers()
  return {
    id: h.get('x-user-id')!,
    role: h.get('x-user-role') ?? 'ATTENDEE',
    name: h.get('x-user-name') ?? '',
    sponsorId: h.get('x-user-sponsor-id') || null,
    sponsorName: h.get('x-user-sponsor-name') || null,
    sponsorLogoUrl: h.get('x-user-sponsor-logo-url') || null,
  }
}
