import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { roleHasPermission } from '@/lib/api-permission'

const ADMIN_ROLES = new Set(['STAFF', 'ORGANIZER', 'ADMIN'])

const USER_CHECKLIST: { key: string; label: string; check: (u: any) => boolean }[] = [
  { key: 'name',      label: 'Full name',           check: u => !!u.name },
  { key: 'jobTitle',  label: 'Job title',            check: u => !!u.jobTitle },
  { key: 'company',   label: 'Company',              check: u => !!u.company },
  { key: 'bio',       label: 'Bio',                  check: u => !!u.bio && u.bio.length > 10 },
  { key: 'image',     label: 'Profile photo',        check: u => !!u.image },
  { key: 'solutions', label: 'Solutions seeking',    check: u => { try { return JSON.parse(u.solutionsSeeking || '[]').length > 0 } catch { return false } } },
]

const SPONSOR_CHECKLIST: { key: string; label: string; check: (s: any) => boolean }[] = [
  { key: 'logo',        label: 'Logo',                   check: s => !!s.logoUrl },
  { key: 'tagline',     label: 'Tagline',                check: s => !!s.tagline },
  { key: 'description', label: 'Description',            check: s => !!s.description && s.description.length > 20 },
  { key: 'contact',     label: 'Contact name & email',   check: s => !!s.contactName && !!s.contactEmail },
  { key: 'booth',       label: 'Booth number',           check: s => !!s.boothNumber },
  { key: 'solutions',   label: 'Solutions / offerings',  check: s => { try { return JSON.parse(s.solutionsOffering || '[]').length > 0 } catch { return false } } },
  { key: 'teammates',   label: 'Team member assigned',   check: s => s._count.users > 0 },
  { key: 'meetings',    label: 'Meeting slot scheduled', check: s => s._count.meetings > 0 },
  { key: 'website',     label: 'Website',                check: s => !!s.website },
  { key: 'social',      label: 'Social media link',      check: s => !!s.socialLinkedIn || !!s.socialTwitter },
]

const getCachedEmailData = unstable_cache(
  async () => {
    const [usersRaw, emails, sponsorsRaw] = await Promise.all([
      prisma.user.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, email: true, role: true, image: true,
          company: true, jobTitle: true, bio: true,
          solutionsSeeking: true, sponsorId: true,
        },
      }),
      prisma.emailLog.findMany({ orderBy: { sentAt: 'desc' }, take: 500 }),
      prisma.sponsor.findMany({
        select: {
          id: true, name: true, tier: true,
          logoUrl: true, tagline: true, description: true,
          contactName: true, contactEmail: true, boothNumber: true,
          solutionsOffering: true, website: true,
          socialLinkedIn: true, socialTwitter: true,
          _count: { select: { users: true, meetings: true } },
        },
      }),
    ])

    const sponsorMap = new Map(sponsorsRaw.map(s => [s.id, s]))
    const emailCountMap = new Map<string, number>()
    for (const e of emails) {
      emailCountMap.set(e.to, (emailCountMap.get(e.to) ?? 0) + 1)
    }

    const users = usersRaw.map(u => {
      const missingProfile = USER_CHECKLIST.filter(c => !c.check(u)).map(c => c.label)
      const sponsor = u.sponsorId ? sponsorMap.get(u.sponsorId) : null
      const missingAssets = sponsor ? SPONSOR_CHECKLIST.filter(c => !c.check(sponsor)).map(c => c.label) : []
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: u.role,
        company: u.company,
        jobTitle: u.jobTitle,
        emailCount: u.email ? (emailCountMap.get(u.email) ?? 0) : 0,
        isSponsor: !!u.sponsorId,
        missingProfile,
        missingAssets,
      }
    })

    const emailList = emails.map(e => {
      const sponsor = e.sponsorId ? sponsorMap.get(e.sponsorId) : null
      return {
        id: e.id,
        to: e.to,
        subject: e.subject,
        body: e.body,
        status: e.status,
        direction: 'OUTBOUND',
        sentAt: typeof e.sentAt === 'string' ? e.sentAt : e.sentAt.toISOString(),
        sponsorName: sponsor?.name ?? null,
        sponsorTier: sponsor?.tier ?? null,
      }
    })

    return { users, emails: emailList }
  },
  ['web-email-data'],
  { revalidate: 60, tags: ['attendees', 'sponsors'] },
)

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = token.role as string
  if (!ADMIN_ROLES.has(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!(await roleHasPermission(role, 'email'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const data = await getCachedEmailData()
  return NextResponse.json(data)
}
