import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'
import { getIndustry, getJobFunction } from '@/lib/solutions'

const PAGE_SIZE = 48

function parseArr(val: string | null | undefined): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

export async function GET(req: NextRequest) {
  const user = await getUserFromHeaders()
  if (!user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const search = sp.get('search') ?? ''
  const rolesParam = sp.get('roles') ?? ''
  const jobFunctionsParam = sp.get('jobFunctions') ?? ''
  const industriesParam = sp.get('industries') ?? ''
  const sizesParam = sp.get('sizes') ?? ''
  const revenuesParam = sp.get('revenues') ?? ''
  const seekingParam = sp.get('seeking') ?? ''
  const offset = Math.max(0, parseInt(sp.get('offset') ?? '0', 10) || 0)
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? String(PAGE_SIZE), 10) || PAGE_SIZE))

  // Build Prisma where clause — push as much filtering to the database as possible
  const where: any = {
    role: { in: ['ATTENDEE', 'SPEAKER'] },
  }

  const roles = rolesParam ? rolesParam.split(',').filter(Boolean) : []
  if (roles.length > 0) {
    where.role = { in: roles }
  }

  const sizes = sizesParam ? sizesParam.split(',').filter(Boolean) : []
  if (sizes.length > 0) {
    where.companySize = { in: sizes }
  }

  const revenues = revenuesParam ? revenuesParam.split(',').filter(Boolean) : []
  if (revenues.length > 0) {
    where.annualRevenue = { in: revenues }
  }

  // Text search — SQLite LIKE is case-insensitive for ASCII by default
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { company: { contains: search } },
      { jobTitle: { contains: search } },
      { bio: { contains: search } },
    ]
  }

  const jobFunctions = jobFunctionsParam ? jobFunctionsParam.split(',').filter(Boolean) : []
  const industries = industriesParam ? industriesParam.split(',').filter(Boolean) : []
  const seekingArr = seekingParam ? seekingParam.split(',').filter(Boolean) : []
  const needsAppFilter = jobFunctions.length > 0 || industries.length > 0 || seekingArr.length > 0

  const select = {
    id: true, name: true, image: true, company: true, jobTitle: true, bio: true,
    role: true, companySize: true, annualRevenue: true,
    solutionsOffering: true, solutionsSeeking: true, website: true, sponsorId: true,
  }

  // Fast path: when no app-level filters are needed, use DB-level skip/take
  // This avoids loading all 1000+ rows into memory
  if (!needsAppFilter) {
    const [people, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select,
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({
      people,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    })
  }

  // Slow path: app-level filters require loading all matching rows, filtering in JS,
  // then slicing. Only used when industry/jobFunction/seeking filters are active.
  const allMatching = await prisma.user.findMany({
    where,
    select,
    orderBy: { name: 'asc' },
  })

  const filtered = allMatching.filter(p => {
    if (jobFunctions.length > 0 && !jobFunctions.includes(getJobFunction(p.jobTitle))) return false
    if (industries.length > 0 && !industries.includes(getIndustry(p.company))) return false
    if (seekingArr.length > 0) {
      const their = parseArr(p.solutionsSeeking)
      if (!seekingArr.some(s => their.includes(s))) return false
    }
    return true
  })

  const total = filtered.length
  const page = filtered.slice(offset, offset + limit)

  return NextResponse.json({
    people: page,
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
  })
}
