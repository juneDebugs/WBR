import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'
import { filterSponsorPortalAttendees } from '@conference/db/src/browse-taxonomy'

const PAGE_SIZE = 48

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

  const where: any = {
    role: { in: ['ATTENDEE', 'SPEAKER'] },
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

  const roles = rolesParam ? rolesParam.split(',').filter(Boolean) : []
  const sizes = sizesParam ? sizesParam.split(',').filter(Boolean) : []
  const revenues = revenuesParam ? revenuesParam.split(',').filter(Boolean) : []
  const jobFunctions = jobFunctionsParam ? jobFunctionsParam.split(',').filter(Boolean) : []
  const industries = industriesParam ? industriesParam.split(',').filter(Boolean) : []
  const seekingArr = seekingParam ? seekingParam.split(',').filter(Boolean) : []

  const select = {
    id: true, name: true, image: true, company: true, jobTitle: true, bio: true,
    role: true, companySize: true, annualRevenue: true,
    solutionsOffering: true, solutionsSeeking: true, website: true, sponsorId: true,
  }

  const hasChipFilters =
    roles.length > 0 || sizes.length > 0 || revenues.length > 0 ||
    jobFunctions.length > 0 || industries.length > 0 || seekingArr.length > 0

  // Fast path: no chip filters means no minimum-results guarantee is needed,
  // so page directly in the database instead of loading the whole pool.
  if (!hasChipFilters) {
    const [pageRows, total] = await Promise.all([
      prisma.user.findMany({ where, select, orderBy: { name: 'asc' }, skip: offset, take: limit }),
      prisma.user.count({ where }),
    ])
    return NextResponse.json({
      people: pageRows,
      total,
      strictCount: total,
      similarCount: 0,
      offset,
      limit,
      hasMore: offset + limit < total,
    })
  }

  const rows = await prisma.user.findMany({
    where,
    select,
    orderBy: { name: 'asc' },
  })

  const { results, strictCount, similarCount } = filterSponsorPortalAttendees(rows, {
    roles,
    jobFunctions,
    industries,
    sizes,
    revenues,
    seeking: seekingArr,
    search: '',
  })

  const page = results.slice(offset, offset + limit)

  return NextResponse.json({
    people: page,
    total: results.length,
    strictCount,
    similarCount,
    offset,
    limit,
    hasMore: offset + limit < results.length,
  })
}
