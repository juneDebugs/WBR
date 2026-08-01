import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Company from the database, not the session token. Phase 6.5.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused
  if (!companyId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  const form = await prisma.submissionForm.findFirst({
    where: { id, sponsorId: companyId },
    include: { submissions: { orderBy: { createdAt: 'desc' } } },
  })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(form)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Company from the database, not the session token. Phase 6.5.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused
  if (!companyId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  // A REFUSAL HAS TO BE VISIBLE, so the ownership question is asked before the
  // write rather than folded into it. Phase 6.5, decided after measuring.
  //
  // This used to be a single `updateMany` filtered by company, which protected
  // the data and answered `200 {"ok":true,"count":0}` when the form belonged to
  // somebody else — a success-shaped answer for a request that did nothing, and
  // invisible to any assertion on status. `404` is what GET above already
  // answers for this exact case, and what the response-status address one
  // directory down already answers, so this applies an existing rule rather
  // than inventing one. Verified before changing: the portal's own screen
  // (components/SubmissionsView.tsx) tests only `res.ok` and never reads
  // `count`, so it keeps behaving correctly.
  const owned = await prisma.submissionForm.findFirst({
    where: { id, sponsorId: companyId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const allowed = ['title', 'type', 'description', 'fields', 'isOpen', 'deadline']
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      if (key === 'fields') data[key] = JSON.stringify(body[key])
      else if (key === 'deadline') data[key] = body[key] ? new Date(body[key]) : null
      else data[key] = body[key]
    }
  }

  // Still scoped by company as well as by id. The ownership check above and the
  // filter here are not redundant: the check makes the refusal observable, the
  // filter is what makes the write itself safe if the two ever drift apart.
  const form = await prisma.submissionForm.updateMany({
    where: { id, sponsorId: companyId },
    data,
  })
  revalidateTag(`submissions-${companyId}`)
  return NextResponse.json({ ok: true, count: form.count })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Company from the database, not the session token. Phase 6.5.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused
  if (!companyId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  // Same reasoning as PATCH above: `deleteMany` alone answered `200 {"ok":true}`
  // for another company's form and left it in place, which reads as a success.
  // Asked first so the refusal is something a caller and a test can see.
  const owned = await prisma.submissionForm.findFirst({
    where: { id, sponsorId: companyId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.submissionForm.deleteMany({ where: { id, sponsorId: companyId } })
  revalidateTag(`submissions-${companyId}`)
  return NextResponse.json({ ok: true })
}
