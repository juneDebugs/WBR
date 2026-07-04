// Canonical definition of the WBR staff roster — the list the Admin app's
// Staff page shows and every other surface maps from (sponsor "Your Team at
// WBR 2027", access counts, test oracles). Change membership semantics HERE,
// nowhere else; scripts/test-sponsor-team.mjs asserts both apps stay bound
// to this module.
//
// Kept as its own module (like browse-taxonomy.ts) so node test scripts can
// import the TS source directly without pulling in the Prisma client.
import type { Prisma } from '@prisma/client'

export const STAFF_ROSTER_ROLE = 'STAFF'

// Fresh object per call so callers can merge extra clauses (search OR, etc.)
// without mutating a shared constant.
export function staffRosterWhere(): Prisma.UserWhereInput {
  return { role: STAFF_ROSTER_ROLE }
}

export const STAFF_ROSTER_ORDER_BY = { name: 'asc' } as const
