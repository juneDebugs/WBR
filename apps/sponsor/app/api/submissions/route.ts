import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // THE COMPANY COMES FROM THE GUARD, WHICH READ IT FROM THE DATABASE.
  // It used to be `user.sponsorId` off the session token, which is written at
  // sign-in and never updated while this app can move a person between
  // companies mid-session — so a moved representative was shown the forms of
  // the company they had left. Phase 6.5.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused
  if (!companyId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  const forms = await prisma.submissionForm.findMany({
    where: { sponsorId: companyId },
    include: { _count: { select: { submissions: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(forms)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // WHICH COMPANY THE NEW FORM BELONGS TO. From the database, not the token:
  // a representative moved between companies mid-session was creating forms
  // owned by the company they had left. Measured before the change. Phase 6.5.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused
  if (!companyId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  const { title, type, description, fields, deadline } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const form = await prisma.submissionForm.create({
    data: {
      sponsorId: companyId,
      title: title.trim(),
      type: type ?? 'ABSTRACT',
      description: description?.trim() ?? null,
      fields: JSON.stringify(fields ?? []),
      deadline: deadline ? new Date(deadline) : null,
    },
    include: { _count: { select: { submissions: true } } },
  })
  // The cache tag follows the same company the write did. Left on the token
  // value this would clear the previous company's cache and leave the new
  // company's stale — the write correct and the screen wrong.
  revalidateTag(`submissions-${companyId}`)

  return NextResponse.json(form)
}
