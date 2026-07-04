import { prisma, type Prisma } from '@conference/db'

export const ATTENDEES_PAGE_SIZE = 50

export type AttendeeRow = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: string
  company: string | null
  jobTitle: string | null
}

export type AttendeesPage = {
  rows: AttendeeRow[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export type AttendeesQueryParams = {
  page?: number
  q?: string
  role?: string
}

const ALLOWED_ROLES = new Set(['ATTENDEE', 'SPEAKER'])
const MAX_Q_LENGTH = 100

export function normalizeAttendeesParams(raw: AttendeesQueryParams): {
  page: number
  q: string
  role: string | null
} {
  const page = Number.isFinite(raw.page) && (raw.page as number) >= 0 ? Math.floor(raw.page as number) : 0
  const q = (raw.q ?? '').trim().slice(0, MAX_Q_LENGTH)
  const role = raw.role && ALLOWED_ROLES.has(raw.role) ? raw.role : null
  return { page, q, role }
}

// Single source of truth for what counts as a row in the Attendees section.
// Every surface that reports an attendee number (the Attendees table, the
// Access & Roles stat cards) must build its filter here so the totals can
// never diverge.
export function buildAttendeesWhere(raw: AttendeesQueryParams = {}): Prisma.UserWhereInput {
  const { q, role } = normalizeAttendeesParams(raw)

  const where: Prisma.UserWhereInput = {
    role: role ? { equals: role } : { in: ['ATTENDEE', 'SPEAKER'] },
  }

  if (q) {
    // SQLite's LIKE (which Prisma's `contains` compiles to) is ASCII case-insensitive
    // by default. Prisma's `mode: 'insensitive'` is a PostgreSQL/MySQL-only option,
    // not supported by the SQLite adapter — so the case behavior here is determined
    // by the engine, not by an explicit Prisma flag. Acceptable for the demo seed.
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { company: { contains: q } },
      { jobTitle: { contains: q } },
    ]
  }

  return where
}

export async function countAttendees(raw: AttendeesQueryParams = {}): Promise<number> {
  return prisma.user.count({ where: buildAttendeesWhere(raw) })
}

export async function fetchAttendeesPage(raw: AttendeesQueryParams = {}): Promise<AttendeesPage> {
  const { page } = normalizeAttendeesParams(raw)
  const where = buildAttendeesWhere(raw)

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: page * ATTENDEES_PAGE_SIZE,
      take: ATTENDEES_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        company: true,
        jobTitle: true,
      },
    }),
    prisma.user.count({ where }),
  ])

  return {
    rows,
    total,
    page,
    pageSize: ATTENDEES_PAGE_SIZE,
    hasMore: (page + 1) * ATTENDEES_PAGE_SIZE < total,
  }
}
