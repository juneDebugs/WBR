import { NextResponse } from 'next/server'
import { prisma, assignMeeting } from '@conference/db'
import { requireStaff, engineErrorResponse } from '@/lib/staff-api'

export async function POST(req: Request) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const body = await req.json().catch(() => null)
  if (!body?.requestId || !body?.timeBlockId || !body?.room) {
    return NextResponse.json({ error: 'requestId, timeBlockId and room are required' }, { status: 400 })
  }
  try {
    const meeting = await assignMeeting(prisma, {
      requestId: body.requestId,
      timeBlockId: body.timeBlockId,
      room: body.room,
      repId: body.repId ?? null,
    })
    return NextResponse.json({ ok: true, meeting })
  } catch (err) {
    return engineErrorResponse(err)
  }
}
