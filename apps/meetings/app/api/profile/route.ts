import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { prisma } from '@conference/db'

const MAX_LEN = 1000

/**
 * Save a person's own profile.
 *
 * NOT GUARDED BY THE ONBOARDING GATE, deliberately and permanently. This is the
 * address the checklist at /onboarding writes through, so guarding it would trap
 * every incomplete person behind a form that cannot save. The same exclusion is
 * written down in the other two applications for the same reason. See
 * lib/require-complete-profile.ts.
 *
 * ── Two changes made when the checklist arrived (UF-30) ──────────────────────
 *
 * `name` is accepted. It was not read from the request at all before, so a name
 * sent here was discarded in silence — consistent with the screen in front of
 * it, since ProfileForm.tsx has never offered a name box. The checklist must
 * write one: `name` is one of the six fields in the delegate required set, and a
 * person blocked on it has nowhere else in this portal to supply it.
 *
 * Only the fields the request actually carries are written. The two solutions
 * lists used to be converted to an explicit `null` whenever the request left
 * them out, while every other field relied on Prisma treating an absent value as
 * "no change". No caller reached that erase — the profile screen sends its whole
 * form every time — but the checklist sends the six required fields and nothing
 * else, so it would have blanked a stored `solutionsOffering` as a side effect
 * of completing onboarding. The safety belongs here rather than in a rule each
 * future caller has to know.
 */
export async function PATCH(req: Request) {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = user.id

  // The body must be a plain object before anything asks what is in it.
  //
  // This address is the ONE the onboarding guard deliberately leaves open, so
  // anybody with a session reaches it, including someone the rest of the portal
  // refuses. It used to destructure whatever `req.json()` returned: a body of
  // `null` threw and answered 500, and a bare array or number answered 200 while
  // writing nothing at all — a success that changed nothing, which is the worse
  // of the two. Both now answer 400 naming what arrived.
  const body = await req.json().catch(() => null)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 })
  }

  const { name, company, jobTitle, companySize, annualRevenue, solutionsOffering, solutionsSeeking, website, bio, image } = body

  // Validate string lengths
  for (const [key, val] of Object.entries({ name, company, jobTitle, website, bio, image })) {
    if (val !== undefined && typeof val === 'string' && val.length > MAX_LEN) {
      return NextResponse.json({ error: `${key} too long` }, { status: 400 })
    }
  }

  // Validate arrays.
  //
  // Every element must be a string, not just the container. A list of anything
  // else is stored happily and then read back by the onboarding policy, which
  // drops non-strings — so `{"solutionsSeeking": [123]}` used to answer 200 while
  // leaving the person exactly as blocked as before, with a save that appeared to
  // work. A save that succeeds must mean the gate agrees.
  for (const [key, val] of Object.entries({ solutionsOffering, solutionsSeeking })) {
    if (val === undefined) continue
    if (!Array.isArray(val)) {
      return NextResponse.json({ error: `${key} must be an array` }, { status: 400 })
    }
    if (!val.every(item => typeof item === 'string')) {
      return NextResponse.json({ error: `${key} must contain only strings` }, { status: 400 })
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    // Spread each field only when the request carried it. `undefined` reaching
    // Prisma means "leave this column alone", so an omitted field is untouched
    // and a field sent as null is cleared on purpose.
    //
    // The two lists are stringified without a null branch because the checks
    // above already refused anything that is not an array with a 400 — a list
    // sent as null never reaches this line.
    data: {
      ...(name !== undefined && { name }),
      ...(company !== undefined && { company }),
      ...(jobTitle !== undefined && { jobTitle }),
      ...(companySize !== undefined && { companySize }),
      ...(annualRevenue !== undefined && { annualRevenue }),
      ...(solutionsOffering !== undefined && { solutionsOffering: JSON.stringify(solutionsOffering) }),
      ...(solutionsSeeking !== undefined && { solutionsSeeking: JSON.stringify(solutionsSeeking) }),
      ...(website !== undefined && { website }),
      ...(bio !== undefined && { bio }),
      ...(image !== undefined && { image }),
    },
    // Never serialize the full User row — it carries the password hash,
    // pushToken and loginCount. Mirror the profile page reader's safe field set.
    select: {
      id: true, name: true, email: true, image: true, company: true, jobTitle: true,
      bio: true, website: true, companySize: true, annualRevenue: true,
      solutionsOffering: true, solutionsSeeking: true,
    },
  })
  revalidateTag(`meetings-user-${userId}`)
  return NextResponse.json(updated)
}
