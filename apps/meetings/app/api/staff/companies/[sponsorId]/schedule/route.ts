import { NextResponse } from 'next/server'
import { prisma, getSponsorScheduleMatrix } from '@conference/db'
import { requireStaff, engineErrorResponse } from '@/lib/staff-api'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ sponsorId: string }> }) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { sponsorId } = await params
  try {
    const matrix = await getSponsorScheduleMatrix(prisma, sponsorId)
    return NextResponse.json(matrix)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
