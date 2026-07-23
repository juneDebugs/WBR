import { NextResponse } from 'next/server'
import { prisma, getCandidateAvailability } from '@conference/db'
import { requireStaff, engineErrorResponse } from '@/lib/staff-api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ sponsorId: string }> }) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  await params // sponsorId is implied by the request; kept for route symmetry
  const requestId = new URL(req.url).searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
  try {
    const availability = await getCandidateAvailability(prisma, requestId)
    return NextResponse.json(availability)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
