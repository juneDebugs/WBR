import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const { id, subId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!user.sponsorId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  // Verify the form belongs to this sponsor
  const form = await prisma.submissionForm.findFirst({
    where: { id, sponsorId: user.sponsorId },
  })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { status } = await req.json()
  const VALID = ['PENDING', 'REVIEWED', 'ACCEPTED', 'REJECTED']
  if (!VALID.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  await prisma.formSubmission.update({
    where: { id: subId },
    data: { status },
  })
  return NextResponse.json({ ok: true })
}
