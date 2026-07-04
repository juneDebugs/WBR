import { prisma, type Prisma } from '@conference/db'
import { countAttendees } from './attendees-query'
import { countStaff } from './staff-query'

export const ACCESS_PAGE_SIZE = 50

export type AccessUserRow = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: string
  hasPassword: boolean
  createdAt: string
}

// Every number here is a DB aggregate — never derived from a fetched row
// list, so no row cap or sort order can skew it. Each count is produced by the
// *same* query builder that powers the section its stat card links to, so a
// card can never disagree with the list you land on when you tap it.
export type AccessCounts = {
  attendees: number // buildAttendeesWhere() — identical to the Attendees section's unfiltered total (ATTENDEE + SPEAKER)
  speakers: number // Speaker directory count — same source as the Speakers section
  staff: number // buildStaffWhere() — identical to the new Staff section's total (role STAFF)
  totalUsers: number // every user account, regardless of role
}

export type AccessUsersPage = {
  rows: AccessUserRow[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export type AccessData = {
  counts: AccessCounts
  users: AccessUsersPage
}

export type AccessQueryParams = {
  page?: number
  q?: string
  scope?: string
}

const MAX_Q_LENGTH = 100
const ADMIN_SCOPE_ROLES = ['STAFF', 'ORGANIZER']

export function normalizeAccessParams(raw: AccessQueryParams): {
  page: number
  q: string
  scope: 'all' | 'admins'
} {
  const page = Number.isFinite(raw.page) && (raw.page as number) >= 0 ? Math.floor(raw.page as number) : 0
  const q = (raw.q ?? '').trim().slice(0, MAX_Q_LENGTH)
  const scope = raw.scope === 'admins' ? 'admins' : 'all'
  return { page, q, scope }
}

function buildAccessWhere({ q, scope }: { q: string; scope: 'all' | 'admins' }): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {}
  if (scope === 'admins') {
    where.role = { in: ADMIN_SCOPE_ROLES }
  }
  if (q) {
    where.OR = [{ name: { contains: q } }, { email: { contains: q } }]
  }
  return where
}

export async function fetchAccessCounts(): Promise<AccessCounts> {
  const [attendees, speakers, staff, totalUsers] = await Promise.all([
    // No role filter → ATTENDEE + SPEAKER, exactly the Attendees section's
    // default list total (both go through buildAttendeesWhere()).
    countAttendees(),
    prisma.speaker.count(),
    // Shared with the Staff section via buildStaffWhere() (role STAFF).
    countStaff(),
    prisma.user.count(),
  ])
  return { attendees, speakers, staff, totalUsers }
}

export async function fetchAccessUsersPage(raw: AccessQueryParams = {}): Promise<AccessUsersPage> {
  const { page, q, scope } = normalizeAccessParams(raw)
  const where = buildAccessWhere({ q, scope })

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: page * ACCESS_PAGE_SIZE,
      take: ACCESS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        password: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ])

  return {
    rows: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      role: u.role,
      hasPassword: !!u.password,
      createdAt: typeof u.createdAt === 'string' ? u.createdAt : u.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: ACCESS_PAGE_SIZE,
    hasMore: (page + 1) * ACCESS_PAGE_SIZE < total,
  }
}

export async function fetchAccessData(raw: AccessQueryParams = {}): Promise<AccessData> {
  const [counts, users] = await Promise.all([fetchAccessCounts(), fetchAccessUsersPage(raw)])
  return { counts, users }
}
