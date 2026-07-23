import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma } from '@conference/db'
import { requireStaff } from '@/lib/staff-api'
import { invalidate } from '@/lib/mem-cache'

// PATCH — move a request through review: PENDING -> APPROVED (into the bank) or
// REJECTED. Scheduling itself is handled by /api/staff/meetings/assign.
const REVIEW_STATUSES = ['APPROVED', 'REJECTED', 'PENDING']

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { id } = await params
  const body = await req.json().catch(() => null)
  const status = body?.status
  if (!status || !REVIEW_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'status must be APPROVED, REJECTED or PENDING' }, { status: 400 })
  }

  const existing = await prisma.meetingRequest.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  // Review only moves PENDING requests. A CONFIRMED request has a live meeting;
  // flipping its status here would orphan the SponsorMeeting — cancel it instead.
  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: `Cannot review a ${existing.status} request`, code: 'BAD_STATUS' }, { status: 409 })
  }

  const updated = await prisma.meetingRequest.update({
    where: { id },
    data: { status },
    select: { id: true, status: true, requesterId: true, targetUserId: true },
  })
  invalidate(updated.requesterId)
  if (updated.targetUserId) invalidate(updated.targetUserId)
  revalidateTag('meetings')
  return NextResponse.json({ ok: true, request: updated })
}
