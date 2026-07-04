import { prisma, type Prisma } from '@conference/db'

export const STAFF_PAGE_SIZE = 50

export type StaffRow = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: string
  company: string | null
  jobTitle: string | null
  hasPassword: boolean
  createdAt: string
}

export type StaffPage = {
  rows: StaffRow[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export type StaffQueryParams = {
  page?: number
  q?: string
}

const MAX_Q_LENGTH = 100

export function normalizeStaffParams(raw: StaffQueryParams): { page: number; q: string } {
  const page = Number.isFinite(raw.page) && (raw.page as number) >= 0 ? Math.floor(raw.page as number) : 0
  const q = (raw.q ?? '').trim().slice(0, MAX_Q_LENGTH)
  return { page, q }
}

// Single source of truth for what counts as a Staff row. Every surface that
// reports a staff number — the Staff section list *and* the Access & Roles
// "Staff" stat card — builds its filter here, so the tile can never diverge
// from the list it links to. Mirrors buildAttendeesWhere in attendees-query.ts.
export function buildStaffWhere(raw: StaffQueryParams = {}): Prisma.UserWhereInput {
  const { q } = normalizeStaffParams(raw)

  const where: Prisma.UserWhereInput = { role: 'STAFF' }

  if (q) {
    // SQLite LIKE (Prisma `contains`) is ASCII case-insensitive by default;
    // Prisma's `mode: 'insensitive'` is not supported by the SQLite adapter.
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { company: { contains: q } },
      { jobTitle: { contains: q } },
    ]
  }

  return where
}

export async function countStaff(raw: StaffQueryParams = {}): Promise<number> {
  return prisma.user.count({ where: buildStaffWhere(raw) })
}

export async function fetchStaffPage(raw: StaffQueryParams = {}): Promise<StaffPage> {
  const { page } = normalizeStaffParams(raw)
  const where = buildStaffWhere(raw)

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: page * STAFF_PAGE_SIZE,
      take: STAFF_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        company: true,
        jobTitle: true,
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
      company: u.company,
      jobTitle: u.jobTitle,
      hasPassword: !!u.password,
      createdAt: typeof u.createdAt === 'string' ? u.createdAt : u.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: STAFF_PAGE_SIZE,
    hasMore: (page + 1) * STAFF_PAGE_SIZE < total,
  }
}
