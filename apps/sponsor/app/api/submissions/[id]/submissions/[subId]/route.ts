import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const { id, subId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Company from the database, not the session token. Phase 6.5.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused
  if (!companyId) return NextResponse.json({ error: 'No sponsor' }, { status: 403 })

  // Verify the form belongs to this sponsor
  const form = await prisma.submissionForm.findFirst({
    where: { id, sponsorId: companyId },
  })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { status } = await req.json()
  const VALID = ['PENDING', 'REVIEWED', 'ACCEPTED', 'REJECTED']
  if (!VALID.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  // THE TWO IDENTIFIERS IN THIS ADDRESS ARE A PAIR AND MUST BE CHECKED AS ONE.
  //
  // The check above proves the FORM is the caller's. Until Phase 6.5 the write
  // below then found the response by its own identifier alone, so the two parts
  // of the address were validated independently and a caller could combine
  // their own form with somebody else's response.
  //
  // Measured on 2026-08-01 with two representatives EACH CORRECTLY SIGNED IN AT
  // THEIR OWN COMPANY — no stale session, nothing to do with the token defect
  // this phase mainly addresses:
  //
  //   company A sends its own form id + company B's response id
  //     -> 200 {"ok":true}, company B's response PENDING -> ACCEPTED
  //   control, company A's own response
  //     -> 200, PENDING -> REVIEWED   (so the call itself works)
  //
  // Scoping the write to the form closes it. `updateMany` rather than `update`
  // because a compound condition cannot be expressed in a `where` that requires
  // a unique key, and because a non-matching `update` throws where this must
  // answer 404 — the same answer the form check above already gives, so the two
  // ways of getting the pair wrong are indistinguishable to a caller and
  // neither confirms that somebody else's response exists.
  const changed = await prisma.formSubmission.updateMany({
    where: { id: subId, formId: id },
    data: { status },
  })
  if (changed.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
